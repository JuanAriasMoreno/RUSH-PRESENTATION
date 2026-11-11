/**
 * npm run db:init           → applies database/rush_schema.sql to DB_NAME only if no RUSH table exists.
 * npm run db:reset -- --yes → drops and recreates all RUSH tables in DB_NAME (ALL DATA IS LOST).
 */
import readline from 'node:readline/promises';
import { env } from '../config/env';
import { applySchema, existingRushTables, mysqlVersion, SCHEMA_PATH } from '../db/schema';

async function confirm(question: string): Promise<boolean> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const answer = await rl.question(question);
  rl.close();
  return answer.trim() === env.DB_NAME;
}

function versionOk(v: string): boolean {
  const [maj, min, patch] = v.split(/[.-]/).map((x) => Number.parseInt(x, 10));
  if (maj! !== 8) return maj! > 8;
  return min! > 0 || patch! >= 16;
}

async function main() {
  const reset = process.argv.includes('--reset');
  const yes = process.argv.includes('--yes');
  const db = env.DB_NAME;

  const version = await mysqlVersion();
  console.log(`MySQL ${version} at ${env.DB_HOST}:${env.DB_PORT}, database "${db}"`);
  if (!versionOk(version)) {
    console.error('MySQL 8.0.16 or later is required (CHECK constraints must be enforced).');
    process.exit(1);
  }

  const existing = await existingRushTables(db);
  if (existing.length > 0 && !reset) {
    console.log(`Database "${db}" already contains ${existing.length} RUSH tables — nothing was changed.`);
    console.log('To wipe it and start over, run: npm run db:reset');
    return;
  }
  if (existing.length > 0 && reset && !yes) {
    console.log(`WARNING: this deletes ALL data in ${existing.length} tables of "${db}".`);
    if (!(await confirm(`Type the database name (${db}) to confirm: `))) {
      console.log('Aborted. Nothing was changed.');
      return;
    }
  }
  await applySchema(db);
  console.log(`Applied ${SCHEMA_PATH} to "${db}".`);
}

main().then(
  () => process.exit(0),
  (err) => {
    console.error('Database initialisation failed:', err instanceof Error ? err.message : err);
    process.exit(1);
  },
);

/*
=========================================================
EXPLICACIÓN DEL ARCHIVO
=========================================================

Propósito: Script de línea de comandos que crea el esquema de la base de datos (npm run db:init) o
lo reinicia (npm run db:reset).

Responsabilidades principales:
- Mostrar la versión de MySQL y exigir 8.0.16 o superior (necesaria para que se apliquen las
  restricciones CHECK).
- Si las tablas RUSH ya existen y no se pidió reinicio, no cambia nada.
- Con --reset pide escribir el nombre de la base de datos para confirmar (salvo --yes).
- Aplicar database/rush_schema.sql a DB_NAME.

Elementos importantes:
- confirm(question)
- versionOk(version)
- main()

Dependencias:
- config/env.ts
- db/schema.ts
- node:readline/promises

Flujo de datos:
Lee la configuración y el archivo SQL; crea la base de datos y sus tablas.

Aspectos técnicos importantes:
- db:reset borra todos los datos de DB_NAME: solo debe usarse en desarrollo.

Lugar en la arquitectura:
Herramienta de administración (fuera de la aplicación en ejecución). Es el procedimiento documentado
para crear la base de datos.
*/
