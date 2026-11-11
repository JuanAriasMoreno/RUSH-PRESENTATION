import http from 'node:http';
import { env } from './config/env';
import { closeDb, db } from './db';
import { createApp } from './http/app';
import { createSocketServer, engine } from './realtime/socket';
import { runMigrations } from './db/migrations';
import { cancelOrphanedSessions } from './services/sessions';
import { sql } from 'kysely';

async function main() {
  try {
    await sql`SELECT 1`.execute(db);
  } catch (err) {
    console.error(`Cannot connect to MySQL at ${env.DB_HOST}:${env.DB_PORT} (database "${env.database}").`);
    console.error('Start it with `npm run db:up` and create the schema with `npm run db:init`. Details:', (err as Error).message);
    process.exit(1);
  }
  const tables = await sql<{ n: number }>`SELECT COUNT(*) AS n FROM information_schema.TABLES WHERE TABLE_SCHEMA = ${env.database} AND TABLE_NAME = 'user'`.execute(db);
  if (Number(tables.rows[0]?.n ?? 0) === 0) {
    console.error(`Database "${env.database}" has no RUSH schema. Run \`npm run db:init\` first.`);
    process.exit(1);
  }

  const migrated = await runMigrations(db);
  if (migrated.length > 0) console.log(`Database "${env.database}" migrated: ${migrated.join('; ')}`);

  const cancelled = await cancelOrphanedSessions();
  if (cancelled > 0) console.log(`Cancelled ${cancelled} session(s) left active by a previous run.`);

  const app = createApp();
  const server = http.createServer(app);
  createSocketServer(server);
  server.listen(env.PORT, () => {
    console.log(`RUSH! API listening on http://localhost:${env.PORT} (frontend: ${env.APP_URL})`);
    if (env.TRANSLATION_PROVIDER === 'google' && !env.GOOGLE_TRANSLATE_API_KEY) {
      console.warn('GOOGLE_TRANSLATE_API_KEY is empty: word translation is disabled (set TRANSLATION_PROVIDER=mock for local testing).');
    }
    if (!env.SMTP_HOST) console.log('SMTP_HOST is empty: emails are printed to this console instead of being sent.');
  });

  const shutdown = () => {
    void engine.shutdown();
    server.close(() => void closeDb().finally(() => process.exit(0)));
    setTimeout(() => process.exit(0), 5000).unref();
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

void main();

/*
=========================================================
EXPLICACIÓN DEL ARCHIVO
=========================================================

Propósito: Es el punto de arranque del servidor backend. Verifica la base de datos, crea el servidor
HTTP con Express y conecta Socket.IO.

Responsabilidades principales:
- Comprobar que MySQL responde (consulta SELECT 1) y que el esquema RUSH existe (busca la tabla user
  en information_schema).
- Aplicar las migraciones aditivas pendientes (runMigrations) a bases creadas con un esquema
  anterior.
- Cancelar las sesiones de juego que quedaron activas de una ejecución anterior
  (cancelOrphanedSessions).
- Crear la aplicación Express (createApp), envolverla en un servidor http y adjuntar Socket.IO
  (createSocketServer).
- Escuchar en el puerto PORT e informar por consola si faltan la clave de Google Translate o el
  servidor SMTP.
- Cerrar ordenadamente el servidor y la conexión a la base de datos ante SIGINT/SIGTERM.

Elementos importantes:
- main(): función asíncrona que hace todo el arranque.
- shutdown(): detiene el motor de juego, cierra el servidor y la base de datos.

Dependencias:
- config/env.ts (configuración)
- db/index.ts (db, closeDb)
- http/app.ts (createApp)
- realtime/socket.ts (createSocketServer, engine)
- services/sessions.ts (cancelOrphanedSessions)
- kysely (sql)

Flujo de datos:
No recibe peticiones directamente: prepara la infraestructura. Lee la configuración del archivo .env
(a través de env.ts) y escribe mensajes de diagnóstico en la consola.

Aspectos técnicos importantes:
- Si MySQL no está disponible o falta el esquema, el proceso termina con process.exit(1) y un
  mensaje que indica ejecutar npm run db:up y npm run db:init.
- Las sesiones activas se marcan como CANCELLED al arrancar porque los temporizadores del juego
  viven en memoria y no sobreviven a un reinicio (decisión A-21).

Lugar en la arquitectura:
Es la capa más externa del backend: une la capa HTTP (Express), la capa de tiempo real (Socket.IO) y
la capa de datos (MySQL). Sin este archivo el backend no se inicia; es el que ejecutan npm run dev
(tsx watch) y npm start (dist/index.js).
*/
