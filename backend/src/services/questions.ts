import type { QuestionDto, QuestionInput } from '@rush/shared';
import { LIMITS, normalizeTextAnswer } from '@rush/shared';
import { db, transaction, type DbOrTx, type Tx } from '../db';
import { badRequest, conflict, notFound } from '../http/errors';
import { isOwnStorageUrl } from '../integrations/storage';
import { requireQuizEditor } from './permissions';

export async function touchQuiz(q: DbOrTx, quizId: number): Promise<void> {
  await q.updateTable('quiz').set({ updated_at: new Date() }).where('quiz_id', '=', quizId).execute();
}

/** Loads full question data (including correct answers) — only for editors and the session engine. */
export async function loadQuestions(quizId: number, q: DbOrTx = db): Promise<QuestionDto[]> {
  const questions = await q
    .selectFrom('question as qu')
    .select((eb) => [
      'qu.question_id', 'qu.question_text', 'qu.question_type', 'qu.point_value',
      'qu.display_order', 'qu.correct_text_answer',
      eb.exists(eb.selectFrom('user_answer as ua').select('ua.user_answer_id').whereRef('ua.question_id', '=', 'qu.question_id')).as('locked'),
    ])
    .where('qu.quiz_id', '=', quizId)
    .orderBy('qu.display_order')
    .execute();
  if (questions.length === 0) return [];
  const ids = questions.map((x) => x.question_id);
  const [options, pairs, media] = await Promise.all([
    q.selectFrom('answer_option').select(['option_id', 'question_id', 'option_text', 'is_correct', 'display_order'])
      .where('question_id', 'in', ids).orderBy('display_order').execute(),
    q.selectFrom('matching_pair').select(['pair_id', 'question_id', 'left_item', 'right_item', 'display_order'])
      .where('question_id', 'in', ids).orderBy('display_order').execute(),
    q.selectFrom('question_media').select(['media_id', 'question_id', 'media_type', 'media_url'])
      .where('question_id', 'in', ids).orderBy('media_id').execute(),
  ]);
  return questions.map((x) => {
    const m = media.find((md) => md.question_id === x.question_id);
    return {
      questionId: x.question_id,
      questionText: x.question_text,
      questionType: x.question_type,
      pointValue: x.point_value,
      displayOrder: x.display_order,
      correctTextAnswer: x.correct_text_answer,
      options: options.filter((o) => o.question_id === x.question_id)
        .map((o) => ({ optionId: o.option_id, text: o.option_text, isCorrect: o.is_correct, displayOrder: o.display_order })),
      pairs: pairs.filter((p) => p.question_id === x.question_id)
        .map((p) => ({ pairId: p.pair_id, left: p.left_item, right: p.right_item, displayOrder: p.display_order })),
      media: m ? { mediaId: m.media_id, mediaType: m.media_type, mediaUrl: m.media_url } : null,
      locked: Boolean(x.locked),
    };
  });
}

/** Videos must come from our storage (validated ≤720p on upload, A-31); external media must be https. */
function validateMedia(input: QuestionInput): void {
  const media = input.media;
  if (!media) return;
  const own = isOwnStorageUrl(media.mediaUrl);
  if (media.mediaType === 'VIDEO' && !own) {
    throw badRequest('video_upload_required', 'Videos must be uploaded so their resolution (max 720p) can be verified');
  }
  if (!own && !media.mediaUrl.startsWith('https://')) {
    throw badRequest('https_required', 'External media must use an https:// URL');
  }
}

async function insertChildren(tx: Tx, questionId: number, input: QuestionInput): Promise<void> {
  if (input.questionType === 'MULTIPLE_CHOICE') {
    await tx.insertInto('answer_option').values(
      input.options.map((o, i) => ({ question_id: questionId, option_text: o.text, is_correct: o.isCorrect, display_order: i + 1 })),
    ).execute();
  } else if (input.questionType === 'TRUE_FALSE') {
    await tx.insertInto('answer_option').values([
      { question_id: questionId, option_text: 'TRUE', is_correct: input.correctAnswer, display_order: 1 },
      { question_id: questionId, option_text: 'FALSE', is_correct: !input.correctAnswer, display_order: 2 },
    ]).execute();
  } else if (input.questionType === 'MATCHING') {
    await tx.insertInto('matching_pair').values(
      input.pairs.map((p, i) => ({ question_id: questionId, left_item: p.left, right_item: p.right, display_order: i + 1 })),
    ).execute();
  }
  if (input.media) {
    await tx.insertInto('question_media').values({ question_id: questionId, media_type: input.media.mediaType, media_url: input.media.mediaUrl }).execute();
  }
}

function correctText(input: QuestionInput): string | null {
  return input.questionType === 'OPEN_ANSWER' || input.questionType === 'FILL_IN_THE_BLANK'
    ? normalizeTextAnswer(input.correctTextAnswer) // stored lowercase (design)
    : null;
}

async function isLocked(q: DbOrTx, questionId: number): Promise<boolean> {
  const row = await q.selectFrom('user_answer').select('user_answer_id').where('question_id', '=', questionId).limit(1).executeTakeFirst();
  return !!row;
}

const lockedError = () =>
  conflict('question_locked', 'This question has recorded answers and cannot be changed (it would alter historical results)');

async function questionQuiz(questionId: number): Promise<number> {
  const row = await db.selectFrom('question').select('quiz_id').where('question_id', '=', questionId).executeTakeFirst();
  if (!row) throw notFound('Question');
  return row.quiz_id;
}

export async function createQuestion(quizId: number, userId: number, input: QuestionInput): Promise<number> {
  await requireQuizEditor(quizId, userId);
  validateMedia(input);
  return transaction(async (tx) => {
    await tx.selectFrom('quiz').select('quiz_id').where('quiz_id', '=', quizId).forUpdate().executeTakeFirstOrThrow();
    const { n, maxOrder } = await tx
      .selectFrom('question')
      .select((eb) => [eb.fn.countAll<number>().as('n'), eb.fn.max('display_order').as('maxOrder')])
      .where('quiz_id', '=', quizId)
      .forUpdate()
      .executeTakeFirstOrThrow();
    if (Number(n) >= LIMITS.maxQuestionsPerQuiz) {
      throw conflict('question_limit', `A quiz can contain at most ${LIMITS.maxQuestionsPerQuiz} questions`);
    }
    const res = await tx
      .insertInto('question')
      .values({
        quiz_id: quizId,
        question_text: input.questionText,
        question_type: input.questionType,
        point_value: input.pointValue,
        display_order: Number(maxOrder ?? 0) + 1,
        correct_text_answer: correctText(input),
      })
      .executeTakeFirstOrThrow();
    const questionId = Number(res.insertId);
    await insertChildren(tx, questionId, input);
    await touchQuiz(tx, quizId);
    return questionId;
  });
}

export async function updateQuestion(questionId: number, userId: number, input: QuestionInput): Promise<void> {
  const quizId = await questionQuiz(questionId);
  await requireQuizEditor(quizId, userId);
  validateMedia(input);
  await transaction(async (tx) => {
    await tx.selectFrom('question').select('question_id').where('question_id', '=', questionId).forUpdate().executeTakeFirstOrThrow();
    if (await isLocked(tx, questionId)) throw lockedError();
    await tx.deleteFrom('answer_option').where('question_id', '=', questionId).execute();
    await tx.deleteFrom('matching_pair').where('question_id', '=', questionId).execute();
    await tx.deleteFrom('question_media').where('question_id', '=', questionId).execute();
    await tx
      .updateTable('question')
      .set({
        question_text: input.questionText,
        question_type: input.questionType,
        point_value: input.pointValue,
        correct_text_answer: correctText(input),
      })
      .where('question_id', '=', questionId)
      .execute();
    await insertChildren(tx, questionId, input);
    await touchQuiz(tx, quizId);
  });
}

export async function deleteQuestion(questionId: number, userId: number): Promise<void> {
  const quizId = await questionQuiz(questionId);
  await requireQuizEditor(quizId, userId);
  await transaction(async (tx) => {
    await tx.selectFrom('quiz').select('quiz_id').where('quiz_id', '=', quizId).forUpdate().executeTakeFirstOrThrow();
    const q = await tx.selectFrom('question').select('display_order').where('question_id', '=', questionId).executeTakeFirst();
    if (!q) throw notFound('Question');
    if (await isLocked(tx, questionId)) throw lockedError();
    await tx.deleteFrom('question').where('question_id', '=', questionId).execute();
    // Close the gap one row at a time in ascending order so UNIQUE(quiz_id, display_order) holds at every step.
    const rest = await tx
      .selectFrom('question')
      .select(['question_id', 'display_order'])
      .where('quiz_id', '=', quizId)
      .where('display_order', '>', q.display_order)
      .orderBy('display_order')
      .execute();
    for (const r of rest) {
      await tx.updateTable('question').set({ display_order: r.display_order - 1 }).where('question_id', '=', r.question_id).execute();
    }
    const { n } = await tx.selectFrom('question').select((eb) => eb.fn.countAll<number>().as('n')).where('quiz_id', '=', quizId).executeTakeFirstOrThrow();
    // A published quiz must have at least one question.
    if (Number(n) === 0) await tx.updateTable('quiz').set({ quiz_status: 'DRAFT' }).where('quiz_id', '=', quizId).execute();
    await touchQuiz(tx, quizId);
  });
}

/**
 * Moves a question to a new position. Uses the free slot 25 as a temporary position because the
 * schema checks display_order ∈ 1..25 and uniqueness row by row (A-33).
 */
export async function moveQuestion(questionId: number, userId: number, newOrder: number): Promise<void> {
  const quizId = await questionQuiz(questionId);
  await requireQuizEditor(quizId, userId);
  await transaction(async (tx) => {
    await tx.selectFrom('quiz').select('quiz_id').where('quiz_id', '=', quizId).forUpdate().executeTakeFirstOrThrow();
    const rows = await tx.selectFrom('question').select(['question_id', 'display_order']).where('quiz_id', '=', quizId).orderBy('display_order').execute();
    const n = rows.length;
    const from = rows.find((r) => r.question_id === questionId)!.display_order;
    if (newOrder < 1 || newOrder > n) throw badRequest('invalid_position', `Position must be between 1 and ${n}`);
    if (newOrder === from) return;
    const temp = LIMITS.maxQuestionsPerQuiz;
    if (n >= temp) throw conflict('reorder_unavailable', 'Questions cannot be reordered when the quiz has 25 questions');
    await tx.updateTable('question').set({ display_order: temp }).where('question_id', '=', questionId).execute();
    if (newOrder > from) {
      for (let o = from + 1; o <= newOrder; o++) {
        await tx.updateTable('question').set({ display_order: o - 1 }).where('quiz_id', '=', quizId).where('display_order', '=', o).execute();
      }
    } else {
      for (let o = from - 1; o >= newOrder; o--) {
        await tx.updateTable('question').set({ display_order: o + 1 }).where('quiz_id', '=', quizId).where('display_order', '=', o).execute();
      }
    }
    await tx.updateTable('question').set({ display_order: newOrder }).where('question_id', '=', questionId).execute();
    await touchQuiz(tx, quizId);
  });
}

/*
=========================================================
EXPLICACIÓN DEL ARCHIVO
=========================================================

Propósito: Contiene la lógica de preguntas y sus respuestas: carga, creación, edición, borrado y
reordenamiento.

Responsabilidades principales:
- loadQuestions: lee question, answer_option, matching_pair y question_media y calcula si cada
  pregunta está bloqueada (tiene respuestas registradas).
- createQuestion: máximo 25 por cuestionario; asigna display_order y crea las filas hijas según el
  tipo.
- updateQuestion: reemplaza opciones, pares y medios; rechazada si la pregunta ya se jugó.
- deleteQuestion: cierra el hueco de display_order fila a fila; si no quedan preguntas, el
  cuestionario vuelve a DRAFT.
- moveQuestion: usa la posición 25 como temporal; no funciona con exactamente 25 preguntas.

Elementos importantes:
- touchQuiz
- loadQuestions
- createQuestion
- updateQuestion
- deleteQuestion
- moveQuestion
- validateMedia, insertChildren, correctText (internas)

Dependencias:
- db/index.ts
- http/errors.ts
- integrations/storage.ts
- services/permissions.ts
- @rush/shared

Flujo de datos:
Recibe preguntas validadas (QuestionInput) y escribe las tablas question, answer_option,
matching_pair y question_media.

Aspectos técnicos importantes:
- Opción múltiple: filas answer_option con una sola is_correct = TRUE. Verdadero/falso: dos filas
  "TRUE" y "FALSE".
- Respuesta abierta y completar: correct_text_answer en minúsculas. Emparejamiento: filas
  matching_pair.
- Las preguntas con respuestas registradas no se pueden editar ni borrar para que el historial sea
  coherente (A-7).
- Los videos deben venir del almacenamiento propio y los medios externos deben usar https.

Lugar en la arquitectura:
Capa de servicios. Define cómo se almacenan preguntas y respuestas correctas.
*/
