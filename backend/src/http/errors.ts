import type { ErrorRequestHandler } from 'express';
import { ZodError, type ZodTypeAny, type z } from 'zod';
import { mysqlErrorCode } from '../db';

export class AppError extends Error {
  constructor(
    public status: number,
    public code: string,
    message?: string,
    public details?: unknown,
  ) {
    super(message ?? code);
  }
}

export const badRequest = (code: string, message?: string, details?: unknown) => new AppError(400, code, message, details);
export const unauthorized = (message = 'Authentication required') => new AppError(401, 'unauthorized', message);
export const forbidden = (message = 'You do not have permission to do this') => new AppError(403, 'forbidden', message);
export const notFound = (what = 'Resource') => new AppError(404, 'not_found', `${what} not found`);
export const conflict = (code: string, message?: string) => new AppError(409, code, message);

/** Parses input with a zod schema, throwing a 400 with field details on failure. */
export function parse<S extends ZodTypeAny>(schema: S, input: unknown): z.infer<S> {
  const r = schema.safeParse(input);
  if (!r.success) {
    throw badRequest('validation_error', 'Invalid input', r.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })));
  }
  return r.data;
}

export function parseId(value: unknown, what = 'id'): number {
  const n = Number(value);
  if (!Number.isSafeInteger(n) || n <= 0) throw badRequest('invalid_id', `Invalid ${what}`);
  return n;
}

export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof AppError) {
    res.status(err.status).json({ error: { code: err.code, message: err.message, details: err.details } });
    return;
  }
  if (err instanceof ZodError) {
    res.status(400).json({ error: { code: 'validation_error', message: 'Invalid input', details: err.issues } });
    return;
  }
  if (err?.type === 'entity.parse.failed') {
    res.status(400).json({ error: { code: 'invalid_json', message: 'Malformed JSON body' } });
    return;
  }
  if (err?.type === 'entity.too.large' || err?.code === 'LIMIT_FILE_SIZE') {
    res.status(413).json({ error: { code: 'too_large', message: 'Request is too large' } });
    return;
  }
  const code = mysqlErrorCode(err);
  if (code === 'ER_DUP_ENTRY') {
    res.status(409).json({ error: { code: 'duplicate', message: 'This value already exists' } });
    return;
  }
  if (code === 'ER_CHECK_CONSTRAINT_VIOLATED') {
    res.status(400).json({ error: { code: 'constraint_violation', message: 'A database rule was violated' } });
    return;
  }
  console.error('Unhandled error:', err);
  res.status(500).json({ error: { code: 'internal_error', message: 'Something went wrong' } });
};

/*
=========================================================
EXPLICACIÓN DEL ARCHIVO
=========================================================

Propósito: Define la clase de error de la aplicación, funciones para crear errores HTTP habituales y
el manejador global que convierte cualquier error en una respuesta JSON.

Responsabilidades principales:
- AppError con estado HTTP, código y mensaje.
- Atajos badRequest (400), unauthorized (401), forbidden (403), notFound (404), conflict (409).
- parse(schema, input): valida datos con Zod y lanza un 400 con el detalle de los campos inválidos.
- parseId(value): valida identificadores numéricos de la URL.
- errorHandler: traduce errores de Zod, JSON mal formado, archivos demasiado grandes y errores de
  MySQL (ER_DUP_ENTRY → 409, ER_CHECK_CONSTRAINT_VIOLATED → 400).

Elementos importantes:
- class AppError
- parse
- parseId
- errorHandler

Dependencias:
- express (ErrorRequestHandler)
- zod
- db/index.ts (mysqlErrorCode)

Flujo de datos:
Recibe excepciones lanzadas en rutas y servicios y produce respuestas con el formato { error: {
code, message, details? } }.

Aspectos técnicos importantes:
- Los errores no previstos se registran con console.error y se responden como 500 sin exponer
  detalles internos.

Lugar en la arquitectura:
Capa HTTP transversal: la usan todas las rutas y servicios. Garantiza respuestas de error coherentes
que el frontend traduce a mensajes en inglés o coreano.
*/
