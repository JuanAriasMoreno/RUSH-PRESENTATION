import { z } from 'zod';
import { BLANK_MARKER_REGEX, LIMITS } from './limits';

/** Normalises a typed answer for comparison (A-30): trim, collapse whitespace, lowercase. */
export function normalizeTextAnswer(value: string): string {
  return value.trim().replace(/\s+/g, ' ').toLowerCase();
}

/** Case/accent-insensitive key used to detect duplicates (the DB collation is utf8mb4_0900_ai_ci). */
function dupKey(value: string): string {
  return value.trim().normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
}

export function countBlanks(text: string): number {
  return (text.match(BLANK_MARKER_REGEX) ?? []).length;
}

const trimmed = (min: number, max: number) => z.string().trim().min(min).max(max);

export const mediaInputSchema = z.object({
  mediaType: z.enum(['IMAGE', 'AUDIO', 'VIDEO']),
  mediaUrl: z.string().trim().url().max(2048),
});
export type MediaInput = z.infer<typeof mediaInputSchema>;

const base = {
  questionText: trimmed(1, 2000),
  pointValue: z.number().int().min(LIMITS.minPoints).max(LIMITS.maxPoints).default(LIMITS.defaultPoints),
  media: mediaInputSchema.nullable().default(null),
};

const optionSchema = z.object({ text: trimmed(1, 255), isCorrect: z.boolean() });
const pairSchema = z.object({ left: trimmed(1, 255), right: trimmed(1, 255) });

export const questionInputSchema = z
  .discriminatedUnion('questionType', [
    z.object({
      ...base,
      questionType: z.literal('MULTIPLE_CHOICE'),
      options: z.array(optionSchema).min(LIMITS.minOptionsMultipleChoice).max(LIMITS.maxOptionsPerQuestion),
    }),
    z.object({ ...base, questionType: z.literal('TRUE_FALSE'), correctAnswer: z.boolean() }),
    z.object({ ...base, questionType: z.literal('OPEN_ANSWER'), correctTextAnswer: trimmed(1, 255) }),
    z.object({ ...base, questionType: z.literal('FILL_IN_THE_BLANK'), correctTextAnswer: trimmed(1, 255) }),
    z.object({
      ...base,
      questionType: z.literal('MATCHING'),
      pairs: z.array(pairSchema).min(LIMITS.minMatchingPairs).max(LIMITS.maxMatchingPairs),
    }),
  ])
  .superRefine((q, ctx) => {
    if (q.questionType === 'MULTIPLE_CHOICE') {
      const correct = q.options.filter((o) => o.isCorrect).length;
      if (correct !== 1) {
        ctx.addIssue({ code: 'custom', path: ['options'], message: 'exactly_one_correct_option' });
      }
      const keys = q.options.map((o) => dupKey(o.text));
      if (new Set(keys).size !== keys.length) {
        ctx.addIssue({ code: 'custom', path: ['options'], message: 'duplicate_options' });
      }
    }
    if (q.questionType === 'FILL_IN_THE_BLANK' && countBlanks(q.questionText) !== 1) {
      ctx.addIssue({ code: 'custom', path: ['questionText'], message: 'exactly_one_blank' });
    }
    if (q.questionType === 'MATCHING') {
      const lefts = q.pairs.map((p) => dupKey(p.left));
      const rights = q.pairs.map((p) => dupKey(p.right));
      if (new Set(lefts).size !== lefts.length || new Set(rights).size !== rights.length) {
        ctx.addIssue({ code: 'custom', path: ['pairs'], message: 'duplicate_pair_items' });
      }
    }
    if ((q.questionType === 'OPEN_ANSWER' || q.questionType === 'FILL_IN_THE_BLANK') &&
        normalizeTextAnswer(q.correctTextAnswer).length === 0) {
      ctx.addIssue({ code: 'custom', path: ['correctTextAnswer'], message: 'required' });
    }
  });

export type QuestionInput = z.infer<typeof questionInputSchema>;
export type QuestionInputRaw = z.input<typeof questionInputSchema>;

/** Answer submitted by a participant during a live session. Correctness is computed on the server. */
export const answerSubmissionSchema = z.union([
  z.object({ kind: z.literal('option'), optionId: z.number().int().positive() }),
  z.object({ kind: z.literal('text'), text: z.string().max(255) }),
  z.object({
    kind: z.literal('matching'),
    matches: z
      .array(z.object({ leftPairId: z.number().int().positive(), rightPairId: z.number().int().positive() }))
      .max(LIMITS.maxMatchingPairs),
  }),
]);
export type AnswerSubmission = z.infer<typeof answerSubmissionSchema>;

/*
=========================================================
EXPLICACIÓN DEL ARCHIVO
=========================================================

Propósito: Define con Zod las reglas de validación de las preguntas y de las respuestas enviadas
durante el juego.

Responsabilidades principales:
- normalizeTextAnswer: recorta, une espacios y pasa a minúsculas.
- questionInputSchema: unión por tipo (MULTIPLE_CHOICE, TRUE_FALSE, OPEN_ANSWER, FILL_IN_THE_BLANK,
  MATCHING) con reglas adicionales: una sola opción correcta, opciones sin duplicados, exactamente
  un hueco "___", pares sin duplicados.
- answerSubmissionSchema: respuesta de tipo option, text o matching.

Elementos importantes:
- normalizeTextAnswer
- countBlanks
- mediaInputSchema
- questionInputSchema / QuestionInput / QuestionInputRaw
- answerSubmissionSchema / AnswerSubmission

Dependencias:
- zod
- shared/src/limits.ts

Flujo de datos:
Valida el JSON de preguntas en el navegador (questionForm.ts) y en el servidor (routes/quizzes.ts).

Aspectos técnicos importantes:
- Los duplicados se comparan sin mayúsculas ni acentos, igual que la intercalación
  utf8mb4_0900_ai_ci de MySQL.

Lugar en la arquitectura:
Capa compartida. Garantiza que frontend y backend apliquen exactamente las mismas reglas.
*/
