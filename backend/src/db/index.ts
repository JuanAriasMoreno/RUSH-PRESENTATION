import { Kysely, MysqlDialect, type MysqlPool, type Transaction } from 'kysely';
import { createPool, type Pool, type PoolOptions } from 'mysql2';
import { env } from '../config/env';
import type { DB } from './types';

export type Db = Kysely<DB>;
export type Tx = Transaction<DB>;
export type DbOrTx = Db | Tx;

export function poolOptions(database: string | undefined): PoolOptions {
  return {
    host: env.DB_HOST,
    port: env.DB_PORT,
    user: env.DB_USER,
    password: env.DB_PASSWORD,
    database,
    connectionLimit: 10,
    charset: 'utf8mb4_0900_ai_ci',
    timezone: 'Z',
    supportBigNumbers: true,
    bigNumberStrings: false,
    decimalNumbers: true,
    // BOOLEAN columns are TINYINT(1): return real booleans. Generated helper flags are TINYINT(4).
    typeCast(field, next) {
      if (field.type === 'TINY' && field.length === 1) {
        const v = field.string();
        return v === null ? null : v === '1';
      }
      return next();
    },
  };
}

function createDb(): { db: Db; pool: Pool } {
  const pool = createPool(poolOptions(env.database));
  // All DATETIME values are UTC: make CURRENT_TIMESTAMP/NOW() use UTC regardless of server settings.
  pool.on('connection', (conn) => {
    conn.query("SET time_zone = '+00:00'");
  });
  return { db: new Kysely<DB>({ dialect: new MysqlDialect({ pool: pool as unknown as MysqlPool }) }), pool };
}

const created = createDb();
export const db: Db = created.db;

export async function closeDb(): Promise<void> {
  await db.destroy();
}

/** Runs `fn` in a transaction (InnoDB, REPEATABLE READ). Use for every multi-table write. */
export function transaction<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
  return db.transaction().execute(fn);
}

/** MySQL error code helper (e.g. ER_DUP_ENTRY). */
export function mysqlErrorCode(err: unknown): string | undefined {
  return typeof err === 'object' && err !== null && 'code' in err ? String((err as { code: unknown }).code) : undefined;
}

/*
=========================================================
EXPLICACIÓN DEL ARCHIVO
=========================================================

Propósito: Crea la conexión a MySQL (un pool de conexiones de mysql2) y la instancia de Kysely que
usa todo el backend para consultar la base de datos.

Responsabilidades principales:
- Definir las opciones del pool: host, puerto, usuario, contraseña y base de datos tomados de env.
- Convertir los tipos de MySQL a tipos de JavaScript: BOOLEAN (TINYINT(1)) a true/false, DECIMAL a
  número, fechas en UTC.
- Ejecutar SET time_zone = "+00:00" en cada conexión nueva para que CURRENT_TIMESTAMP sea UTC.
- Exponer transaction(fn) para ejecutar varias operaciones dentro de una transacción.
- Exponer mysqlErrorCode(err) para reconocer errores como ER_DUP_ENTRY (valor duplicado).

Elementos importantes:
- poolOptions(database)
- db: instancia Kysely<DB> exportada
- transaction(fn)
- closeDb()
- mysqlErrorCode(err)
- tipos Db, Tx, DbOrTx

Dependencias:
- kysely (Kysely, MysqlDialect)
- mysql2 (createPool)
- config/env.ts
- db/types.ts (interfaz DB)

Flujo de datos:
Recibe consultas construidas con Kysely desde los servicios; las envía a MySQL como SQL
parametrizado y devuelve filas tipadas.

Aspectos técnicos importantes:
- Kysely genera SQL con parámetros (?), lo que protege contra inyección SQL.
- El typeCast distingue TINYINT(1) (booleanos reales) de las columnas generadas
  owner_flag/correct_flag/active_flag, que son TINYINT(4) y se mantienen como número.
- El conjunto de caracteres es utf8mb4 (admite coreano y emojis).

Lugar en la arquitectura:
Es la capa de acceso a datos: entre los servicios (lógica de negocio) y el servidor MySQL. Toda
lectura y escritura en la base de datos pasa por el objeto db definido aquí.
*/
