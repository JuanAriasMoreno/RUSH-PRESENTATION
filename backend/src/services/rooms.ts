import type { MembershipRole, RoomDetailDto, RoomSummaryDto, TopicDto } from '@rush/shared';
import { LIMITS, type roomInputSchema, type roomUpdateSchema } from '@rush/shared';
import type { z } from 'zod';
import { db, mysqlErrorCode, transaction, type DbOrTx, type Tx } from '../db';
import { badRequest, conflict, forbidden, notFound } from '../http/errors';
import { emails } from '../integrations/mailer';
import { hooks } from './hooks';
import { getQuizAccess, isManager, requireRoomManager, requireRoomMember, requireRoomOwner } from './permissions';

/** Bundled default covers (A-24); served by the frontend. */
const DEFAULT_COVERS = ['/covers/cover-1.svg', '/covers/cover-2.svg', '/covers/cover-3.svg', '/covers/cover-4.svg'];
export function defaultCover(seed: number): string {
  return DEFAULT_COVERS[Math.abs(seed) % DEFAULT_COVERS.length]!;
}

async function topicsForRooms(roomIds: number[], q: DbOrTx = db): Promise<Map<number, TopicDto[]>> {
  const map = new Map<number, TopicDto[]>();
  if (roomIds.length === 0) return map;
  const rows = await q
    .selectFrom('room_topic as rt')
    .innerJoin('topic as t', 't.topic_id', 'rt.topic_id')
    .select(['rt.room_id', 't.topic_id', 't.name', 't.topic_type', 't.created_by_user_id'])
    .where('rt.room_id', 'in', roomIds)
    .orderBy('t.name')
    .execute();
  for (const r of rows) {
    const list = map.get(r.room_id) ?? [];
    list.push({ topicId: r.topic_id, name: r.name, topicType: r.topic_type, createdByUserId: r.created_by_user_id });
    map.set(r.room_id, list);
  }
  return map;
}

function summaryQuery(userId: number) {
  return db
    .selectFrom('room as r')
    .innerJoin('room_membership as m', (j) => j.onRef('m.room_id', '=', 'r.room_id').on('m.user_id', '=', userId))
    .select((eb) => [
      'r.room_id', 'r.name', 'r.description', 'r.cover_image_url', 'r.owner_user_id', 'r.created_at', 'm.membership_role',
      eb.selectFrom('room_membership as mm').select(eb.fn.countAll<number>().as('n')).whereRef('mm.room_id', '=', 'r.room_id').as('member_count'),
      eb.selectFrom('room_quiz as rq').select(eb.fn.countAll<number>().as('n')).whereRef('rq.room_id', '=', 'r.room_id').as('quiz_count'),
      eb.selectFrom('quiz_session as s').select('s.session_id').whereRef('s.room_id', '=', 'r.room_id').where('s.active_flag', '=', 1).limit(1).as('active_session_id'),
    ]);
}

type SummaryRow = Awaited<ReturnType<ReturnType<typeof summaryQuery>['executeTakeFirstOrThrow']>>;

function toSummary(r: SummaryRow, topics: TopicDto[]): RoomSummaryDto {
  return {
    roomId: r.room_id,
    name: r.name,
    description: r.description,
    coverImageUrl: r.cover_image_url,
    ownerUserId: r.owner_user_id,
    myRole: r.membership_role,
    memberCount: Number(r.member_count ?? 0),
    quizCount: Number(r.quiz_count ?? 0),
    topics,
    hasActiveSession: r.active_session_id !== null,
  };
}

export async function listMyRooms(userId: number): Promise<RoomSummaryDto[]> {
  const rows = await summaryQuery(userId).orderBy('r.name').execute();
  const topics = await topicsForRooms(rows.map((r) => r.room_id));
  return rows.map((r) => toSummary(r, topics.get(r.room_id) ?? []));
}

export async function getRoom(roomId: number, userId: number): Promise<RoomDetailDto> {
  const r = await summaryQuery(userId).where('r.room_id', '=', roomId).executeTakeFirst();
  if (!r) throw notFound('Room');
  const [topics, members, quizzes, active] = await Promise.all([
    topicsForRooms([roomId]),
    db
      .selectFrom('room_membership as m')
      .innerJoin('user as u', 'u.user_id', 'm.user_id')
      .select(['u.user_id', 'u.username', 'u.full_name', 'u.profile_picture_url', 'm.membership_role', 'm.joined_at'])
      .where('m.room_id', '=', roomId)
      .orderBy('m.joined_at')
      .execute(),
    db
      .selectFrom('room_quiz as rq')
      .innerJoin('quiz as q', 'q.quiz_id', 'rq.quiz_id')
      .innerJoin('user as u', 'u.user_id', 'q.creator_user_id')
      .leftJoin('quiz_collaborator as c', (j) => j.onRef('c.quiz_id', '=', 'q.quiz_id').on('c.user_id', '=', userId))
      .select((eb) => [
        'q.quiz_id', 'q.title', 'q.description', 'q.quiz_status', 'q.creator_user_id', 'u.username', 'rq.added_at', 'c.user_id as collab',
        eb.selectFrom('question as qq').select(eb.fn.countAll<number>().as('n')).whereRef('qq.quiz_id', '=', 'q.quiz_id').as('question_count'),
      ])
      .where('rq.room_id', '=', roomId)
      .orderBy('rq.added_at', 'desc')
      .execute(),
    db
      .selectFrom('quiz_session as s')
      .innerJoin('quiz as q', 'q.quiz_id', 's.quiz_id')
      .leftJoin('user as h', 'h.user_id', 's.host_user_id')
      .select(['s.session_id', 's.quiz_id', 'q.title', 's.session_status', 'h.username'])
      .where('s.room_id', '=', roomId)
      .where('s.active_flag', '=', 1)
      .executeTakeFirst(),
  ]);
  const roleRank: Record<MembershipRole, number> = { OWNER: 0, ADMIN: 1, MEMBER: 2 };
  return {
    ...toSummary(r, topics.get(roomId) ?? []),
    createdAt: r.created_at.toISOString(),
    members: members
      .map((m) => ({
        userId: m.user_id,
        username: m.username,
        fullName: m.full_name,
        profilePictureUrl: m.profile_picture_url,
        role: m.membership_role,
        joinedAt: m.joined_at.toISOString(),
      }))
      .sort((a, b) => roleRank[a.role] - roleRank[b.role]),
    quizzes: quizzes.map((q) => ({
      quizId: q.quiz_id,
      title: q.title,
      description: q.description,
      status: q.quiz_status,
      questionCount: Number(q.question_count ?? 0),
      creatorUsername: q.username,
      addedAt: q.added_at.toISOString(),
      canEdit: q.creator_user_id === userId || q.collab !== null,
    })),
    activeSession: active
      ? { sessionId: active.session_id, quizId: active.quiz_id, quizTitle: active.title, status: active.session_status, hostUsername: active.username }
      : null,
  };
}

/** Validates topic ids a user may assign (A-28): predefined, own custom, or already on the room. */
async function setRoomTopics(tx: Tx, roomId: number, userId: number, topicIds: number[]): Promise<void> {
  const unique = [...new Set(topicIds)];
  const current = await tx.selectFrom('room_topic').select('topic_id').where('room_id', '=', roomId).execute();
  const currentIds = new Set(current.map((c) => c.topic_id));
  const toAdd = unique.filter((id) => !currentIds.has(id));
  if (toAdd.length > 0) {
    const allowed = await tx
      .selectFrom('topic')
      .select('topic_id')
      .where('topic_id', 'in', toAdd)
      .where((eb) => eb.or([eb('topic_type', '=', 'PREDEFINED'), eb('created_by_user_id', '=', userId)]))
      .execute();
    if (allowed.length !== toAdd.length) throw badRequest('invalid_topic', 'One or more topics cannot be used');
    await tx.insertInto('room_topic').values(toAdd.map((topic_id) => ({ room_id: roomId, topic_id }))).execute();
  }
  const toRemove = [...currentIds].filter((id) => !unique.includes(id));
  if (toRemove.length > 0) {
    await tx.deleteFrom('room_topic').where('room_id', '=', roomId).where('topic_id', 'in', toRemove).execute();
  }
}

export async function createRoom(userId: number, input: z.infer<typeof roomInputSchema>): Promise<number> {
  return transaction(async (tx) => {
    // Lock the owner row so concurrent requests cannot both pass the 10-room check.
    await tx.selectFrom('user').select('user_id').where('user_id', '=', userId).forUpdate().executeTakeFirstOrThrow();
    const { n } = await tx
      .selectFrom('room')
      .select((eb) => eb.fn.countAll<number>().as('n'))
      .where('owner_user_id', '=', userId)
      .forUpdate()
      .executeTakeFirstOrThrow();
    if (Number(n) >= LIMITS.maxRoomsPerUser) {
      throw conflict('room_limit', `You can create at most ${LIMITS.maxRoomsPerUser} rooms`);
    }
    const res = await tx
      .insertInto('room')
      .values({
        owner_user_id: userId,
        name: input.name,
        description: input.description,
        cover_image_url: input.coverImageUrl ?? defaultCover(Number(n) + userId),
      })
      .executeTakeFirstOrThrow();
    const roomId = Number(res.insertId);
    await tx.insertInto('room_membership').values({ room_id: roomId, user_id: userId, membership_role: 'OWNER' }).execute();
    await setRoomTopics(tx, roomId, userId, input.topicIds);
    return roomId;
  });
}

export async function updateRoom(roomId: number, userId: number, input: z.infer<typeof roomUpdateSchema>): Promise<void> {
  await requireRoomManager(roomId, userId);
  await transaction(async (tx) => {
    const values = {
      ...(input.name !== undefined && { name: input.name }),
      ...(input.description !== undefined && { description: input.description }),
      ...(input.coverImageUrl !== undefined && { cover_image_url: input.coverImageUrl ?? defaultCover(roomId) }),
    };
    if (Object.keys(values).length > 0) await tx.updateTable('room').set(values).where('room_id', '=', roomId).execute();
    if (input.topicIds) await setRoomTopics(tx, roomId, userId, input.topicIds);
  });
}

/** A-3: room-created quizzes that are no longer in any room move into the creator's library. */
async function rehomeOrphanQuizzes(tx: Tx, quizIds: number[]): Promise<void> {
  if (quizIds.length === 0) return;
  await tx
    .updateTable('quiz')
    .set({ is_in_library: true })
    .where('quiz_id', 'in', quizIds)
    .where('is_in_library', '=', false)
    .where(({ not, exists, selectFrom }) =>
      not(exists(selectFrom('room_quiz as rq').select('rq.quiz_id').whereRef('rq.quiz_id', '=', 'quiz.quiz_id'))),
    )
    .execute();
}

export async function deleteRoom(roomId: number, userId: number): Promise<void> {
  await requireRoomOwner(roomId, userId);
  hooks.beforeRoomsOrQuizzesDeleted([roomId], []);
  await transaction(async (tx) => {
    const quizIds = (await tx.selectFrom('room_quiz').select('quiz_id').where('room_id', '=', roomId).execute()).map((r) => r.quiz_id);
    await tx.deleteFrom('room').where('room_id', '=', roomId).execute(); // cascades memberships, invitations, topics, room_quiz, sessions
    await rehomeOrphanQuizzes(tx, quizIds);
  });
}

/**
 * Adds a member while holding a lock on the room row so concurrent joins cannot exceed 40 members.
 * Must be called inside a transaction.
 */
export async function addMemberLocked(tx: Tx, roomId: number, userId: number): Promise<'added' | 'already_member'> {
  const room = await tx.selectFrom('room').select('room_id').where('room_id', '=', roomId).forUpdate().executeTakeFirst();
  if (!room) throw notFound('Room');
  const existing = await tx
    .selectFrom('room_membership')
    .select('user_id')
    .where('room_id', '=', roomId)
    .where('user_id', '=', userId)
    .forUpdate()
    .executeTakeFirst();
  if (existing) return 'already_member';
  const { n } = await tx
    .selectFrom('room_membership')
    .select((eb) => eb.fn.countAll<number>().as('n'))
    .where('room_id', '=', roomId)
    .forUpdate() // locking read: sees rows committed by concurrent joins (REPEATABLE READ snapshot would not)
    .executeTakeFirstOrThrow();
  if (Number(n) >= LIMITS.maxMembersPerRoom) {
    throw conflict('room_full', `This room already has the maximum of ${LIMITS.maxMembersPerRoom} members`);
  }
  await tx.insertInto('room_membership').values({ room_id: roomId, user_id: userId, membership_role: 'MEMBER' }).execute();
  return 'added';
}

export async function leaveRoom(roomId: number, userId: number): Promise<void> {
  const role = await requireRoomMember(roomId, userId);
  if (role === 'OWNER') throw badRequest('owner_cannot_leave', 'The owner cannot leave the room; delete it instead');
  await db.deleteFrom('room_membership').where('room_id', '=', roomId).where('user_id', '=', userId).execute();
  hooks.memberLeftRoom(roomId, userId);
}

export async function removeMember(roomId: number, actorId: number, targetId: number): Promise<void> {
  const actorRole = await requireRoomManager(roomId, actorId);
  if (actorId === targetId) throw badRequest('use_leave', 'Use "leave room" to remove yourself');
  const target = await db
    .selectFrom('room_membership as m')
    .innerJoin('user as u', 'u.user_id', 'm.user_id')
    .innerJoin('room as r', 'r.room_id', 'm.room_id')
    .select(['m.membership_role', 'u.email', 'r.name'])
    .where('m.room_id', '=', roomId)
    .where('m.user_id', '=', targetId)
    .executeTakeFirst();
  if (!target) throw notFound('Member');
  if (target.membership_role === 'OWNER') throw forbidden('The owner cannot be removed');
  if (actorRole === 'ADMIN' && target.membership_role !== 'MEMBER') {
    throw forbidden('Administrators can only remove regular members');
  }
  await db.deleteFrom('room_membership').where('room_id', '=', roomId).where('user_id', '=', targetId).execute();
  hooks.memberLeftRoom(roomId, targetId);
  emails.memberRemoved(target.email, target.name);
}

/** Only the OWNER appoints or demotes administrators (A-16). */
export async function setMemberRole(roomId: number, ownerId: number, targetId: number, role: 'ADMIN' | 'MEMBER'): Promise<void> {
  await requireRoomOwner(roomId, ownerId);
  const current = await db
    .selectFrom('room_membership')
    .select('membership_role')
    .where('room_id', '=', roomId)
    .where('user_id', '=', targetId)
    .executeTakeFirst();
  if (!current) throw notFound('Member');
  if (current.membership_role === 'OWNER') throw badRequest('owner_role_fixed', "The owner's role cannot be changed");
  await db
    .updateTable('room_membership')
    .set({ membership_role: role })
    .where('room_id', '=', roomId)
    .where('user_id', '=', targetId)
    .execute();
}

async function notifyQuizAdded(roomId: number, quizId: number, actorId: number): Promise<void> {
  const info = await db
    .selectFrom('room as r')
    .innerJoin('room_quiz as rq', 'rq.room_id', 'r.room_id')
    .innerJoin('quiz as q', 'q.quiz_id', 'rq.quiz_id')
    .select(['r.name', 'q.title'])
    .where('r.room_id', '=', roomId)
    .where('q.quiz_id', '=', quizId)
    .executeTakeFirst();
  if (!info) return;
  const members = await db
    .selectFrom('room_membership as m')
    .innerJoin('user as u', 'u.user_id', 'm.user_id')
    .select('u.email')
    .where('m.room_id', '=', roomId)
    .where('m.user_id', '!=', actorId)
    .execute();
  for (const m of members) emails.quizAdded(m.email, info.name, info.title, roomId);
}

/** A-27: the OWNER/ADMIN must also own or collaborate on the quiz. */
export async function addQuizToRoom(roomId: number, userId: number, quizId: number): Promise<void> {
  await requireRoomManager(roomId, userId);
  const access = await getQuizAccess(quizId, userId);
  if (!access) throw notFound('Quiz');
  if (!access.canEdit) throw forbidden('You can only add quizzes you own or collaborate on');
  try {
    await db.insertInto('room_quiz').values({ room_id: roomId, quiz_id: quizId }).execute();
  } catch (err) {
    if (mysqlErrorCode(err) === 'ER_DUP_ENTRY') throw conflict('already_added', 'This quiz is already in the room');
    throw err;
  }
  await notifyQuizAdded(roomId, quizId, userId).catch((e) => console.error('[mail] quizAdded', e));
}

/** Removing a quiz from a room never deletes the quiz itself. */
export async function removeQuizFromRoom(roomId: number, userId: number, quizId: number): Promise<void> {
  await requireRoomManager(roomId, userId);
  const active = await db
    .selectFrom('quiz_session')
    .select('session_id')
    .where('room_id', '=', roomId)
    .where('quiz_id', '=', quizId)
    .where('active_flag', '=', 1)
    .executeTakeFirst();
  if (active) throw conflict('session_active', 'This quiz is being played; end the session first');
  await transaction(async (tx) => {
    const res = await tx.deleteFrom('room_quiz').where('room_id', '=', roomId).where('quiz_id', '=', quizId).executeTakeFirst();
    if (Number(res.numDeletedRows) === 0) throw notFound('Quiz in this room');
    await rehomeOrphanQuizzes(tx, [quizId]);
  });
}

export { isManager, rehomeOrphanQuizzes };

/*
=========================================================
EXPLICACIÓN DEL ARCHIVO
=========================================================

Propósito: Contiene la lógica de salas privadas: listado, detalle, creación con límite, edición,
borrado, membresía, roles y cuestionarios asociados.

Responsabilidades principales:
- listMyRooms y getRoom: datos de las salas con recuentos de miembros, cuestionarios y sesión
  activa.
- createRoom: máximo 10 salas por propietario, con bloqueo de la fila del usuario; crea la membresía
  OWNER y asigna temas.
- addMemberLocked: añade un miembro bloqueando la sala y contando con lectura bloqueante para no
  superar 40 miembros.
- leaveRoom, removeMember (con correo), setMemberRole (solo el propietario nombra administradores).
- addQuizToRoom (solo cuestionarios propios o colaborados), removeQuizFromRoom (sin borrar el
  cuestionario).

Elementos importantes:
- defaultCover
- listMyRooms
- getRoom
- createRoom
- updateRoom
- deleteRoom
- addMemberLocked
- leaveRoom
- removeMember
- setMemberRole
- addQuizToRoom
- removeQuizFromRoom
- rehomeOrphanQuizzes

Dependencias:
- db/index.ts
- http/errors.ts
- integrations/mailer.ts
- services/hooks.ts
- services/permissions.ts
- @rush/shared

Flujo de datos:
Lee y escribe room, room_membership, room_topic, room_quiz y quiz.

Aspectos técnicos importantes:
- Las transacciones con SELECT … FOR UPDATE evitan que peticiones simultáneas superen los límites.
- Si una sala se crea sin portada se guarda una portada por defecto (/covers/cover-N.svg); en la
  versión de presentación siempre ocurre así.
- Un cuestionario creado desde una sala que queda sin salas pasa a la biblioteca de su creador
  (A-3).

Lugar en la arquitectura:
Capa de servicios. Implementa las reglas de negocio de salas y membresías.
*/
