import { afterAll, beforeEach } from 'vitest';
import { env } from '../src/config/env';
import { closeDb } from '../src/db';
import { truncateAll } from '../src/db/schema';
import { outbox } from '../src/integrations/mailer';

if (env.database !== env.DB_TEST_NAME) throw new Error('Tests must run against the test database');

beforeEach(async () => {
  await truncateAll(env.DB_TEST_NAME);
  outbox.length = 0;
});

afterAll(async () => {
  await closeDb();
});

/*
=========================================================
EXPLICACIÓN DEL ARCHIVO
=========================================================

Propósito: Se ejecuta en cada archivo de prueba: vacía todas las tablas antes de cada prueba y
cierra la conexión al final.

Responsabilidades principales:
- Verificar que se usa la base de datos de pruebas.
- beforeEach: truncateAll y vaciar el buzón de correos simulados.
- afterAll: closeDb.

Elementos importantes:
- Hooks beforeEach y afterAll

Dependencias:
- src/config/env.ts
- src/db/index.ts
- src/db/schema.ts
- src/integrations/mailer.ts

Flujo de datos:
Deja la base de datos vacía antes de cada prueba.

Aspectos técnicos importantes:
- Cada prueba es independiente de las demás.

Lugar en la arquitectura:
Infraestructura de pruebas. Evita que unas pruebas afecten a otras.
*/
