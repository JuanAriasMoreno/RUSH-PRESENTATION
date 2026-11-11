import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { z } from 'zod';

const here = path.dirname(fileURLToPath(import.meta.url));
// backend/ folder, both when running from src/config (tsx) and from the dist/ bundle.
const backendRoot = path.basename(here) === 'dist' ? path.resolve(here, '..') : path.resolve(here, '../..');
// The single .env file lives at the project root (see .env.example).
dotenv.config({ path: path.resolve(backendRoot, '../.env') });

const bool = z
  .union([z.boolean(), z.string()])
  .transform((v) => (typeof v === 'boolean' ? v : ['1', 'true', 'yes'].includes(v.toLowerCase())));

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().default(4000),
  APP_URL: z.string().url().default('http://localhost:5173'),
  SESSION_SECRET: z.string().min(16, 'SESSION_SECRET must be at least 16 characters'),

  DB_HOST: z.string().default('127.0.0.1'),
  DB_PORT: z.coerce.number().int().default(3306),
  DB_USER: z.string().default('root'),
  DB_PASSWORD: z.string().default(''),
  DB_NAME: z.string().regex(/^[A-Za-z0-9_]+$/).default('rush'),
  DB_TEST_NAME: z.string().regex(/^[A-Za-z0-9_]+$/).default('rush_test'),

  TRANSLATION_PROVIDER: z.enum(['google', 'mock', 'none']).default('google'),
  GOOGLE_TRANSLATE_API_KEY: z.string().default(''),
  OPENAI_API_KEY: z.string().default(''),
  OPENAI_MODEL: z.string().default('gpt-4o-mini'),
  EXTERNAL_API_TIMEOUT_MS: z.coerce.number().int().positive().default(8000),

  SMTP_HOST: z.string().default(''),
  SMTP_PORT: z.coerce.number().int().default(587),
  SMTP_SECURE: bool.default(false),
  SMTP_USER: z.string().default(''),
  SMTP_PASSWORD: z.string().default(''),
  MAIL_FROM: z.string().default('RUSH! <no-reply@rush.local>'),

  STORAGE_DRIVER: z.enum(['local', 's3']).default('local'),
  PUBLIC_API_URL: z.string().url().default('http://localhost:4000'),
  S3_BUCKET: z.string().default(''),
  S3_REGION: z.string().default(''),
  S3_ENDPOINT: z.string().default(''),
  S3_ACCESS_KEY_ID: z.string().default(''),
  S3_SECRET_ACCESS_KEY: z.string().default(''),
  S3_PUBLIC_BASE_URL: z.string().default(''),
});

const isTest = process.env.NODE_ENV === 'test' || process.env.VITEST !== undefined;

const parsed = schema.safeParse({
  ...process.env,
  ...(isTest
    ? {
        NODE_ENV: 'test',
        SESSION_SECRET: process.env.SESSION_SECRET || 'test-session-secret-0123456789',
        TRANSLATION_PROVIDER: 'mock',
        SMTP_HOST: '',
        STORAGE_DRIVER: 'local',
      }
    : {}),
});

if (!parsed.success) {
  console.error('Invalid configuration (.env):');
  for (const issue of parsed.error.issues) console.error(`  ${issue.path.join('.')}: ${issue.message}`);
  process.exit(1);
}

const e = parsed.data;
if (e.NODE_ENV === 'production' && e.SESSION_SECRET.startsWith('change-me')) {
  console.error('SESSION_SECRET must be changed in production.');
  process.exit(1);
}

export const env = {
  ...e,
  isTest: e.NODE_ENV === 'test',
  isProd: e.NODE_ENV === 'production',
  /** Database actually used by this process (tests never touch DB_NAME). */
  database: e.NODE_ENV === 'test' ? e.DB_TEST_NAME : e.DB_NAME,
  uploadsDir: e.NODE_ENV === 'test' ? path.join(os.tmpdir(), 'rush-test-uploads') : path.join(backendRoot, 'uploads'),
};

/*
=========================================================
EXPLICACIÓN DEL ARCHIVO
=========================================================

Propósito: Carga y valida las variables de entorno del archivo .env de la raíz del proyecto y las
expone como un objeto tipado llamado env.

Responsabilidades principales:
- Cargar .env con dotenv, calculando la ruta tanto si se ejecuta desde src (tsx) como desde dist
  (compilado).
- Validar cada variable con un esquema Zod y aplicar valores por defecto (por ejemplo PORT=4000,
  DB_PORT=3306).
- Forzar valores seguros durante las pruebas automáticas (proveedor de traducción mock, sin SMTP,
  almacenamiento local).
- Abortar el arranque si la configuración es inválida o si SESSION_SECRET no se cambió en
  producción.
- Calcular valores derivados: env.database (DB_TEST_NAME en pruebas, DB_NAME en otro caso) y
  env.uploadsDir.

Elementos importantes:
- schema: esquema Zod con todas las variables (servidor, MySQL, traducción, SMTP, almacenamiento).
- bool: conversión de textos "true/1/yes" a booleano.
- env: objeto exportado que usa el resto del backend.

Dependencias:
- dotenv
- zod
- node:path, node:os, node:url

Flujo de datos:
Entrada: variables del archivo .env y de process.env. Salida: el objeto env, importado por casi
todos los módulos del backend.

Aspectos técnicos importantes:
- SESSION_SECRET debe tener al menos 16 caracteres; en producción se rechaza el valor de ejemplo
  "change-me…".
- En modo prueba (NODE_ENV=test o VITEST) la base de datos usada es DB_TEST_NAME, de modo que las
  pruebas nunca tocan DB_NAME.
- Los archivos subidos se guardan en backend/uploads (o en una carpeta temporal del sistema durante
  las pruebas).

Lugar en la arquitectura:
Capa de configuración transversal: todas las demás capas leen sus parámetros desde aquí. Centraliza
la configuración y evita que la aplicación arranque con parámetros incorrectos.
*/
