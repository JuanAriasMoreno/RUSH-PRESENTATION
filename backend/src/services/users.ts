import bcrypt from 'bcryptjs';
import { sql } from 'kysely';
import type { MeDto, PublicUserDto } from '@rush/shared';
import type { z } from 'zod';
import type { registerSchema, updatePreferencesSchema, updateProfileSchema } from '@rush/shared';
import { db, mysqlErrorCode, transaction } from '../db';
import type { UserRow } from '../db/types';
import { AppError, badRequest, conflict, notFound } from '../http/errors';
import { hooks } from './hooks';
import { SECURITY_QUESTION_COUNT } from '@rush/shared';


const BCRYPT_ROUNDS = process.env.VITEST ? 4 : 12;
// Used to keep login timing similar when the account does not exist.
const DUMMY_HASH = bcrypt.hashSync('dummy-password-for-timing', BCRYPT_ROUNDS);

export const hashPassword = (password: string) => bcrypt.hash(password, BCRYPT_ROUNDS);
const MAX_RECOVERY_ATTEMPTS = 5;
const RECOVERY_LOCK_MINUTES = 15;

export const normalizeAnswer = (raw: string) => raw.trim().toLowerCase().replace(/\s+/g, ' ');

export function toPublicUser(u: Pick<UserRow, 'user_id' | 'full_name' | 'username' | 'profile_picture_url' | 'description' | 'learning_language'>): PublicUserDto {
  return {
    userId: u.user_id,
    fullName: u.full_name,
    username: u.username,
    profilePictureUrl: u.profile_picture_url,
    description: u.description,
    learningLanguage: u.learning_language,
  };
}

export async function getMe(userId: number): Promise<MeDto> {
  const row = await db
    .selectFrom('user as u')
    .innerJoin('user_preferences as p', 'p.user_id', 'u.user_id')
    .select([
      'u.user_id', 'u.full_name', 'u.username', 'u.email', 'u.profile_picture_url', 'u.description',
      'u.learning_language', 'u.account_role', 'u.created_at', 'p.interface_language', 'p.translation_target_language',
    ])
    .where('u.user_id', '=', userId)
    .executeTakeFirst();
  if (!row) throw notFound('User');
  return {
    userId: row.user_id,
    fullName: row.full_name,
    username: row.username,
    email: row.email,
    profilePictureUrl: row.profile_picture_url,
    description: row.description,
    learningLanguage: row.learning_language,
    accountRole: row.account_role,
    createdAt: row.created_at.toISOString(),
    preferences: { interfaceLanguage: row.interface_language, translationTargetLanguage: row.translation_target_language },
  };
}

async function assertAvailable(username: string, email?: string, exceptUserId?: number) {
  const byName = await db.selectFrom('user').select('user_id').where('username', '=', username).executeTakeFirst();
  if (byName && byName.user_id !== exceptUserId) throw conflict('username_taken', 'This username is already taken');
  if (email) {
    const byEmail = await db.selectFrom('user').select('user_id').where('email', '=', email).executeTakeFirst();
    if (byEmail) throw conflict('email_taken', 'An account with this email already exists');
  }
}

/** Creates the user and its preferences row in one transaction (design rule). */
export async function register(input: z.infer<typeof registerSchema>): Promise<number> {
  await assertAvailable(input.username, input.email);
  const passwordHash = await hashPassword(input.password);
  const answerHash = await hashPassword(normalizeAnswer(input.securityAnswer));
  try {
    return await transaction(async (tx) => {
      const res = await tx
        .insertInto('user')
        .values({
          full_name: input.fullName,
          username: input.username,
          email: input.email,
          password_hash: passwordHash,
          security_question_id: input.securityQuestionId,
          security_answer_hash: answerHash,
        })
        .executeTakeFirstOrThrow();
      const userId = Number(res.insertId);
      await tx.insertInto('user_preferences').values({ user_id: userId }).execute();
      return userId;
    });
  } catch (err) {
    if (mysqlErrorCode(err) === 'ER_DUP_ENTRY') throw conflict('duplicate', 'Username or email already in use');
    throw err;
  }
}


export async function verifyCredentials(identifier: string, password: string): Promise<number | null> {
  const id = identifier.trim();
  const row = await db
    .selectFrom('user')
    .select(['user_id', 'password_hash'])
    .where((eb) => eb.or([eb('username', '=', id), eb('email', '=', id.toLowerCase())]))
    .executeTakeFirst();
  const ok = await bcrypt.compare(password, row?.password_hash ?? DUMMY_HASH);
  return row && ok ? row.user_id : null;
}

/** Returns the user's question id; unknown accounts get a stable fake id so existence is not revealed. */
export async function getRecoveryQuestionId(identifier: string): Promise<number> {
  const id = identifier.trim();
  const row = await db
    .selectFrom('user')
    .select('security_question_id')
    .where((eb) => eb.or([eb('username', '=', id), eb('email', '=', id.toLowerCase())]))
    .executeTakeFirst();
  if (row?.security_question_id) return row.security_question_id;
  let sum = 0;
  for (const ch of id.toLowerCase()) sum += ch.charCodeAt(0);
  return (sum % SECURITY_QUESTION_COUNT) + 1;
}

/** Checks the answer and sets a new password. Returns the user id, or null on any failure. */
export async function resetPasswordWithAnswer(identifier: string, answer: string, newPassword: string): Promise<number | null> {
  const id = identifier.trim();
  const row = await db
    .selectFrom('user')
    .select(['user_id', 'security_answer_hash', 'recovery_failed_attempts', 'recovery_locked_until'])
    .where((eb) => eb.or([eb('username', '=', id), eb('email', '=', id.toLowerCase())]))
    .executeTakeFirst();
  // Always run bcrypt so the response time is similar for unknown accounts.
  const ok = await bcrypt.compare(normalizeAnswer(answer), row?.security_answer_hash ?? DUMMY_HASH);
  if (!row || !row.security_answer_hash) return null;
  if (row.recovery_locked_until && row.recovery_locked_until > new Date()) return null;

  if (!ok) {
    const attempts = row.recovery_failed_attempts + 1;
    const locked = attempts >= MAX_RECOVERY_ATTEMPTS;
    await db
      .updateTable('user')
      .set({
        recovery_failed_attempts: locked ? 0 : attempts,
        recovery_locked_until: locked ? new Date(Date.now() + RECOVERY_LOCK_MINUTES * 60_000) : null,
      })
      .where('user_id', '=', row.user_id)
      .execute();
    return null;
  }

  await db
    .updateTable('user')
    .set({ password_hash: await hashPassword(newPassword), recovery_failed_attempts: 0, recovery_locked_until: null })
    .where('user_id', '=', row.user_id)
    .execute();
  return row.user_id;
}


export async function updateProfile(userId: number, input: z.infer<typeof updateProfileSchema>): Promise<void> {
  if (input.username) await assertAvailable(input.username, undefined, userId);
  const values = {
    ...(input.fullName !== undefined && { full_name: input.fullName }),
    ...(input.username !== undefined && { username: input.username }),
    ...(input.profilePictureUrl !== undefined && { profile_picture_url: input.profilePictureUrl }),
    ...(input.description !== undefined && { description: input.description }),
    ...(input.learningLanguage !== undefined && { learning_language: input.learningLanguage }),
  };
  if (Object.keys(values).length === 0) return;
  await db.updateTable('user').set(values).where('user_id', '=', userId).execute();
}

export async function updatePreferences(userId: number, input: z.infer<typeof updatePreferencesSchema>): Promise<void> {
  const values = {
    ...(input.interfaceLanguage && { interface_language: input.interfaceLanguage }),
    ...(input.translationTargetLanguage && { translation_target_language: input.translationTargetLanguage }),
  };
  if (Object.keys(values).length === 0) return;
  await db.updateTable('user_preferences').set(values).where('user_id', '=', userId).execute();
}

async function checkPassword(userId: number, password: string): Promise<void> {
  const row = await db.selectFrom('user').select('password_hash').where('user_id', '=', userId).executeTakeFirst();
  if (!row || !(await bcrypt.compare(password, row.password_hash))) {
    throw new AppError(400, 'wrong_password', 'The current password is incorrect');
  }
}

export async function changePassword(userId: number, currentPassword: string, newPassword: string): Promise<void> {
  await checkPassword(userId, currentPassword);
  if (currentPassword === newPassword) throw badRequest('same_password', 'The new password must be different');
  await db.updateTable('user').set({ password_hash: await hashPassword(newPassword) }).where('user_id', '=', userId).execute();
}

/** Deletes the account. FK cascades remove owned rooms, quizzes, memberships, attempts and saved words (A-6). */
export async function deleteAccount(userId: number, password: string): Promise<void> {
  await checkPassword(userId, password);
  const rooms = await db.selectFrom('room').select('room_id').where('owner_user_id', '=', userId).execute();
  const quizzes = await db.selectFrom('quiz').select('quiz_id').where('creator_user_id', '=', userId).execute();
  hooks.beforeRoomsOrQuizzesDeleted(rooms.map((r) => r.room_id), quizzes.map((q) => q.quiz_id));
  hooks.userGone(userId);
  await db.deleteFrom('user').where('user_id', '=', userId).execute();
}

/** Profiles are visible to users who share a room or a quiz (A-25). */
export async function getPublicProfile(viewerId: number, username: string): Promise<PublicUserDto> {
  const u = await db
    .selectFrom('user')
    .select(['user_id', 'full_name', 'username', 'profile_picture_url', 'description', 'learning_language'])
    .where('username', '=', username)
    .executeTakeFirst();
  if (!u) throw notFound('User');
  if (u.user_id !== viewerId) {
    const shared = await sql<{ n: number }>`
      SELECT COUNT(*) AS n FROM (
        SELECT 1 FROM room_membership a JOIN room_membership b ON a.room_id = b.room_id
          WHERE a.user_id = ${viewerId} AND b.user_id = ${u.user_id}
        UNION ALL
        SELECT 1 FROM quiz q LEFT JOIN quiz_collaborator c ON c.quiz_id = q.quiz_id
          WHERE (q.creator_user_id = ${viewerId} AND c.user_id = ${u.user_id})
             OR (q.creator_user_id = ${u.user_id} AND c.user_id = ${viewerId})
        UNION ALL
        SELECT 1 FROM quiz_collaborator c1 JOIN quiz_collaborator c2 ON c1.quiz_id = c2.quiz_id
          WHERE c1.user_id = ${viewerId} AND c2.user_id = ${u.user_id}
      ) s`.execute(db);
    if (!shared.rows[0] || Number(shared.rows[0].n) === 0) throw notFound('User');
  }
  return toPublicUser(u);
}

/** Resolves a username or email to a user id (used for targeted invitations and collaborators). */
export async function findUserIdByIdentifier(identifier: string): Promise<{ userId: number; username: string; email: string; fullName: string } | null> {
  const id = identifier.trim();
  const row = await db
    .selectFrom('user')
    .select(['user_id', 'username', 'email', 'full_name'])
    .where((eb) => eb.or([eb('username', '=', id), eb('email', '=', id.toLowerCase())]))
    .executeTakeFirst();
  return row ? { userId: row.user_id, username: row.username, email: row.email, fullName: row.full_name } : null;
}

/*
=========================================================
EXPLICACIÓN DEL ARCHIVO
=========================================================

Propósito: Contiene la lógica de cuentas: registro, verificación de credenciales, perfil,
preferencias, contraseña, eliminación y perfiles públicos.

Responsabilidades principales:
- register: comprueba que usuario y correo estén libres, calcula el hash bcrypt y crea user y
  user_preferences en una transacción.
- verifyCredentials: busca por nombre de usuario o correo y compara la contraseña con
  bcrypt.compare.
- getMe: devuelve el usuario con sus preferencias (une user y user_preferences).
- updateProfile, updatePreferences, changePassword y deleteAccount (exigen la contraseña actual
  cuando corresponde).
- getPublicProfile: solo si ambos usuarios comparten una sala o un cuestionario; nunca devuelve el
  correo.

Elementos importantes:
- hashPassword
- toPublicUser
- getMe
- register
- verifyCredentials
- updateProfile
- updatePreferences
- changePassword
- deleteAccount
- getPublicProfile
- findUserIdByIdentifier

Dependencias:
- bcryptjs
- kysely (sql)
- db/index.ts
- http/errors.ts
- services/hooks.ts
- @rush/shared

Flujo de datos:
Recibe datos validados desde routes/auth.ts; lee y escribe las tablas user y user_preferences.

Aspectos técnicos importantes:
- Las contraseñas se procesan con bcrypt (12 rondas; 4 en pruebas). bcrypt incluye una sal aleatoria
  dentro del propio hash.
- Si el usuario no existe se compara contra un hash ficticio para que el tiempo de respuesta sea
  similar.
- getMe usa un INNER JOIN con user_preferences: un usuario sin fila de preferencias no puede
  cargarse.

Lugar en la arquitectura:
Capa de servicios. Implementa la seguridad de las contraseñas y la gestión de cuentas.
*/
