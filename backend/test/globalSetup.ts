/** Creates the test database from database/rush_schema.sql once per test run. Never touches DB_NAME. */
export default async function setup() {
  process.env.NODE_ENV = 'test';
  const { env } = await import('../src/config/env');
  const { applySchema } = await import('../src/db/schema');
  if (env.DB_TEST_NAME === env.DB_NAME) {
    throw new Error(`DB_TEST_NAME must differ from DB_NAME (both are "${env.DB_NAME}")`);
  }
  await applySchema(env.DB_TEST_NAME);
}

/*
=========================================================
EXPLICACIÓN DEL ARCHIVO
=========================================================

Propósito: Prepara una vez, antes de todas las pruebas del backend, la base de datos de pruebas
aplicando rush_schema.sql.

Responsabilidades principales:
- Fijar NODE_ENV=test.
- Comprobar que DB_TEST_NAME es distinto de DB_NAME.
- Aplicar el esquema a DB_TEST_NAME.

Elementos importantes:
- setup() (exportación por defecto)

Dependencias:
- src/config/env.ts
- src/db/schema.ts

Flujo de datos:
Lo invoca Vitest según backend/vitest.config.ts.

Aspectos técnicos importantes:
- Protege la base de datos de desarrollo frente a las pruebas.

Lugar en la arquitectura:
Infraestructura de pruebas. Garantiza un esquema limpio para las pruebas de integración.
*/
