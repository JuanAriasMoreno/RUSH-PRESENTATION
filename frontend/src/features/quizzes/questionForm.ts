import type { MediaType, QuestionDto, QuestionInputRaw, QuestionType } from '@rush/shared';
import { LIMITS, questionInputSchema } from '@rush/shared';

/** Editor state keeps the fields of every type so switching type does not lose input. */
export interface QuestionFormState {
  questionType: QuestionType;
  questionText: string;
  pointValue: number;
  options: { text: string; isCorrect: boolean }[];
  trueIsCorrect: boolean;
  correctTextAnswer: string;
  pairs: { left: string; right: string }[];
  media: { mediaType: MediaType; mediaUrl: string } | null;
}

export function emptyForm(): QuestionFormState {
  return {
    questionType: 'MULTIPLE_CHOICE',
    questionText: '',
    pointValue: LIMITS.defaultPoints,
    options: [{ text: '', isCorrect: true }, { text: '', isCorrect: false }],
    trueIsCorrect: true,
    correctTextAnswer: '',
    pairs: [{ left: '', right: '' }, { left: '', right: '' }],
    media: null,
  };
}

export function formFromQuestion(q: QuestionDto): QuestionFormState {
  const f = emptyForm();
  return {
    ...f,
    questionType: q.questionType,
    questionText: q.questionText,
    pointValue: q.pointValue,
    options: q.questionType === 'MULTIPLE_CHOICE' ? q.options.map((o) => ({ text: o.text, isCorrect: o.isCorrect })) : f.options,
    trueIsCorrect: q.questionType === 'TRUE_FALSE' ? q.options.find((o) => o.isCorrect)?.text === 'TRUE' : true,
    correctTextAnswer: q.correctTextAnswer ?? '',
    pairs: q.questionType === 'MATCHING' ? q.pairs.map((p) => ({ left: p.left, right: p.right })) : f.pairs,
    media: q.media ? { mediaType: q.media.mediaType, mediaUrl: q.media.mediaUrl } : null,
  };
}

/** Builds the API payload for the selected type only. */
export function toPayload(f: QuestionFormState): QuestionInputRaw {
  const base = { questionText: f.questionText, pointValue: f.pointValue, media: f.media };
  switch (f.questionType) {
    case 'MULTIPLE_CHOICE':
      return { ...base, questionType: 'MULTIPLE_CHOICE', options: f.options };
    case 'TRUE_FALSE':
      return { ...base, questionType: 'TRUE_FALSE', correctAnswer: f.trueIsCorrect };
    case 'OPEN_ANSWER':
      return { ...base, questionType: 'OPEN_ANSWER', correctTextAnswer: f.correctTextAnswer };
    case 'FILL_IN_THE_BLANK':
      return { ...base, questionType: 'FILL_IN_THE_BLANK', correctTextAnswer: f.correctTextAnswer };
    case 'MATCHING':
      return { ...base, questionType: 'MATCHING', pairs: f.pairs };
  }
}

/** Same rules as the backend (shared schema). Returns error keys by field. */
export function validateForm(f: QuestionFormState): Record<string, string> {
  const r = questionInputSchema.safeParse(toPayload(f));
  if (r.success) return {};
  const errors: Record<string, string> = {};
  for (const issue of r.error.issues) {
    const field = String(issue.path[0] ?? 'form');
    errors[field] ??= issue.message;
  }
  return errors;
}

/*
=========================================================
EXPLICACIÓN DEL ARCHIVO
=========================================================

Propósito: Lógica pura del formulario de preguntas: estado inicial, carga desde una pregunta
guardada, conversión a la carga útil de la API y validación.

Responsabilidades principales:
- emptyForm: estado con los campos de todos los tipos (cambiar de tipo no pierde lo escrito).
- formFromQuestion: pasa de QuestionDto al estado del formulario.
- toPayload: genera solo los campos del tipo elegido.
- validateForm: valida con questionInputSchema (el mismo esquema que usa el backend) y devuelve
  errores por campo.

Elementos importantes:
- interface QuestionFormState
- emptyForm
- formFromQuestion
- toPayload
- validateForm

Dependencias:
- @rush/shared

Flujo de datos:
Transforma el estado del formulario en el JSON que espera POST /api/quizzes/:quizId/questions.

Aspectos técnicos importantes:
- Compartir el esquema garantiza que frontend y backend validen igual.

Lugar en la arquitectura:
Lógica de presentación. Separa la lógica del formulario de su interfaz y permite probarla.
*/
