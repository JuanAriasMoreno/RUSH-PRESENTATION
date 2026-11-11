import type { MembershipRole } from '@rush/shared';
import { db, type DbOrTx } from '../db';
import { forbidden, notFound } from '../http/errors';

export async function getMembershipRole(roomId: number, userId: number, q: DbOrTx = db): Promise<MembershipRole | null> {
  const row = await q
    .selectFrom('room_membership')
    .select('membership_role')
    .where('room_id', '=', roomId)
    .where('user_id', '=', userId)
    .executeTakeFirst();
  return row?.membership_role ?? null;
}

/** Rooms are private: non-members get 404 so room existence is not leaked. */
export async function requireRoomMember(roomId: number, userId: number, q: DbOrTx = db): Promise<MembershipRole> {
  const role = await getMembershipRole(roomId, userId, q);
  if (!role) throw notFound('Room');
  return role;
}

export const isManager = (role: MembershipRole | null) => role === 'OWNER' || role === 'ADMIN';

/** OWNER or ADMIN — room-management actions. */
export async function requireRoomManager(roomId: number, userId: number, q: DbOrTx = db): Promise<MembershipRole> {
  const role = await requireRoomMember(roomId, userId, q);
  if (!isManager(role)) throw forbidden('Only the room owner or an administrator can do this');
  return role;
}

export async function requireRoomOwner(roomId: number, userId: number, q: DbOrTx = db): Promise<void> {
  const role = await requireRoomMember(roomId, userId, q);
  if (role !== 'OWNER') throw forbidden('Only the room owner can do this');
}

export interface QuizAccess {
  quizId: number;
  creatorUserId: number;
  isOwner: boolean;
  isCollaborator: boolean;
  canEdit: boolean;
}

/**
 * Quiz permissions come only from quiz.creator_user_id and quiz_collaborator.
 * Room ADMINs get no implicit rights (design rule).
 */
export async function getQuizAccess(quizId: number, userId: number, q: DbOrTx = db): Promise<QuizAccess | null> {
  const quiz = await q.selectFrom('quiz').select(['quiz_id', 'creator_user_id']).where('quiz_id', '=', quizId).executeTakeFirst();
  if (!quiz) return null;
  const isOwner = quiz.creator_user_id === userId;
  const collab = isOwner
    ? undefined
    : await q
        .selectFrom('quiz_collaborator')
        .select('user_id')
        .where('quiz_id', '=', quizId)
        .where('user_id', '=', userId)
        .executeTakeFirst();
  const isCollaborator = !!collab;
  return { quizId, creatorUserId: quiz.creator_user_id, isOwner, isCollaborator, canEdit: isOwner || isCollaborator };
}

export async function requireQuizEditor(quizId: number, userId: number, q: DbOrTx = db): Promise<QuizAccess> {
  const access = await getQuizAccess(quizId, userId, q);
  if (!access || !access.canEdit) throw notFound('Quiz');
  return access;
}

export async function requireQuizOwner(quizId: number, userId: number, q: DbOrTx = db): Promise<QuizAccess> {
  const access = await requireQuizEditor(quizId, userId, q);
  if (!access.isOwner) throw forbidden('Only the quiz owner can do this');
  return access;
}

/*
=========================================================
EXPLICACIÓN DEL ARCHIVO
=========================================================

Propósito: Centraliza las comprobaciones de permisos sobre salas y cuestionarios.

Responsabilidades principales:
- getMembershipRole: rol del usuario en una sala (OWNER, ADMIN, MEMBER o null).
- requireRoomMember: 404 si no es miembro (no revela que la sala existe).
- requireRoomManager: solo OWNER o ADMIN; requireRoomOwner: solo OWNER.
- getQuizAccess, requireQuizEditor, requireQuizOwner: permisos de cuestionario basados solo en
  quiz.creator_user_id y quiz_collaborator.

Elementos importantes:
- getMembershipRole
- requireRoomMember
- isManager
- requireRoomManager
- requireRoomOwner
- interface QuizAccess
- getQuizAccess
- requireQuizEditor
- requireQuizOwner

Dependencias:
- db/index.ts
- http/errors.ts
- @rush/shared (MembershipRole)

Flujo de datos:
Consulta room_membership, quiz y quiz_collaborator; devuelve el rol o lanza un error HTTP.

Aspectos técnicos importantes:
- Un ADMIN de sala no obtiene permisos implícitos sobre los cuestionarios (regla de negocio).
- Las funciones aceptan una transacción opcional para usarse dentro de operaciones atómicas.

Lugar en la arquitectura:
Capa de servicios: autorización. Es la implementación real de la autorización del sistema.
*/
