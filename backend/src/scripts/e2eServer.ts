/**
 * Starts the API for the Playwright end-to-end tests against a dedicated, disposable database.
 * It never touches DB_NAME: the database is forced to DB_E2E_NAME (default "rush_e2e") and reset.
 */
const e2eDb = process.env.DB_E2E_NAME || 'rush_e2e';
if (!/_e2e$/.test(e2eDb)) {
  console.error(`Refusing to reset "${e2eDb}": the E2E database name must end with "_e2e".`);
  process.exit(1);
}
process.env.DB_NAME = e2eDb;
process.env.TRANSLATION_PROVIDER = 'mock';
process.env.SMTP_HOST = '';

const { applySchema } = await import('../db/schema');
await applySchema(e2eDb);
console.log(`E2E database "${e2eDb}" reset from database/rush_schema.sql`);
await import('../index');
export {};

/*
=========================================================
EXPLICACIÓN DEL ARCHIVO
=========================================================

Propósito: Arranca el backend para las pruebas de Playwright sobre una base de datos desechable que
se reinicia en cada ejecución.

Responsabilidades principales:
- Forzar DB_NAME al valor de DB_E2E_NAME (por defecto rush_e2e) y negarse si el nombre no termina en
  "_e2e".
- Activar el proveedor de traducción mock y desactivar SMTP.
- Aplicar el esquema y luego importar index.ts para arrancar el servidor.

Elementos importantes:
- Código de nivel superior con await

Dependencias:
- db/schema.ts
- index.ts

Flujo de datos:
Lo ejecuta Playwright (npm run e2e:server) con las variables definidas en
frontend/playwright.config.ts.

Aspectos técnicos importantes:
- La comprobación del sufijo _e2e evita borrar por error una base de datos real.

Lugar en la arquitectura:
Infraestructura de pruebas. Permite probar la aplicación completa sin tocar los datos de desarrollo.
*/
