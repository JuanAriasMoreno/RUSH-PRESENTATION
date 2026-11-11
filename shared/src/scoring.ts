import { normalizeTextAnswer } from './questions';
import type { QuestionType } from './limits';

/** Minimal data needed to grade an answer. Loaded by the server only. */
export interface GradableQuestion {
  questionType: QuestionType;
  pointValue: number;
  correctTextAnswer: string | null;
  options: { optionId: number; isCorrect: boolean }[];
  pairs: { pairId: number }[];
}

export type GradeInput =
  | { kind: 'option'; optionId: number }
  | { kind: 'text'; text: string }
  | { kind: 'matching'; matches: { leftPairId: number; rightPairId: number }[] }
  | null;

export interface GradeResult {
  valid: boolean; // answer shape matches the question type and references its own options/pairs
  isCorrect: boolean;
  pointsEarned: number;
}

/**
 * Grades an answer. Points depend only on correctness (never on speed).
 * MATCHING is all-or-nothing (A-11).
 */
export function gradeAnswer(q: GradableQuestion, answer: GradeInput): GradeResult {
  const wrong = (valid: boolean): GradeResult => ({ valid, isCorrect: false, pointsEarned: 0 });
  const right: GradeResult = { valid: true, isCorrect: true, pointsEarned: q.pointValue };
  if (answer === null) return wrong(true);

  switch (q.questionType) {
    case 'MULTIPLE_CHOICE':
    case 'TRUE_FALSE': {
      if (answer.kind !== 'option') return wrong(false);
      const opt = q.options.find((o) => o.optionId === answer.optionId);
      if (!opt) return wrong(false);
      return opt.isCorrect ? right : wrong(true);
    }
    case 'OPEN_ANSWER':
    case 'FILL_IN_THE_BLANK': {
      if (answer.kind !== 'text') return wrong(false);
      const expected = q.correctTextAnswer ?? '';
      const given = normalizeTextAnswer(answer.text);
      return given.length > 0 && given === normalizeTextAnswer(expected) ? right : wrong(true);
    }
    case 'MATCHING': {
      if (answer.kind !== 'matching') return wrong(false);
      const ids = new Set(q.pairs.map((p) => p.pairId));
      const lefts = new Set<number>();
      const rights = new Set<number>();
      for (const m of answer.matches) {
        if (!ids.has(m.leftPairId) || !ids.has(m.rightPairId)) return wrong(false);
        if (lefts.has(m.leftPairId) || rights.has(m.rightPairId)) return wrong(false);
        lefts.add(m.leftPairId);
        rights.add(m.rightPairId);
      }
      const complete = lefts.size === ids.size;
      const allCorrect = answer.matches.every((m) => m.leftPairId === m.rightPairId);
      return complete && allCorrect ? right : wrong(true);
    }
  }
}

/*
=========================================================
EXPLICACIÓN DEL ARCHIVO
=========================================================

Propósito: Función que corrige una respuesta y calcula los puntos obtenidos.

Responsabilidades principales:
- gradeAnswer: opción múltiple y verdadero/falso (la opción elegida es la correcta), texto
  (comparación normalizada) y emparejamiento (todos los pares correctos; todo o nada).
- Marca como no válida una respuesta que no corresponde al tipo de pregunta o a sus opciones.

Elementos importantes:
- interface GradableQuestion
- type GradeInput
- interface GradeResult
- gradeAnswer(question, answer)

Dependencias:
- shared/src/questions.ts (normalizeTextAnswer)
- shared/src/limits.ts

Flujo de datos:
La usa solo el servidor (sessionEngine.ts) con los datos de la base de datos.

Aspectos técnicos importantes:
- Los puntos son point_value si la respuesta es correcta y 0 si no; la velocidad no influye.

Lugar en la arquitectura:
Capa compartida (lógica de dominio). Define la puntuación del juego.
*/
