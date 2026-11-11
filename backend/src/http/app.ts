import express from 'express';
import helmet from 'helmet';
import { env } from '../config/env';
import { authRouter } from '../routes/auth';
import { miscRouter } from '../routes/misc';
import { quizzesRouter } from '../routes/quizzes';
import { roomsRouter } from '../routes/rooms';
import { errorHandler } from './errors';
import { loadUser, originCheck } from './middleware';
import { sessionMiddleware } from './session';

export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  if (env.isProd) app.set('trust proxy', 1);

  app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));

  // Local development storage driver: uploaded media is served here (a real deployment uses S3).
  if (env.STORAGE_DRIVER === 'local') {
    app.use('/media', express.static(env.uploadsDir, { fallthrough: false, index: false, maxAge: '7d' }));
  }

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true });
  });

  const api = express.Router();
  api.use(express.json({ limit: '200kb' }));
  api.use(sessionMiddleware);
  api.use(originCheck);
  api.use(loadUser);
  api.use((_req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    next();
  });
  api.use(authRouter);
  api.use(roomsRouter);
  api.use(quizzesRouter);
  api.use(miscRouter);
  api.use((_req, res) => {
    res.status(404).json({ error: { code: 'not_found', message: 'Endpoint not found' } });
  });
  app.use('/api', api);
  app.use(errorHandler);
  return app;
}

/*
=========================================================
EXPLICACIÓN DEL ARCHIVO
=========================================================

Propósito: Construye la aplicación Express: registra el middleware de seguridad, las sesiones, las
rutas de la API y el manejador de errores.

Responsabilidades principales:
- Aplicar Helmet (cabeceras de seguridad HTTP).
- Servir los archivos subidos en /media cuando STORAGE_DRIVER=local.
- Exponer GET /api/health para comprobar que el servidor está vivo.
- Montar bajo /api: lectura de JSON (límite 200 kb), sesión, comprobación de origen, carga del
  usuario y los cuatro routers.
- Responder 404 en JSON para rutas inexistentes y delegar los errores en errorHandler.

Elementos importantes:
- createApp(): devuelve la aplicación Express configurada.

Dependencias:
- express
- helmet
- http/session.ts (sessionMiddleware)
- http/middleware.ts (originCheck, loadUser)
- http/errors.ts (errorHandler)
- routes/auth.ts, rooms.ts, quizzes.ts, misc.ts

Flujo de datos:
Recibe todas las peticiones HTTP; cada petición pasa por la cadena de middleware y llega al router
correspondiente, que devuelve JSON.

Aspectos técnicos importantes:
- El orden importa: primero la sesión, luego originCheck (protección CSRF) y luego loadUser, para
  que las rutas sepan quién es el usuario.
- Se añade Cache-Control: no-store para que el navegador no guarde respuestas de la API.

Lugar en la arquitectura:
Capa HTTP del backend; la crea index.ts y también las pruebas (test/helpers.ts) sin abrir un puerto
real. Define el orden de procesamiento de toda petición REST.
*/
