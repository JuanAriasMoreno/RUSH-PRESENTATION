import session from 'express-session';
import createMemoryStore from 'memorystore';
import { env } from '../config/env';

declare module 'express-session' {
  interface SessionData {
    userId?: number;
  }
}

const MemoryStore = createMemoryStore(session);

/** In-process server-side session store (see docs/OPEN_QUESTIONS.md A-17). */
export const sessionStore = new MemoryStore({ checkPeriod: 60 * 60 * 1000 });

export const SESSION_COOKIE = 'rush.sid';

export const sessionMiddleware = session({
  name: SESSION_COOKIE,
  secret: env.SESSION_SECRET,
  store: sessionStore,
  resave: false,
  saveUninitialized: false,
  rolling: true,
  cookie: {
    httpOnly: true,
    sameSite: 'lax',
    secure: env.isProd,
    maxAge: 7 * 24 * 60 * 60 * 1000,
  },
});

/** Destroys every login session of a user (password change, account deletion), optionally keeping one. */
export function destroyUserSessions(userId: number, exceptSid?: string): Promise<void> {
  return new Promise((resolve) => {
    sessionStore.all((err: unknown, sessions: Record<string, session.SessionData> | null | undefined) => {
      if (err || !sessions) return resolve();
      const sids = Object.entries(sessions)
        .filter(([sid, data]) => data?.userId === userId && sid !== exceptSid)
        .map(([sid]) => sid);
      let pending = sids.length;
      if (pending === 0) return resolve();
      for (const sid of sids) {
        sessionStore.destroy(sid, () => {
          pending -= 1;
          if (pending === 0) resolve();
        });
      }
    });
  });
}

/*
=========================================================
EXPLICACIÓN DEL ARCHIVO
=========================================================

Propósito: Configura las sesiones del lado del servidor con express-session y un almacén en memoria
(memorystore).

Responsabilidades principales:
- Definir la cookie de sesión rush.sid: HttpOnly, SameSite=Lax, Secure en producción y duración de 7
  días renovada con cada petición (rolling).
- Firmar la cookie con SESSION_SECRET.
- Guardar en la sesión el campo userId.
- destroyUserSessions(userId, exceptSid): cerrar todas las sesiones de un usuario (al cambiar la
  contraseña o borrar la cuenta).

Elementos importantes:
- sessionStore (MemoryStore con limpieza cada hora)
- SESSION_COOKIE
- sessionMiddleware
- destroyUserSessions

Dependencias:
- express-session
- memorystore
- config/env.ts

Flujo de datos:
El navegador envía la cookie rush.sid; el servidor busca en memoria los datos de esa sesión (userId)
y los adjunta a la petición.

Aspectos técnicos importantes:
- No se usan JWT: el identificador de sesión es aleatorio y los datos viven en el servidor.
- Como el almacén está en memoria, reiniciar el backend cierra todas las sesiones (decisión A-17).
- El mismo middleware se reutiliza para autenticar las conexiones Socket.IO.

Lugar en la arquitectura:
Capa HTTP / autenticación; lo usan app.ts, routes/auth.ts y realtime/socket.ts. Es la base de cómo
el sistema recuerda quién ha iniciado sesión.
*/
