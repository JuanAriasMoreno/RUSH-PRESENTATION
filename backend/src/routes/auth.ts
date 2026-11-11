import { Router, type Request } from 'express';
import {
  changePasswordSchema,
  deleteAccountSchema,
  loginSchema,
  registerSchema,
  updatePreferencesSchema,
  updateProfileSchema,
} from '@rush/shared';
import { AppError, parse } from '../http/errors';
import { ah, authLimiter, currentUser, requireAuth, sensitiveLimiter } from '../http/middleware';
import { destroyUserSessions, SESSION_COOKIE } from '../http/session';
import * as users from '../services/users';
import { hooks } from '../services/hooks';

export const authRouter = Router();

/** Prevents session fixation: a fresh session id on every login. */
function establishSession(req: Request, userId: number): Promise<void> {
  return new Promise((resolve, reject) => {
    req.session.regenerate((err) => {
      if (err) return reject(err);
      req.session.userId = userId;
      req.session.save((e) => (e ? reject(e) : resolve()));
    });
  });
}

authRouter.post('/auth/register', authLimiter, ah(async (req, res) => {
  const input = parse(registerSchema, req.body);
  const userId = await users.register(input);
  await establishSession(req, userId);
  res.status(201).json(await users.getMe(userId));
}));

authRouter.post('/auth/login', authLimiter, ah(async (req, res) => {
  const { identifier, password } = parse(loginSchema, req.body);
  const userId = await users.verifyCredentials(identifier, password);
  if (!userId) throw new AppError(401, 'invalid_credentials', 'Incorrect username/email or password');
  await establishSession(req, userId);
  res.json(await users.getMe(userId));
}));

authRouter.post('/auth/logout', (req, res, next) => {
  req.session.destroy((err) => {
    if (err) return next(err);
    res.clearCookie(SESSION_COOKIE);
    res.status(204).end();
  });
});

authRouter.get('/auth/me', requireAuth, ah(async (req, res) => {
  res.json(await users.getMe(currentUser(req).userId));
}));

authRouter.patch('/me/profile', requireAuth, ah(async (req, res) => {
  if (req.body && typeof req.body === 'object' && 'email' in req.body) {
    throw new AppError(400, 'email_immutable', 'The email address cannot be changed');
  }
  const input = parse(updateProfileSchema, req.body);
  await users.updateProfile(currentUser(req).userId, input);
  res.json(await users.getMe(currentUser(req).userId));
}));

authRouter.patch('/me/preferences', requireAuth, ah(async (req, res) => {
  const input = parse(updatePreferencesSchema, req.body);
  await users.updatePreferences(currentUser(req).userId, input);
  res.json(await users.getMe(currentUser(req).userId));
}));

authRouter.post('/me/password', requireAuth, sensitiveLimiter, ah(async (req, res) => {
  const { currentPassword, newPassword } = parse(changePasswordSchema, req.body);
  const { userId } = currentUser(req);
  await users.changePassword(userId, currentPassword, newPassword);
  // Log out every other device; keep this one with a fresh session id.
  await destroyUserSessions(userId, req.sessionID);
  hooks.userGone(userId);
  await establishSession(req, userId);
  res.status(204).end();
}));

authRouter.delete('/me', requireAuth, sensitiveLimiter, ah(async (req, res) => {
  const { password } = parse(deleteAccountSchema, req.body);
  const { userId } = currentUser(req);
  await users.deleteAccount(userId, password);
  await destroyUserSessions(userId);
  res.clearCookie(SESSION_COOKIE);
  res.status(204).end();
}));

authRouter.get('/users/:username', requireAuth, ah(async (req, res) => {
  res.json(await users.getPublicProfile(currentUser(req).userId, String(req.params.username)));
}));

/*
=========================================================
EXPLICACIÓN DEL ARCHIVO
=========================================================

Propósito: Define las rutas de autenticación y de la cuenta del usuario: registro, inicio y cierre
de sesión, perfil, preferencias, cambio de contraseña, eliminación de cuenta y perfil público.

Responsabilidades principales:
- POST /api/auth/register y POST /api/auth/login (con authLimiter).
- POST /api/auth/logout y GET /api/auth/me.
- PATCH /api/me/profile (rechaza el campo email), PATCH /api/me/preferences.
- POST /api/me/password y DELETE /api/me (con sensitiveLimiter).
- GET /api/users/:username.

Elementos importantes:
- authRouter
- establishSession(req, userId): regenera la sesión y guarda userId

Dependencias:
- express
- @rush/shared (registerSchema, loginSchema, etc.)
- http/errors.ts
- http/middleware.ts
- http/session.ts
- services/users.ts
- services/hooks.ts

Flujo de datos:
Recibe JSON del frontend (authApi en endpoints.ts), lo valida con Zod, llama a services/users.ts y
devuelve el usuario actual (MeDto) o un estado 204.

Aspectos técnicos importantes:
- Al iniciar sesión se regenera el identificador de sesión para evitar la fijación de sesión.
- Al cambiar la contraseña se cierran las demás sesiones del usuario y se crea una nueva para el
  dispositivo actual.

Lugar en la arquitectura:
Capa de controladores (routes): delgada; la lógica está en services/users.ts. Es la puerta de
entrada de la autenticación del sistema.
*/
