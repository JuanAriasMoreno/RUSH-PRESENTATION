import { describe, expect, it } from 'vitest';
import { gradeAnswer, questionInputSchema, quizInputSchema, normalizeTextAnswer, wordSchema, LIMITS } from '../src';

const mc = (options: { text: string; isCorrect: boolean }[]) =>
  questionInputSchema.safeParse({ questionType: 'MULTIPLE_CHOICE', questionText: 'Hello = ?', options });

describe('question validation', () => {
  it('accepts a valid multiple-choice question and applies defaults', () => {
    const r = mc([{ text: 'annyeong', isCorrect: true }, { text: 'gamsa', isCorrect: false }]);
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.pointValue).toBe(100);
    }
  });
  it('rejects multiple choice with zero or two correct options', () => {
    expect(mc([{ text: 'a', isCorrect: false }, { text: 'b', isCorrect: false }]).success).toBe(false);
    expect(mc([{ text: 'a', isCorrect: true }, { text: 'b', isCorrect: true }]).success).toBe(false);
  });
  it('rejects fewer than 2 or more than 10 options', () => {
    expect(mc([{ text: 'a', isCorrect: true }]).success).toBe(false);
    const eleven = Array.from({ length: 11 }, (_, i) => ({ text: `o${i}`, isCorrect: i === 0 }));
    expect(mc(eleven).success).toBe(false);
  });
  it('rejects duplicate options (case-insensitive)', () => {
    expect(mc([{ text: 'Cat', isCorrect: true }, { text: 'cat', isCorrect: false }]).success).toBe(false);
  });
  it('requires exactly one blank for fill in the blank', () => {
    const base = { questionType: 'FILL_IN_THE_BLANK', correctTextAnswer: 'am' };
    expect(questionInputSchema.safeParse({ ...base, questionText: 'I ___ a student' }).success).toBe(true);
    expect(questionInputSchema.safeParse({ ...base, questionText: 'I am a student' }).success).toBe(false);
    expect(questionInputSchema.safeParse({ ...base, questionText: 'I ___ a ___' }).success).toBe(false);
  });
  it('requires a text answer for open answer', () => {
    const r = questionInputSchema.safeParse({ questionType: 'OPEN_ANSWER', questionText: 'q', correctTextAnswer: '   ' });
    expect(r.success).toBe(false);
  });
  it('validates matching pairs', () => {
    const p = (pairs: { left: string; right: string }[]) =>
      questionInputSchema.safeParse({ questionType: 'MATCHING', questionText: 'Match', pairs });
    expect(p([{ left: 'cat', right: 'goyangi' }, { left: 'dog', right: 'gae' }]).success).toBe(true);
    expect(p([{ left: 'cat', right: 'goyangi' }]).success).toBe(false);
    expect(p([{ left: 'cat', right: 'x' }, { left: 'CAT', right: 'y' }]).success).toBe(false);
  });
  it('enforces point ranges', () => {
    const q = { questionType: 'TRUE_FALSE', questionText: 'Seoul is in Korea', correctAnswer: true };
    expect(questionInputSchema.safeParse({ ...q, pointValue: 0 }).success).toBe(false);
    expect(questionInputSchema.safeParse({ ...q, pointValue: LIMITS.maxPoints + 1 }).success).toBe(false);
    expect(questionInputSchema.safeParse({ ...q, pointValue: LIMITS.maxPoints }).success).toBe(true);
  });
});

describe('quiz global time limit', () => {
  it('defaults to 5 minutes and accepts 1–60 minutes', () => {
    expect(quizInputSchema.parse({ title: 'Q' }).totalTimeLimitSeconds).toBe(LIMITS.defaultQuizTimeLimitSeconds);
    expect(quizInputSchema.safeParse({ title: 'Q', totalTimeLimitSeconds: 60 }).success).toBe(true);
    expect(quizInputSchema.safeParse({ title: 'Q', totalTimeLimitSeconds: 3600 }).success).toBe(true);
    expect(quizInputSchema.safeParse({ title: 'Q', totalTimeLimitSeconds: 59 }).success).toBe(false);
    expect(quizInputSchema.safeParse({ title: 'Q', totalTimeLimitSeconds: 3601 }).success).toBe(false);
    expect(quizInputSchema.safeParse({ title: 'Q', totalTimeLimitSeconds: 90.5 }).success).toBe(false);
  });
  it('questions no longer carry their own time limit (an old field is ignored)', () => {
    const r = questionInputSchema.parse({ questionType: 'TRUE_FALSE', questionText: 'x', correctAnswer: true, timeLimitSeconds: 20 });
    expect(r).not.toHaveProperty('timeLimitSeconds');
  });
});

describe('grading', () => {
  const choice = {
    questionType: 'MULTIPLE_CHOICE' as const,
    pointValue: 50,
    correctTextAnswer: null,
    options: [{ optionId: 1, isCorrect: true }, { optionId: 2, isCorrect: false }],
    pairs: [],
  };
  it('grades choices by correctness only', () => {
    expect(gradeAnswer(choice, { kind: 'option', optionId: 1 })).toEqual({ valid: true, isCorrect: true, pointsEarned: 50 });
    expect(gradeAnswer(choice, { kind: 'option', optionId: 2 }).pointsEarned).toBe(0);
    expect(gradeAnswer(choice, { kind: 'option', optionId: 99 }).valid).toBe(false);
    expect(gradeAnswer(choice, { kind: 'text', text: 'x' }).valid).toBe(false);
    expect(gradeAnswer(choice, null)).toEqual({ valid: true, isCorrect: false, pointsEarned: 0 });
  });
  it('grades text answers case- and whitespace-insensitively', () => {
    const q = { ...choice, questionType: 'OPEN_ANSWER' as const, correctTextAnswer: 'gamsahamnida', options: [] };
    expect(gradeAnswer(q, { kind: 'text', text: '  GamsaHamnida ' }).isCorrect).toBe(true);
    expect(gradeAnswer(q, { kind: 'text', text: 'gamsa' }).isCorrect).toBe(false);
    expect(gradeAnswer(q, { kind: 'text', text: '' }).isCorrect).toBe(false);
    expect(normalizeTextAnswer(' I  AM ')).toBe('i am');
  });
  it('grades matching all-or-nothing', () => {
    const q = { ...choice, questionType: 'MATCHING' as const, options: [], pairs: [{ pairId: 1 }, { pairId: 2 }] };
    const m = (matches: { leftPairId: number; rightPairId: number }[]) => gradeAnswer(q, { kind: 'matching', matches });
    expect(m([{ leftPairId: 1, rightPairId: 1 }, { leftPairId: 2, rightPairId: 2 }]).isCorrect).toBe(true);
    expect(m([{ leftPairId: 1, rightPairId: 2 }, { leftPairId: 2, rightPairId: 1 }]).isCorrect).toBe(false);
    expect(m([{ leftPairId: 1, rightPairId: 1 }]).isCorrect).toBe(false);
    expect(m([{ leftPairId: 1, rightPairId: 1 }, { leftPairId: 1, rightPairId: 2 }]).valid).toBe(false);
  });
});

describe('word validation', () => {
  it('accepts single English and Korean words', () => {
    for (const w of ['hello', "don't", 'well-known', '사랑', '안녕하세요']) {
      expect(wordSchema.safeParse(w).success).toBe(true);
    }
  });
  it('rejects phrases, numbers and symbols', () => {
    for (const w of ['hello world', '123', '', 'a'.repeat(101), '<script>']) {
      expect(wordSchema.safeParse(w).success).toBe(false);
    }
  });
});

/*
=========================================================
EXPLICACIÓN DEL ARCHIVO
=========================================================

Propósito: Pruebas de la validación de preguntas, la corrección de respuestas y la validación de
palabras.

Responsabilidades principales:
- Opción múltiple, completar, respuesta abierta, emparejamiento y rangos de puntos.
- Tiempo límite global del cuestionario (1–60 minutos) y preguntas sin tiempo propio.
- Corrección por tipo y emparejamiento todo o nada.
- Palabras válidas en inglés y coreano.

Elementos importantes:
- 15 casos de prueba

Dependencias:
- vitest
- shared/src

Flujo de datos:
Prueba funciones puras.

Aspectos técnicos importantes:
- No necesita base de datos.

Lugar en la arquitectura:
Pruebas automatizadas. Protege las reglas compartidas.
*/
