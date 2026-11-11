import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createConnection } from 'mysql2/promise';
import { env } from '../config/env';

const here = path.dirname(fileURLToPath(import.meta.url));
export const SCHEMA_PATH = path.resolve(here, '../../../database/rush_schema.sql');

export const RUSH_TABLES = [
  'user', 'user_preferences', 'room', 'room_membership', 'room_invitation', 'topic', 'room_topic',
  'quiz', 'quiz_collaborator', 'room_quiz', 'question', 'answer_option', 'matching_pair',
  'question_media', 'quiz_session', 'quiz_attempt', 'user_answer', 'user_answer_match',
  'translation_cache', 'saved_word',
] as const;

async function adminConnection() {
  return createConnection({
    host: env.DB_HOST,
    port: env.DB_PORT,
    user: env.DB_USER,
    password: env.DB_PASSWORD,
    multipleStatements: true,
    charset: 'utf8mb4_0900_ai_ci',
  });
}

/** Reads rush_schema.sql unchanged, only retargeting the database name when it is not "rush". */
export async function loadSchemaSql(database: string): Promise<string> {
  if (!/^[A-Za-z0-9_]+$/.test(database)) throw new Error(`Invalid database name: ${database}`);
  const sql = await fs.readFile(SCHEMA_PATH, 'utf8');
  if (database === 'rush') return sql;
  return sql
    .replace('CREATE DATABASE IF NOT EXISTS `rush`', `CREATE DATABASE IF NOT EXISTS \`${database}\``)
    .replace('USE `rush`;', `USE \`${database}\`;`);
}

export async function existingRushTables(database: string): Promise<string[]> {
  const conn = await adminConnection();
  try {
    const [rows] = await conn.query(
      'SELECT TABLE_NAME AS t FROM information_schema.TABLES WHERE TABLE_SCHEMA = ?',
      [database],
    );
    const names = (rows as { t: string }[]).map((r) => r.t);
    return names.filter((n) => (RUSH_TABLES as readonly string[]).includes(n));
  } finally {
    await conn.end();
  }
}

export async function mysqlVersion(): Promise<string> {
  const conn = await adminConnection();
  try {
    const [rows] = await conn.query('SELECT VERSION() AS v');
    return (rows as { v: string }[])[0]!.v;
  } finally {
    await conn.end();
  }
}

/**
 * Applies database/rush_schema.sql. The file itself drops and recreates the RUSH tables, so callers
 * must check `existingRushTables` first unless they explicitly intend to reset.
 */
export async function applySchema(database: string): Promise<void> {
  const sql = await loadSchemaSql(database);
  const conn = await adminConnection();
  try {
    await conn.query(sql);
  } finally {
    await conn.end();
  }
}

/** Fast wipe of all rows (used only by the automated tests on the test database). */
export async function truncateAll(database: string): Promise<void> {
  if (database === env.DB_NAME && database !== env.DB_TEST_NAME) {
    throw new Error('Refusing to truncate the development database');
  }
  const conn = await adminConnection();
  try {
    await conn.query(`USE \`${database}\``);
    await conn.query('SET FOREIGN_KEY_CHECKS = 0');
    for (const t of RUSH_TABLES) await conn.query(`TRUNCATE TABLE \`${t}\``);
    await conn.query('SET FOREIGN_KEY_CHECKS = 1');
  } finally {
    await conn.end();
  }
}

/*
=========================================================
EXPLICACIÓN DEL ARCHIVO
=========================================================

Propósito: Contiene utilidades para aplicar el archivo database/rush_schema.sql a una base de datos
y para consultar qué tablas existen.

Responsabilidades principales:
- Leer rush_schema.sql y, si la base de datos destino no se llama "rush", reemplazar el nombre en
  CREATE DATABASE y USE.
- Consultar information_schema para saber qué tablas RUSH ya existen en una base de datos.
- Obtener la versión del servidor MySQL.
- Aplicar el esquema completo (applySchema) y vaciar todas las tablas (truncateAll, solo para la
  base de datos de pruebas).

Elementos importantes:
- SCHEMA_PATH
- RUSH_TABLES (lista de las 20 tablas)
- loadSchemaSql(database)
- existingRushTables(database)
- mysqlVersion()
- applySchema(database)
- truncateAll(database)

Dependencias:
- mysql2/promise (createConnection con multipleStatements)
- node:fs/promises
- config/env.ts

Flujo de datos:
Entrada: nombre de la base de datos. Salida: el esquema aplicado o la lista de tablas existentes.

Aspectos técnicos importantes:
- rush_schema.sql incluye DROP TABLE IF EXISTS; por eso quien llama debe comprobar antes si ya hay
  tablas (lo hace dbInit.ts).
- truncateAll se niega a vaciar la base de datos de desarrollo (DB_NAME); solo se usa en las
  pruebas.

Lugar en la arquitectura:
Herramienta de administración del esquema usada por los scripts (dbInit, e2eServer) y por las
pruebas. Es el mecanismo real con el que se crea el esquema: la aplicación no usa migraciones ni
crea tablas automáticamente al arrancar.
*/
