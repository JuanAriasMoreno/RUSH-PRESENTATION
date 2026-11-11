/** npm run db:migrate → applies the additive schema migrations to DB_NAME (never deletes data). */
import { env } from '../config/env';
import { closeDb, db } from '../db';
import { runMigrations } from '../db/migrations';

const applied = await runMigrations(db);
console.log(applied.length ? `Migrated "${env.database}":\n- ${applied.join('\n- ')}` : `Database "${env.database}" is up to date.`);
await closeDb();
export {};

/*
=========================================================
EXPLICACIÓN DEL ARCHIVO
=========================================================

Propósito: Script de línea de comandos que aplica las migraciones aditivas a DB_NAME.

Responsabilidades principales:
- Ejecutar runMigrations y mostrar los cambios aplicados.

Elementos importantes:
- Código de nivel superior con await

Dependencias:
- db/migrations.ts

Flujo de datos:
Lee la configuración de .env y modifica solo la estructura de DB_NAME (sin borrar datos).

Aspectos técnicos importantes:
- El backend también ejecuta estas migraciones al arrancar.

Lugar en la arquitectura:
Herramienta de mantenimiento de la base de datos.
*/
