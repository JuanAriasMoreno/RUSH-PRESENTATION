import { describe, expect, it } from 'vitest';
import { LIMITS } from '@rush/shared';
import { db } from '../src/db';
import { outbox } from '../src/integrations/mailer';
import { addMember, as, createQuiz, createRoom, mcQuestion, questionsOf, registerUser } from './helpers';

describe('quiz ownership and library', () => {
  it('creates a DRAFT quiz in the personal library', async () => {
    const u = await registerUser();
    const res = await as(u).post('/api/quizzes', { title: 'Basics', description: 'd' });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ title: 'Basics', status: 'DRAFT', isInLibrary: true, isOwner: true, questionCount: 0 });
    const lib = await as(u).get('/api/quizzes');
    expect(lib.body.owned).toHaveLength(1);
  });

  it('stores one global time limit per quiz (default 5 minutes) and validates it', async () => {
    const u = await registerUser();
    const created = await as(u).post('/api/quizzes', { title: 'Timed' });
    expect(created.body.totalTimeLimitSeconds).toBe(300);
    const id = created.body.quizId;
    expect((await as(u).patch(`/api/quizzes/${id}`, { totalTimeLimitSeconds: 600 })).status).toBe(200);
    expect((await as(u).get(`/api/quizzes/${id}`)).body.totalTimeLimitSeconds).toBe(600);
    expect((await as(u).patch(`/api/quizzes/${id}`, { totalTimeLimitSeconds: 30 })).status).toBe(400);
    expect((await as(u).patch(`/api/quizzes/${id}`, { totalTimeLimitSeconds: 4000 })).status).toBe(400);
    const custom = await as(u).post('/api/quizzes', { title: 'Short', totalTimeLimitSeconds: 120 });
    expect(custom.body.totalTimeLimitSeconds).toBe(120);
    // questions have no time limit of their own any more
    const q = await as(u).post(`/api/quizzes/${id}/questions`, mcQuestion());
    expect(q.status).toBe(201);
    expect((await as(u).get(`/api/quizzes/${id}`)).body.questions[0]).not.toHaveProperty('timeLimitSeconds');
  });

  it(`limits a user to ${LIMITS.maxQuizzesPerUser} quizzes (concurrently too)`, async () => {
    const u = await registerUser();
    const results = await Promise.all(Array.from({ length: LIMITS.maxQuizzesPerUser + 3 }, (_, i) => as(u).post('/api/quizzes', { title: `Q${i}` })));
    expect(results.filter((r) => r.status === 201)).toHaveLength(LIMITS.maxQuizzesPerUser);
    expect(results.filter((r) => r.status === 409)).toHaveLength(3);
  });

  it('hides quizzes from users without rights and only lets the owner delete', async () => {
    const owner = await registerUser();
    const collab = await registerUser();
    const stranger = await registerUser();
    const quizId = await createQuiz(owner);
    expect((await as(stranger).get(`/api/quizzes/${quizId}`)).status).toBe(404);
    expect((await as(stranger).patch(`/api/quizzes/${quizId}`, { title: 'x' })).status).toBe(404);
    expect((await as(owner).post(`/api/quizzes/${quizId}/collaborators`, { username: collab.username })).status).toBe(201);
    expect((await as(collab).delete(`/api/quizzes/${quizId}`)).status).toBe(403);
    expect((await as(owner).delete(`/api/quizzes/${quizId}`)).status).toBe(204);
    expect(await db.selectFrom('quiz').select('quiz_id').where('quiz_id', '=', quizId).executeTakeFirst()).toBeUndefined();
  });
});

describe('collaboration', () => {
  it('collaborators edit content but cannot manage collaborators', async () => {
    const owner = await registerUser();
    const collab = await registerUser();
    const third = await registerUser();
    const quizId = await createQuiz(owner, [], false);
    await as(owner).post(`/api/quizzes/${quizId}/collaborators`, { username: collab.username });
    expect((await as(collab).get('/api/quizzes')).body.shared).toHaveLength(1);
    expect((await as(collab).patch(`/api/quizzes/${quizId}`, { title: 'Edited by collab' })).body.title).toBe('Edited by collab');
    expect((await as(collab).post(`/api/quizzes/${quizId}/questions`, mcQuestion())).status).toBe(201);
    expect((await as(collab).post(`/api/quizzes/${quizId}/collaborators`, { username: third.username })).status).toBe(403);
    expect((await as(collab).delete(`/api/quizzes/${quizId}/collaborators/${owner.userId}`)).status).toBe(403);
    // the creator cannot be a collaborator; duplicates rejected
    expect((await as(owner).post(`/api/quizzes/${quizId}/collaborators`, { username: owner.username })).status).toBe(400);
    expect((await as(owner).post(`/api/quizzes/${quizId}/collaborators`, { username: collab.username })).status).toBe(409);
    // owner removes collaborator → access gone
    expect((await as(owner).delete(`/api/quizzes/${quizId}/collaborators/${collab.userId}`)).status).toBe(204);
    expect((await as(collab).get(`/api/quizzes/${quizId}`)).status).toBe(404);
  });

  it('room admins get no implicit rights over quizzes in their room', async () => {
    const owner = await registerUser();
    const admin = await registerUser();
    const roomId = await createRoom(owner);
    await addMember(roomId, owner, admin);
    await as(owner).patch(`/api/rooms/${roomId}/members/${admin.userId}`, { role: 'ADMIN' });
    const quizId = await createQuiz(owner);
    await as(owner).post(`/api/rooms/${roomId}/quizzes`, { quizId });
    expect((await as(admin).get(`/api/quizzes/${quizId}`)).status).toBe(404);
    expect((await as(admin).patch(`/api/quizzes/${quizId}`, { title: 'x' })).status).toBe(404);
    const q = (await questionsOf(quizId))[0]!;
    expect((await as(admin).put(`/api/questions/${q.question_id}`, mcQuestion('changed'))).status).toBe(404);
    const room = await as(admin).get(`/api/rooms/${roomId}`);
    expect(room.body.quizzes[0]).toMatchObject({ quizId, canEdit: false });
    expect(JSON.stringify(room.body)).not.toContain('annyeong'); // no answers leaked to members
  });
});

describe('quizzes in rooms', () => {
  it('adds and removes quizzes; removal keeps the quiz; members get an email', async () => {
    const owner = await registerUser();
    const member = await registerUser();
    const roomId = await createRoom(owner);
    const room2 = await createRoom(owner, 'Second');
    await addMember(roomId, owner, member);
    const quizId = await createQuiz(owner);
    expect((await as(member).post(`/api/rooms/${roomId}/quizzes`, { quizId })).status).toBe(403);
    expect((await as(owner).post(`/api/rooms/${roomId}/quizzes`, { quizId })).status).toBe(201);
    expect(outbox.some((m) => m.to === member.email && /New quiz/.test(m.subject))).toBe(true);
    expect((await as(owner).post(`/api/rooms/${roomId}/quizzes`, { quizId })).status).toBe(409);
    expect((await as(owner).post(`/api/rooms/${room2}/quizzes`, { quizId })).status).toBe(201); // reuse across rooms
    expect((await as(owner).delete(`/api/rooms/${roomId}/quizzes/${quizId}`)).status).toBe(204);
    expect(await db.selectFrom('quiz').select('quiz_id').where('quiz_id', '=', quizId).executeTakeFirst()).toBeDefined();
  });

  it('an admin cannot add a quiz they neither own nor collaborate on', async () => {
    const owner = await registerUser();
    const other = await registerUser();
    const roomId = await createRoom(owner);
    const quizId = await createQuiz(other);
    expect((await as(owner).post(`/api/rooms/${roomId}/quizzes`, { quizId })).status).toBe(403);
  });

  it('room-created quizzes are hidden from the library and move there when removed from the last room (A-3)', async () => {
    const owner = await registerUser();
    const roomId = await createRoom(owner);
    const res = await as(owner).post(`/api/rooms/${roomId}/quizzes/new`, { title: 'Room quiz' });
    expect(res.status).toBe(201);
    expect((await as(owner).get('/api/quizzes')).body.owned).toHaveLength(0);
    expect((await as(owner).get(`/api/rooms/${roomId}`)).body.quizzes).toHaveLength(1);
    await as(owner).delete(`/api/rooms/${roomId}/quizzes/${res.body.quizId}`);
    const lib = await as(owner).get('/api/quizzes');
    expect(lib.body.owned.map((q: { quizId: number }) => q.quizId)).toEqual([res.body.quizId]);
  });
});

describe('question validation and limits', () => {
  it('accepts all five question types and stores them correctly', async () => {
    const u = await registerUser();
    const quizId = await createQuiz(u, [
      mcQuestion(),
      { questionType: 'TRUE_FALSE', questionText: 'Seoul is in Korea', correctAnswer: true },
      { questionType: 'OPEN_ANSWER', questionText: 'Thank you = ?', correctTextAnswer: '  GamsaHamnida ' },
      { questionType: 'FILL_IN_THE_BLANK', questionText: 'I ___ a student', correctTextAnswer: 'am' },
      { questionType: 'MATCHING', questionText: 'Match', pairs: [{ left: 'cat', right: 'goyangi' }, { left: 'dog', right: 'gae' }] },
    ]);
    const qs = await questionsOf(quizId);
    expect(qs.map((q) => q.question_type)).toEqual(['MULTIPLE_CHOICE', 'TRUE_FALSE', 'OPEN_ANSWER', 'FILL_IN_THE_BLANK', 'MATCHING']);
    expect(qs.map((q) => q.display_order)).toEqual([1, 2, 3, 4, 5]);
    expect(qs[1]!.options.map((o) => [o.option_text, o.is_correct])).toEqual([['TRUE', true], ['FALSE', false]]);
    expect(qs[2]!.correct_text_answer).toBe('gamsahamnida'); // stored lowercase
    expect(qs[4]!.pairs).toHaveLength(2);
    expect(qs[0]!.correct_text_answer).toBeNull();
  });

  it('rejects invalid questions on the server', async () => {
    const u = await registerUser();
    const quizId = await createQuiz(u, [], false);
    const bad = [
      { questionType: 'MULTIPLE_CHOICE', questionText: 'q', options: [{ text: 'a', isCorrect: true }, { text: 'b', isCorrect: true }] },
      { questionType: 'MULTIPLE_CHOICE', questionText: 'q', options: Array.from({ length: 11 }, (_, i) => ({ text: `o${i}`, isCorrect: i === 0 })) },
      { questionType: 'OPEN_ANSWER', questionText: 'q' },
      { questionType: 'FILL_IN_THE_BLANK', questionText: 'no blank here', correctTextAnswer: 'x' },
      { questionType: 'MATCHING', questionText: 'q', pairs: [{ left: 'a', right: 'b' }] },
      { questionType: 'TRUE_FALSE', questionText: 'q', correctAnswer: true, pointValue: 0 },
      { questionType: 'UNKNOWN', questionText: 'q' },
      { questionType: 'TRUE_FALSE', questionText: 'q', correctAnswer: true, media: { mediaType: 'VIDEO', mediaUrl: 'https://cdn.example.com/v.mp4' } },
      { questionType: 'TRUE_FALSE', questionText: 'q', correctAnswer: true, media: { mediaType: 'IMAGE', mediaUrl: 'http://insecure.example.com/a.png' } },
    ];
    for (const q of bad) {
      const res = await as(u).post(`/api/quizzes/${quizId}/questions`, q);
      expect(res.status, JSON.stringify(q).slice(0, 80)).toBe(400);
    }
    const ok = await as(u).post(`/api/quizzes/${quizId}/questions`, {
      questionType: 'TRUE_FALSE', questionText: 'q', correctAnswer: true, media: { mediaType: 'IMAGE', mediaUrl: 'https://cdn.example.com/a.png' },
    });
    expect(ok.status).toBe(201);
  });

  it(`caps a quiz at ${LIMITS.maxQuestionsPerQuiz} questions`, async () => {
    const u = await registerUser();
    const quizId = await createQuiz(u, [], false);
    for (let i = 0; i < LIMITS.maxQuestionsPerQuiz; i++) {
      expect((await as(u).post(`/api/quizzes/${quizId}/questions`, mcQuestion(`Q${i}`))).status).toBe(201);
    }
    const res = await as(u).post(`/api/quizzes/${quizId}/questions`, mcQuestion('one too many'));
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('question_limit');
  });

  it('publishing requires at least one question; deleting the last one reverts to DRAFT', async () => {
    const u = await registerUser();
    const quizId = await createQuiz(u, [], false);
    expect((await as(u).post(`/api/quizzes/${quizId}/status`, { status: 'PUBLISHED' })).status).toBe(400);
    await as(u).post(`/api/quizzes/${quizId}/questions`, mcQuestion());
    expect((await as(u).post(`/api/quizzes/${quizId}/status`, { status: 'PUBLISHED' })).body.status).toBe('PUBLISHED');
    const q = (await questionsOf(quizId))[0]!;
    expect((await as(u).delete(`/api/questions/${q.question_id}`)).status).toBe(204);
    expect((await as(u).get(`/api/quizzes/${quizId}`)).body.status).toBe('DRAFT');
  });

  it('edits, reorders and deletes questions keeping display_order contiguous', async () => {
    const u = await registerUser();
    const quizId = await createQuiz(u, [mcQuestion('A'), mcQuestion('B'), mcQuestion('C')], false);
    let qs = await questionsOf(quizId);
    const [a, b, c] = qs;
    expect((await as(u).post(`/api/questions/${c!.question_id}/move`, { displayOrder: 1 })).status).toBe(204);
    qs = await questionsOf(quizId);
    expect(qs.map((q) => q.question_text)).toEqual(['C', 'A', 'B']);
    expect((await as(u).put(`/api/questions/${a!.question_id}`, { questionType: 'OPEN_ANSWER', questionText: 'A2', correctTextAnswer: 'x' })).status).toBe(204);
    expect((await as(u).delete(`/api/questions/${c!.question_id}`)).status).toBe(204);
    qs = await questionsOf(quizId);
    expect(qs.map((q) => [q.question_text, q.display_order, q.question_type])).toEqual([['A2', 1, 'OPEN_ANSWER'], ['B', 2, 'MULTIPLE_CHOICE']]);
    expect(qs[0]!.options).toHaveLength(0); // old options removed with the type change
    void b;
  });

  it('refreshes quiz.updated_at when questions change', async () => {
    const u = await registerUser();
    const quizId = await createQuiz(u, [], false);
    await db.updateTable('quiz').set({ updated_at: new Date('2020-01-01T00:00:00Z') }).where('quiz_id', '=', quizId).execute();
    await as(u).post(`/api/quizzes/${quizId}/questions`, mcQuestion());
    const row = await db.selectFrom('quiz').select('updated_at').where('quiz_id', '=', quizId).executeTakeFirstOrThrow();
    expect(row.updated_at.getUTCFullYear()).toBeGreaterThan(2020);
  });
});

/*
=========================================================
EXPLICACIÓN DEL ARCHIVO
=========================================================

Propósito: Pruebas de cuestionarios, colaboración, salas y validación de preguntas.

Responsabilidades principales:
- Biblioteca, límite de 15 cuestionarios y permisos de propietario.
- Colaboradores que editan pero no gestionan colaboradores; los ADMIN de sala no tienen permisos
  implícitos.
- Cuestionarios en salas y traslado a la biblioteca (A-3).
- Validación de los cinco tipos, límite de 25 preguntas, publicación y reordenamiento.
- Tiempo límite global del cuestionario: 5 minutos por defecto, rango 1–60 minutos y preguntas
  sin tiempo propio.

Elementos importantes:
- 15 casos de prueba

Dependencias:
- vitest
- test/helpers.ts
- src/db/index.ts
- src/integrations/mailer.ts

Flujo de datos:
Crea cuestionarios por la API y verifica las tablas question y answer_option.

Aspectos técnicos importantes:
- Comprueba que correct_text_answer se guarda en minúsculas.

Lugar en la arquitectura:
Pruebas automatizadas. Valida la gestión de cuestionarios en el backend.
*/
