import type { NextFunction, Request, RequestHandler, Response } from 'express';
import rateLimit from 'express-rate-limit';
import { env } from '../config/env';
import { db } from '../db';
import { forbidden, unauthorized } from './errors';

export interface AuthUser {
  userId: number;
  username: string;
  accountRole: 'USER' | 'SUPERADMIN';
}

declare module 'express-serve-static-core' {
  interface Request {
    user?: AuthUser;
  }
}

/** Wraps async route handlers so rejections reach the error handler. */
export const ah =
  (fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>): RequestHandler =>
  (req, res, next) => {
    fn(req, res, next).catch(next);
  };

/** Loads the logged-in user from the session (the user row is re-read so deleted accounts lose access). */
export const loadUser: RequestHandler = (req, _res, next) => {
  const userId = req.session?.userId;
  if (!userId) return next();
  db.selectFrom('user')
    .select(['user_id', 'username', 'account_role'])
    .where('user_id', '=', userId)
    .executeTakeFirst()
    .then((row) => {
      if (row) req.user = { userId: row.user_id, username: row.username, accountRole: row.account_role };
      else delete req.session.userId;
      next();
    })
    .catch(next);
};

export const requireAuth: RequestHandler = (req, _res, next) => {
  if (!req.user) return next(unauthorized());
  next();
};

export const requireSuperadmin: RequestHandler = (req, _res, next) => {
  if (!req.user) return next(unauthorized());
  if (req.user.accountRole !== 'SUPERADMIN') return next(forbidden('Superadmin only'));
  next();
};

export function currentUser(req: Request): AuthUser {
  if (!req.user) throw unauthorized();
  return req.user;
}

/**
 * CSRF protection for cookie sessions: state-changing requests must come from the app's own origin
 * (Origin/Referer check) in addition to the SameSite=Lax cookie.
 */
export const originCheck: RequestHandler = (req, _res, next) => {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  const origin = req.get('origin') ?? (req.get('referer') ? new URL(req.get('referer')!).origin : undefined);
  const allowed = new Set([new URL(env.APP_URL).origin, new URL(env.PUBLIC_API_URL).origin]);
  if (!origin) {
    // Non-browser clients (tests, curl) send no Origin; browsers always send it on cross-site POSTs.
    return env.isProd ? next(forbidden('Missing origin')) : next();
  }
  if (!allowed.has(origin)) return next(forbidden('Cross-origin request blocked'));
  next();
};

const limiter = (windowMs: number, limit: number) =>
  rateLimit({
    windowMs,
    limit: env.isTest ? 10_000 : limit,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: { error: { code: 'rate_limited', message: 'Too many requests, please try again later' } },
  });

export const authLimiter = limiter(15 * 60 * 1000, 20); // login / register
export const sensitiveLimiter = limiter(15 * 60 * 1000, 10); // password change, account deletion
export const invitationLimiter = limiter(15 * 60 * 1000, 60);
export const translationLimiter = limiter(60 * 1000, 30);
export const uploadLimiter = limiter(15 * 60 * 1000, 60);

/*
=========================================================
EXPLICACIÓN DEL ARCHIVO
=========================================================

Propósito: Reúne el middleware de Express: carga del usuario autenticado, exigencia de inicio de
sesión, rol SUPERADMIN, protección CSRF por origen y limitadores de peticiones.

Responsabilidades principales:
- ah(fn): envuelve rutas asíncronas para que sus errores lleguen al manejador global.
- loadUser: si la sesión tiene userId, vuelve a leer el usuario de la base de datos y lo coloca en
  req.user.
- requireAuth y requireSuperadmin: rechazan con 401/403 cuando no corresponde.
- originCheck: en peticiones que modifican datos, exige que la cabecera Origin (o Referer) sea la
  del frontend o la del propio backend.
- Limitadores: authLimiter (20 por 15 min), sensitiveLimiter (10), invitationLimiter (60),
  translationLimiter (30 por minuto), uploadLimiter (60).

Elementos importantes:
- interface AuthUser
- ah
- loadUser
- requireAuth
- requireSuperadmin
- currentUser
- originCheck
- authLimiter, sensitiveLimiter, invitationLimiter, translationLimiter, uploadLimiter

Dependencias:
- express
- express-rate-limit
- config/env.ts
- db/index.ts

Flujo de datos:
Lee la sesión y las cabeceras de cada petición; añade req.user o corta la petición con un error.

Aspectos técnicos importantes:
- Releer el usuario en cada petición hace que una cuenta eliminada pierda el acceso de inmediato.
- Sin cabecera Origin (clientes como pruebas o curl) se acepta fuera de producción; en producción se
  rechaza.
- En pruebas los límites se elevan a 10 000 para no interferir.

Lugar en la arquitectura:
Capa HTTP: se ejecuta antes de los controladores (routes). Implementa la autenticación por petición,
la autorización básica por rol y protecciones contra abuso.
*/
