import type { QuizDetailDto, QuizSummaryDto } from '@rush/shared';
import { LIMITS, questionInputSchema, type quizInputSchema, type quizUpdateSchema } from '@rush/shared';
import type { z } from 'zod';
import { db, mysqlErrorCode, transaction } from '../db';
import { badRequest, conflict, notFound } from '../http/errors';
import { emails } from '../integrations/mailer';
import { hooks } from './hooks';
import { getQuizAccess, requireQuizEditor, requireQuizOwner, requireRoomManager } from './permissions';
import { loadQuestions } from './questions';
import { toPublicUser } from './users';

function summarySelect() {
  return db
    .selectFrom('quiz as q')
    .innerJoin('user as u', 'u.user_id', 'q.creator_user_id')
    .select((eb) => [
      'q.quiz_id', 'q.title', 'q.description', 'q.quiz_status', 'q.is_in_library', 'q.creator_user_id', 'q.total_time_limit_seconds', 'q.created_at', 'q.updated_at', 'u.username',
      eb.selectFrom('question as qu').select(eb.fn.countAll<number>().as('n')).whereRef('qu.quiz_id', '=', 'q.quiz_id').as('question_count'),
    ]);
}
type SummaryRow = Awaited<ReturnType<ReturnType<typeof summarySelect>['executeTakeFirstOrThrow']>>;

const toSummary = (r: SummaryRow, userId: number): QuizSummaryDto => ({
  quizId: r.quiz_id,
  title: r.title,
  description: r.description,
  status: r.quiz_status,
  isInLibrary: r.is_in_library,
  creatorUserId: r.creator_user_id,
  creatorUsername: r.username,
  isOwner: r.creator_user_id === userId,
  questionCount: Number(r.question_count ?? 0),
  totalTimeLimitSeconds: r.total_time_limit_seconds,
  createdAt: r.created_at.toISOString(),
  updatedAt: r.updated_at.toISOString(),
});

/** Personal library: own library quizzes + quizzes shared with the user as collaborator. */
export async function listLibrary(userId: number): Promise<{ owned: QuizSummaryDto[]; shared: QuizSummaryDto[]; ownedTotal: number }> {
  const owned = await summarySelect().where('q.creator_user_id', '=', userId).where('q.is_in_library', '=', true).orderBy('q.updated_at', 'desc').execute();
  const shared = await summarySelect()
    .innerJoin('quiz_collaborator as c', 'c.quiz_id', 'q.quiz_id')
    .where('c.user_id', '=', userId)
    .orderBy('q.updated_at', 'desc')
    .execute();
  const { n } = await db.selectFrom('quiz').select((eb) => eb.fn.countAll<number>().as('n')).where('creator_user_id', '=', userId).executeTakeFirstOrThrow();
  return { owned: owned.map((r) => toSummary(r, userId)), shared: shared.map((r) => toSummary(r, userId)), ownedTotal: Number(n) };
}

/** Quizzes the user may add to a room (owned or collaborated, any library flag). */
export async function listEditableQuizzes(userId: number): Promise<QuizSummaryDto[]> {
  const rows = await summarySelect()
    .leftJoin('quiz_collaborator as c', (j) => j.onRef('c.quiz_id', '=', 'q.quiz_id').on('c.user_id', '=', userId))
    .where((eb) => eb.or([eb('q.creator_user_id', '=', userId), eb('c.user_id', '=', userId)]))
    .orderBy('q.title')
    .execute();
  return rows.map((r) => toSummary(r, userId));
}

/**
 * Creates a quiz (max 15 per creator). With roomId the quiz is created from inside a room:
 * is_in_library = FALSE and it is linked to the room in the same transaction (A-3).
 */
export async function createQuiz(userId: number, input: z.infer<typeof quizInputSchema>, roomId?: number): Promise<number> {
  if (roomId !== undefined) await requireRoomManager(roomId, userId);
  const quizId = await transaction(async (tx) => {
    await tx.selectFrom('user').select('user_id').where('user_id', '=', userId).forUpdate().executeTakeFirstOrThrow();
    const { n } = await tx.selectFrom('quiz').select((eb) => eb.fn.countAll<number>().as('n')).where('creator_user_id', '=', userId).forUpdate().executeTakeFirstOrThrow();
    if (Number(n) >= LIMITS.maxQuizzesPerUser) {
      throw conflict('quiz_limit', `You can create at most ${LIMITS.maxQuizzesPerUser} quizzes`);
    }
    const res = await tx
      .insertInto('quiz')
      .values({ creator_user_id: userId, title: input.title, description: input.description, total_time_limit_seconds: input.totalTimeLimitSeconds, is_in_library: roomId === undefined })
      .executeTakeFirstOrThrow();
    const id = Number(res.insertId);
    if (roomId !== undefined) await tx.insertInto('room_quiz').values({ room_id: roomId, quiz_id: id }).execute();
    return id;
  });
  if (roomId !== undefined) {
    const info = await db.selectFrom('room').select('name').where('room_id', '=', roomId).executeTakeFirst();
    const members = await db
      .selectFrom('room_membership as m').innerJoin('user as u', 'u.user_id', 'm.user_id')
      .select('u.email').where('m.room_id', '=', roomId).where('m.user_id', '!=', userId).execute();
    for (const m of members) emails.quizAdded(m.email, info?.name ?? '', input.title, roomId);
  }
  return quizId;
}

export async function getQuizDetail(quizId: number, userId: number): Promise<QuizDetailDto> {
  await requireQuizEditor(quizId, userId);
  const r = await summarySelect().where('q.quiz_id', '=', quizId).executeTakeFirstOrThrow();
  const [questions, collaborators, rooms] = await Promise.all([
    loadQuestions(quizId),
    db.selectFrom('quiz_collaborator as c').innerJoin('user as u', 'u.user_id', 'c.user_id')
      .select(['u.user_id', 'u.full_name', 'u.username', 'u.profile_picture_url', 'u.description', 'u.learning_language'])
      .where('c.quiz_id', '=', quizId).orderBy('c.added_at').execute(),
    // only rooms the requesting user is a member of (rooms are private)
    db.selectFrom('room_quiz as rq').innerJoin('room as ro', 'ro.room_id', 'rq.room_id')
      .innerJoin('room_membership as m', (j) => j.onRef('m.room_id', '=', 'ro.room_id').on('m.user_id', '=', userId))
      .select(['ro.room_id', 'ro.name']).where('rq.quiz_id', '=', quizId).orderBy('ro.name').execute(),
  ]);
  return {
    ...toSummary(r, userId),
    questions,
    collaborators: collaborators.map(toPublicUser),
    rooms: rooms.map((x) => ({ roomId: x.room_id, name: x.name })),
  };
}

export async function updateQuiz(quizId: number, userId: number, input: z.infer<typeof quizUpdateSchema>): Promise<void> {
  await requireQuizEditor(quizId, userId);
  const values = {
    ...(input.title !== undefined && { title: input.title }),
    ...(input.description !== undefined && { description: input.description }),
    ...(input.totalTimeLimitSeconds !== undefined && { total_time_limit_seconds: input.totalTimeLimitSeconds }),
  };
  if (Object.keys(values).length === 0) return;
  await db.updateTable('quiz').set(values).where('quiz_id', '=', quizId).execute();
}

/** Publishing requires ≥1 question and every question to have a complete correct answer. */
export async function setQuizStatus(quizId: number, userId: number, status: 'DRAFT' | 'PUBLISHED'): Promise<void> {
  await requireQuizEditor(quizId, userId);
  if (status === 'PUBLISHED') {
    const questions = await loadQuestions(quizId);
    if (questions.length === 0) throw badRequest('no_questions', 'Add at least one question before publishing');
    const invalid = questions.filter((q) => !questionInputSchema.safeParse(dtoToInput(q)).success);
    if (invalid.length > 0) {
      throw badRequest('incomplete_questions', 'Some questions are incomplete', invalid.map((q) => q.displayOrder));
    }
  } else {
    const active = await db.selectFrom('quiz_session').select('session_id').where('quiz_id', '=', quizId).where('active_flag', '=', 1).executeTakeFirst();
    if (active) throw conflict('session_active', 'This quiz is being played right now');
  }
  await db.updateTable('quiz').set({ quiz_status: status }).where('quiz_id', '=', quizId).execute();
}

/** Rebuilds the editor input shape from stored rows (used to re-validate before publishing). */
export function dtoToInput(q: Awaited<ReturnType<typeof loadQuestions>>[number]): unknown {
  const base = {
    questionText: q.questionText,
    pointValue: q.pointValue,
    media: q.media ? { mediaType: q.media.mediaType, mediaUrl: q.media.mediaUrl } : null,
  };
  switch (q.questionType) {
    case 'MULTIPLE_CHOICE':
      return { ...base, questionType: q.questionType, options: q.options.map((o) => ({ text: o.text, isCorrect: o.isCorrect })) };
    case 'TRUE_FALSE':
      return { ...base, questionType: q.questionType, correctAnswer: q.options.find((o) => o.isCorrect)?.text === 'TRUE' };
    case 'OPEN_ANSWER':
    case 'FILL_IN_THE_BLANK':
      return { ...base, questionType: q.questionType, correctTextAnswer: q.correctTextAnswer ?? '' };
    case 'MATCHING':
      return { ...base, questionType: q.questionType, pairs: q.pairs.map((p) => ({ left: p.left, right: p.right })) };
  }
}

/** Only the owner deletes a quiz. Its sessions/history are removed by the FK cascade (design decision 9). */
export async function deleteQuiz(quizId: number, userId: number): Promise<void> {
  await requireQuizOwner(quizId, userId);
  hooks.beforeRoomsOrQuizzesDeleted([], [quizId]);
  await db.deleteFrom('quiz').where('quiz_id', '=', quizId).execute();
}

export async function addCollaborator(quizId: number, ownerId: number, username: string): Promise<void> {
  await requireQuizOwner(quizId, ownerId);
  const u = await db.selectFrom('user').select('user_id').where('username', '=', username).executeTakeFirst();
  if (!u) throw notFound('User');
  if (u.user_id === ownerId) throw badRequest('owner_not_collaborator', 'The owner cannot be a collaborator');
  try {
    await db.insertInto('quiz_collaborator').values({ quiz_id: quizId, user_id: u.user_id }).execute();
  } catch (err) {
    if (mysqlErrorCode(err) === 'ER_DUP_ENTRY') throw conflict('already_collaborator', 'This user is already a collaborator');
    throw err;
  }
}

/** The owner removes a collaborator, or a collaborator removes themselves. */
export async function removeCollaborator(quizId: number, actorId: number, collaboratorId: number): Promise<void> {
  const access = await getQuizAccess(quizId, actorId);
  if (!access || !access.canEdit) throw notFound('Quiz');
  if (!access.isOwner && actorId !== collaboratorId) await requireQuizOwner(quizId, actorId);
  const res = await db.deleteFrom('quiz_collaborator').where('quiz_id', '=', quizId).where('user_id', '=', collaboratorId).executeTakeFirst();
  if (Number(res.numDeletedRows) === 0) throw notFound('Collaborator');
}

/*
=========================================================
EXPLICACIÓN DEL ARCHIVO
=========================================================

Propósito: Contiene la lógica de cuestionarios: biblioteca, creación con límite, detalle, edición,
publicación, borrado y colaboradores.

Responsabilidades principales:
- listLibrary y listEditableQuizzes.
- createQuiz: máximo 15 por creador; si se crea desde una sala queda con is_in_library = FALSE y se
  asocia a la sala.
- updateQuiz: título, descripción y tiempo límite global del cuestionario.
- getQuizDetail: preguntas con respuestas, colaboradores y salas (solo para propietario y
  colaboradores).
- setQuizStatus: publicar exige al menos una pregunta y que todas sean válidas.
- deleteQuiz (solo propietario), addCollaborator y removeCollaborator.

Elementos importantes:
- listLibrary
- listEditableQuizzes
- createQuiz
- getQuizDetail
- updateQuiz
- setQuizStatus
- dtoToInput
- deleteQuiz
- addCollaborator
- removeCollaborator

Dependencias:
- db/index.ts
- http/errors.ts
- integrations/mailer.ts
- services/hooks.ts
- services/permissions.ts
- services/questions.ts
- services/users.ts
- @rush/shared

Flujo de datos:
Lee y escribe quiz, quiz_collaborator y room_quiz.

Aspectos técnicos importantes:
- Antes de publicar se vuelve a validar cada pregunta con el esquema compartido (dtoToInput
  reconstruye la forma de entrada).

Lugar en la arquitectura:
Capa de servicios. Implementa la gestión de cuestionarios y sus permisos.
*/
