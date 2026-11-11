import type { Server as HttpServer } from 'node:http';
import type { RequestHandler } from 'express';
import { Server, type Socket } from 'socket.io';
import { answerSubmissionSchema } from '@rush/shared';
import { z } from 'zod';
import { env } from '../config/env';
import { db } from '../db';
import { sessionMiddleware } from '../http/session';
import { hooks } from '../services/hooks';
import { SessionEngine, SessionError, type Emitter } from './sessionEngine';

const sessionRoom = (sid: number) => `session:${sid}`;
const userInSessionRoom = (sid: number, uid: number) => `session:${sid}:user:${uid}`;
const userRoom = (uid: number) => `user:${uid}`;

const idPayload = z.object({ sessionId: z.number().int().positive() });
const answerPayload = z.object({
  sessionId: z.number().int().positive(),
  questionId: z.number().int().positive(),
  answer: answerSubmissionSchema,
});

type Ack = (res: { ok: true; data?: unknown } | { ok: false; error: { code: string; message: string } }) => void;

export let engine = new SessionEngine({ toUser() {}, toSession() {}, detachUser() {} });

export function createSocketServer(httpServer: HttpServer): Server {
  const allowedOrigins = [new URL(env.APP_URL).origin, new URL(env.PUBLIC_API_URL).origin];
  const io = new Server(httpServer, {
    cors: { origin: allowedOrigins, credentials: true },
    // reject cross-site WebSocket hijacking: browsers always send Origin
    allowRequest: (req, cb) => {
      const origin = req.headers.origin;
      cb(null, !origin || allowedOrigins.includes(origin));
    },
  });

  // Reuse the express-session cookie for socket authentication.
  io.engine.use(sessionMiddleware as unknown as RequestHandler);

  const emitter: Emitter = {
    toUser: (sid, uid, event, payload) => io.to(userInSessionRoom(sid, uid)).emit(event, payload),
    toSession: (sid, event, payload) => io.to(sessionRoom(sid)).emit(event, payload),
    detachUser: (sid, uid) => {
      io.in(userInSessionRoom(sid, uid)).socketsLeave([sessionRoom(sid), userInSessionRoom(sid, uid)]);
    },
  };
  engine = new SessionEngine(emitter);

  hooks.beforeRoomsOrQuizzesDeleted = (roomIds, quizIds) => engine.abortFor(roomIds, quizIds);
  hooks.memberLeftRoom = (roomId, userId) => void engine.memberLeftRoom(roomId, userId).catch((e) => console.error(e));
  hooks.userGone = (userId) => io.in(userRoom(userId)).disconnectSockets(true);

  io.use(async (socket, next) => {
    const req = socket.request as typeof socket.request & { session?: { userId?: number } };
    const userId = req.session?.userId;
    if (!userId) return next(new Error('unauthorized'));
    const user = await db.selectFrom('user').select('user_id').where('user_id', '=', userId).executeTakeFirst().catch(() => undefined);
    if (!user) return next(new Error('unauthorized'));
    socket.data.userId = userId;
    socket.data.sessions = new Set<number>();
    next();
  });

  io.on('connection', (socket: Socket) => {
    const userId: number = socket.data.userId;
    void socket.join(userRoom(userId));

    const handle =
      <S extends z.ZodTypeAny>(schema: S, fn: (payload: z.infer<S>) => Promise<unknown>) =>
      async (payload: unknown, ack?: Ack) => {
        const reply: Ack = typeof ack === 'function' ? ack : () => {};
        const parsed = schema.safeParse(payload);
        if (!parsed.success) return reply({ ok: false, error: { code: 'invalid_payload', message: 'Invalid request' } });
        try {
          const data = await fn(parsed.data);
          reply({ ok: true, data });
        } catch (err) {
          if (err instanceof SessionError) return reply({ ok: false, error: { code: err.code, message: err.message } });
          console.error('[socket]', err);
          reply({ ok: false, error: { code: 'internal_error', message: 'Something went wrong' } });
        }
      };

    socket.on('session:join', handle(idPayload, async ({ sessionId }) => {
      const result = await engine.join(sessionId, userId, socket.id);
      (socket.data.sessions as Set<number>).add(sessionId);
      await socket.join([sessionRoom(sessionId), userInSessionRoom(sessionId, userId)]);
      return result;
    }));

    socket.on('session:start', handle(idPayload, ({ sessionId }) => engine.start(sessionId, userId)));
    socket.on('session:cancel', handle(idPayload, ({ sessionId }) => engine.cancel(sessionId, userId)));
    socket.on('session:answer', handle(answerPayload, ({ sessionId, questionId, answer }) =>
      engine.answer(sessionId, userId, questionId, answer)));
    socket.on('session:leave', handle(idPayload, async ({ sessionId }) => {
      (socket.data.sessions as Set<number>).delete(sessionId);
      await engine.disconnect(sessionId, userId, socket.id);
      await socket.leave(sessionRoom(sessionId));
      await socket.leave(userInSessionRoom(sessionId, userId));
    }));

    socket.on('disconnect', () => {
      for (const sessionId of socket.data.sessions as Set<number>) {
        void engine.disconnect(sessionId, userId, socket.id).catch((e) => console.error('[socket] disconnect', e));
      }
    });
  });

  return io;
}

/*
=========================================================
EXPLICACIÓN DEL ARCHIVO
=========================================================

Propósito: Crea el servidor Socket.IO, autentica las conexiones con la sesión HTTP y traduce los
eventos de los clientes en llamadas al motor de juego.

Responsabilidades principales:
- Configurar CORS y allowRequest para aceptar solo los orígenes permitidos.
- Reutilizar sessionMiddleware para leer userId de la cookie y rechazar conexiones no autenticadas.
- Crear el SessionEngine con un Emitter basado en salas de Socket.IO (session:<id>,
  session:<id>:user:<uid>, user:<uid>).
- Escuchar session:join, session:start, session:cancel, session:answer y session:leave, validar su
  contenido con Zod y responder con un acuse { ok, data | error }.
- Registrar los hooks para cancelar partidas cuando se borra una sala/cuestionario y para
  desconectar a usuarios eliminados.

Elementos importantes:
- createSocketServer(httpServer)
- engine (exportado y reasignado al crear el servidor)
- handle(schema, fn): validación y respuesta uniforme

Dependencias:
- socket.io
- zod
- @rush/shared (answerSubmissionSchema)
- http/session.ts
- services/hooks.ts
- realtime/sessionEngine.ts
- db/index.ts

Flujo de datos:
Recibe eventos desde el navegador (useGameSocket.ts) y emite eventos de vuelta: session:lobby,
session:started y session:timer (fecha límite global), session:question (siguiente pregunta de cada
jugador), session:question-end (resultado propio), session:completed (motivo de fin, ganador y
clasificación), session:cancelled y session:removed.

Aspectos técnicos importantes:
- La autenticación de WebSocket usa la misma cookie de sesión que la API REST.
- Al cerrarse un socket se informa al motor (disconnect) para cada sesión en la que participaba.

Lugar en la arquitectura:
Capa de tiempo real: puente entre el transporte WebSocket y el motor de juego. Define el protocolo
de eventos de las partidas en vivo.
*/
