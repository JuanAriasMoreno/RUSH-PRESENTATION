import type { TopicDto } from '@rush/shared';
import { db, mysqlErrorCode } from '../db';
import { conflict, notFound } from '../http/errors';

const toDto = (t: { topic_id: number; name: string; topic_type: 'PREDEFINED' | 'CUSTOM'; created_by_user_id: number | null }): TopicDto => ({
  topicId: t.topic_id,
  name: t.name,
  topicType: t.topic_type,
  createdByUserId: t.created_by_user_id,
});

/** Topics a user can assign: all predefined topics plus their own custom topics. */
export async function listAssignableTopics(userId: number): Promise<TopicDto[]> {
  const rows = await db
    .selectFrom('topic')
    .select(['topic_id', 'name', 'topic_type', 'created_by_user_id'])
    .where((eb) => eb.or([eb('topic_type', '=', 'PREDEFINED'), eb('created_by_user_id', '=', userId)]))
    .orderBy('topic_type', 'desc') // PREDEFINED first
    .orderBy('name')
    .execute();
  return rows.map(toDto);
}

export async function listPredefinedTopics(): Promise<TopicDto[]> {
  const rows = await db
    .selectFrom('topic')
    .select(['topic_id', 'name', 'topic_type', 'created_by_user_id'])
    .where('topic_type', '=', 'PREDEFINED')
    .orderBy('name')
    .execute();
  return rows.map(toDto);
}

export async function createCustomTopic(userId: number, name: string): Promise<TopicDto> {
  try {
    const res = await db
      .insertInto('topic')
      .values({ name, topic_type: 'CUSTOM', created_by_user_id: userId })
      .executeTakeFirstOrThrow();
    return { topicId: Number(res.insertId), name, topicType: 'CUSTOM', createdByUserId: userId };
  } catch (err) {
    if (mysqlErrorCode(err) === 'ER_DUP_ENTRY') throw conflict('topic_exists', 'You already have a topic with this name');
    throw err;
  }
}

export async function deleteCustomTopic(userId: number, topicId: number): Promise<void> {
  const res = await db
    .deleteFrom('topic')
    .where('topic_id', '=', topicId)
    .where('topic_type', '=', 'CUSTOM')
    .where('created_by_user_id', '=', userId)
    .executeTakeFirst();
  if (Number(res.numDeletedRows) === 0) throw notFound('Topic');
}

/** Predefined names are unique among predefined topics; the collation makes the check case-insensitive. */
async function assertPredefinedNameFree(name: string, exceptId?: number) {
  const row = await db
    .selectFrom('topic')
    .select('topic_id')
    .where('topic_type', '=', 'PREDEFINED')
    .where('name', '=', name)
    .executeTakeFirst();
  if (row && row.topic_id !== exceptId) throw conflict('topic_exists', 'A predefined topic with this name already exists');
}

export async function createPredefinedTopic(name: string): Promise<TopicDto> {
  await assertPredefinedNameFree(name);
  const res = await db
    .insertInto('topic')
    .values({ name, topic_type: 'PREDEFINED', created_by_user_id: null })
    .executeTakeFirstOrThrow();
  return { topicId: Number(res.insertId), name, topicType: 'PREDEFINED', createdByUserId: null };
}

export async function renamePredefinedTopic(topicId: number, name: string): Promise<void> {
  await assertPredefinedNameFree(name, topicId);
  const res = await db
    .updateTable('topic')
    .set({ name })
    .where('topic_id', '=', topicId)
    .where('topic_type', '=', 'PREDEFINED')
    .executeTakeFirst();
  if (Number(res.numUpdatedRows) === 0 && Number(res.numChangedRows ?? 0) === 0) {
    const exists = await db.selectFrom('topic').select('topic_id').where('topic_id', '=', topicId).where('topic_type', '=', 'PREDEFINED').executeTakeFirst();
    if (!exists) throw notFound('Topic');
  }
}

/** Deleting a predefined topic also removes it from rooms (room_topic cascade). */
export async function deletePredefinedTopic(topicId: number): Promise<void> {
  const res = await db.deleteFrom('topic').where('topic_id', '=', topicId).where('topic_type', '=', 'PREDEFINED').executeTakeFirst();
  if (Number(res.numDeletedRows) === 0) throw notFound('Topic');
}

/*
=========================================================
EXPLICACIÓN DEL ARCHIVO
=========================================================

Propósito: Gestiona los temas de las salas: predefinidos (administrados por SUPERADMIN) y
personalizados (de cada usuario).

Responsabilidades principales:
- listAssignableTopics: temas predefinidos más los personalizados del usuario.
- createCustomTopic y deleteCustomTopic.
- createPredefinedTopic, renamePredefinedTopic y deletePredefinedTopic con nombres únicos entre
  predefinidos.

Elementos importantes:
- listAssignableTopics
- listPredefinedTopics
- createCustomTopic
- deleteCustomTopic
- createPredefinedTopic
- renamePredefinedTopic
- deletePredefinedTopic

Dependencias:
- db/index.ts
- http/errors.ts
- @rush/shared (TopicDto)

Flujo de datos:
Lee y escribe la tabla topic.

Aspectos técnicos importantes:
- La unicidad de nombres predefinidos se comprueba en la aplicación porque la clave única de la
  tabla no cubre created_by_user_id NULL.

Lugar en la arquitectura:
Capa de servicios. Permite clasificar las salas por tema.
*/
