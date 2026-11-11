import { describe, expect, it } from 'vitest';
import type { QuestionDto } from '@rush/shared';
import { emptyForm, formFromQuestion, toPayload, validateForm } from './questionForm';

describe('question editor form', () => {
  it('requires question text and option texts', () => {
    const errors = validateForm(emptyForm());
    expect(errors.questionText).toBeDefined();
    expect(errors.options).toBeDefined();
  });

  it('builds a valid multiple-choice payload', () => {
    const f = { ...emptyForm(), questionText: 'Hello?', options: [{ text: 'a', isCorrect: true }, { text: 'b', isCorrect: false }] };
    expect(validateForm(f)).toEqual({});
    expect(toPayload(f)).toMatchObject({ questionType: 'MULTIPLE_CHOICE', options: f.options });
  });

  it('reports the exactly-one-correct rule with its error code', () => {
    const f = { ...emptyForm(), questionText: 'Hello?', options: [{ text: 'a', isCorrect: false }, { text: 'b', isCorrect: false }] };
    expect(validateForm(f).options).toBe('exactly_one_correct_option');
  });

  it('only sends the fields of the selected type', () => {
    const f = { ...emptyForm(), questionType: 'TRUE_FALSE' as const, questionText: 'Seoul is in Korea', trueIsCorrect: false };
    const p = toPayload(f);
    expect(p).toEqual({ questionType: 'TRUE_FALSE', questionText: 'Seoul is in Korea', pointValue: 100, media: null, correctAnswer: false });
  });

  it('validates fill in the blank markers', () => {
    const f = { ...emptyForm(), questionType: 'FILL_IN_THE_BLANK' as const, questionText: 'No blank', correctTextAnswer: 'x' };
    expect(validateForm(f).questionText).toBe('exactly_one_blank');
    expect(validateForm({ ...f, questionText: 'I ___ here' })).toEqual({});
  });

  it('round-trips an existing question', () => {
    const q: QuestionDto = {
      questionId: 1, questionText: 'Match', questionType: 'MATCHING', pointValue: 50, displayOrder: 1,
      correctTextAnswer: null, options: [], media: null, locked: false,
      pairs: [{ pairId: 1, left: 'cat', right: '고양이', displayOrder: 1 }, { pairId: 2, left: 'dog', right: '개', displayOrder: 2 }],
    };
    const f = formFromQuestion(q);
    expect(validateForm(f)).toEqual({});
    expect(toPayload(f)).toMatchObject({ questionType: 'MATCHING', pairs: [{ left: 'cat', right: '고양이' }, { left: 'dog', right: '개' }] });
  });
});

/*
=========================================================
EXPLICACIÓN DEL ARCHIVO
=========================================================

Propósito: Pruebas de la lógica del formulario de preguntas.

Responsabilidades principales:
- Campos obligatorios, una sola opción correcta, marca de hueco en completar, carga útil solo con
  los campos del tipo e ida y vuelta de una pregunta guardada.

Elementos importantes:
- 6 casos de prueba

Dependencias:
- vitest
- features/quizzes/questionForm.ts

Flujo de datos:
Prueba funciones puras.

Aspectos técnicos importantes:
- No necesita navegador ni backend.

Lugar en la arquitectura:
Pruebas automatizadas. Protege la validación de preguntas.
*/
