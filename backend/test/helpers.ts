import http from 'node:http';
import type { AddressInfo } from 'node:net';
import request from 'supertest';
import { io as ioClient, type Socket } from 'socket.io-client';
import type { QuestionInputRaw } from '@rush/shared';
import { createApp } from '../src/http/app';
import { createSocketServer } from '../src/realtime/socket';
import { db } from '../src/db';

export const app = createApp();
export const PASSWORD = 'password-1234';

export interface TestUser {
  userId: number;
  username: string;
  email: string;
  cookie: string;
}

function cookieFrom(res: request.Response): string {
  const raw = res.headers['set-cookie'] as unknown as string[] | undefined;
  if (!raw?.length) throw new Error('no session cookie');
  return raw.map((c) => c.split(';')[0]).join('; ');
}

let counter = 0;
export async function registerUser(name?: string): Promise<TestUser> {
  counter += 1;
  const username = name ?? `user${counter}_${Math.random().toString(36).slice(2, 7)}`;
  const email = `${username}@example.test`;
  const res = await request(app).post('/api/auth/register').send({ fullName: `Test ${username}`, username, email, password: PASSWORD, securityQuestionId: 1, securityAnswer: 'rex' });
  if (res.status !== 201) throw new Error(`register failed: ${res.status} ${JSON.stringify(res.body)}`);
  return { userId: res.body.userId, username, email, cookie: cookieFrom(res) };
}

export async function login(identifier: string, password = PASSWORD): Promise<string> {
  const res = await request(app).post('/api/auth/login').send({ identifier, password });
  if (res.status !== 200) throw new Error(`login failed ${res.status}`);
  return cookieFrom(res);
}

/** Authenticated request helper. */
export const as = (u: { cookie: string }) => ({
  get: (url: string) => request(app).get(url).set('Cookie', u.cookie),
  post: (url: string, body?: object) => request(app).post(url).set('Cookie', u.cookie).send(body ?? {}),
  put: (url: string, body?: object) => request(app).put(url).set('Cookie', u.cookie).send(body ?? {}),
  patch: (url: string, body?: object) => request(app).patch(url).set('Cookie', u.cookie).send(body ?? {}),
  delete: (url: string, body?: object) => request(app).delete(url).set('Cookie', u.cookie).send(body ?? {}),
  /** raw POST without a JSON body (multipart uploads) */
  upload: (url: string) => request(app).post(url).set('Cookie', u.cookie),
});

export async function createRoom(owner: TestUser, name = 'Room'): Promise<number> {
  const res = await as(owner).post('/api/rooms', { name, description: 'd' });
  if (res.status !== 201) throw new Error(`createRoom ${res.status} ${JSON.stringify(res.body)}`);
  return res.body.roomId;
}

export async function addMember(roomId: number, manager: TestUser, user: TestUser): Promise<void> {
  const inv = await as(manager).post(`/api/rooms/${roomId}/invitations`, {});
  const res = await as(user).post(`/api/invitations/${inv.body.token}/accept`);
  if (res.status !== 200) throw new Error(`join ${res.status} ${JSON.stringify(res.body)}`);
}

export const mcQuestion = (text = 'Hello = ?', points = 100): QuestionInputRaw => ({
  questionType: 'MULTIPLE_CHOICE',
  questionText: text,
  pointValue: points,
  options: [{ text: 'annyeong', isCorrect: true }, { text: 'gamsa', isCorrect: false }],
});

export async function createQuiz(owner: TestUser, questions: QuestionInputRaw[] = [mcQuestion()], publish = true, totalTimeLimitSeconds?: number): Promise<number> {
  const res = await as(owner).post('/api/quizzes', { title: 'Quiz', description: '', ...(totalTimeLimitSeconds && { totalTimeLimitSeconds }) });
  if (res.status !== 201) throw new Error(`createQuiz ${res.status} ${JSON.stringify(res.body)}`);
  const quizId = res.body.quizId;
  for (const q of questions) {
    const r = await as(owner).post(`/api/quizzes/${quizId}/questions`, q);
    if (r.status !== 201) throw new Error(`question ${r.status} ${JSON.stringify(r.body)}`);
  }
  if (publish) {
    const r = await as(owner).post(`/api/quizzes/${quizId}/status`, { status: 'PUBLISHED' });
    if (r.status !== 200) throw new Error(`publish ${r.status}`);
  }
  return quizId;
}

export async function questionsOf(quizId: number) {
  const qs = await db.selectFrom('question').selectAll().where('quiz_id', '=', quizId).orderBy('display_order').execute();
  const opts = await db.selectFrom('answer_option').selectAll().where('question_id', 'in', qs.map((q) => q.question_id).concat([0])).execute();
  const pairs = await db.selectFrom('matching_pair').selectAll().where('question_id', 'in', qs.map((q) => q.question_id).concat([0])).execute();
  return qs.map((q) => ({ ...q, options: opts.filter((o) => o.question_id === q.question_id), pairs: pairs.filter((p) => p.question_id === q.question_id) }));
}

// ------------------------------------------------------------------ sockets
export async function startServer(): Promise<{ url: string; close: () => Promise<void> }> {
  const server = http.createServer(app);
  const io = createSocketServer(server);
  await new Promise<void>((r) => server.listen(0, r));
  const { port } = server.address() as AddressInfo;
  return {
    url: `http://localhost:${port}`,
    close: () => new Promise((r) => { io.close(); server.close(() => r()); }),
  };
}

export async function connect(url: string, user: TestUser): Promise<Socket> {
  const socket = ioClient(url, { transports: ['websocket'], extraHeaders: { cookie: user.cookie }, reconnection: false, forceNew: true });
  await new Promise<void>((resolve, reject) => {
    socket.once('connect', () => resolve());
    socket.once('connect_error', reject);
  });
  return socket;
}

export function emit<T = unknown>(socket: Socket, event: string, payload: unknown): Promise<{ ok: boolean; data?: T; error?: { code: string } }> {
  return new Promise((resolve) => socket.emit(event, payload, resolve));
}

export function next<T = any>(socket: Socket, event: string, timeoutMs = 10_000): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`timeout waiting for ${event}`)), timeoutMs);
    socket.once(event, (payload: T) => {
      clearTimeout(t);
      resolve(payload);
    });
  });
}

/*
=========================================================
EXPLICACIÓN DEL ARCHIVO
=========================================================

Propósito: Funciones auxiliares compartidas por las pruebas del backend.

Responsabilidades principales:
- registerUser, login y as(user): peticiones autenticadas con Supertest y la cookie de sesión.
- createRoom, addMember, createQuiz, mcQuestion y questionsOf.
- startServer, connect, emit y next: servidor real y clientes Socket.IO para las pruebas de
  partidas.

Elementos importantes:
- app
- PASSWORD
- registerUser
- login
- as
- createRoom
- addMember
- mcQuestion
- createQuiz
- questionsOf
- startServer
- connect
- emit
- next

Dependencias:
- supertest
- socket.io-client
- src/http/app.ts
- src/realtime/socket.ts
- src/db/index.ts
- @rush/shared

Flujo de datos:
Construye escenarios de prueba usando la API real.

Aspectos técnicos importantes:
- Las pruebas pasan por las mismas rutas y servicios que el frontend.

Lugar en la arquitectura:
Infraestructura de pruebas. Reduce la repetición en las 75 pruebas de integración.
*/
