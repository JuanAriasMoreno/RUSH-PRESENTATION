import type { ApiErrorBody } from '@rush/shared';

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: unknown,
  ) {
    super(message);
  }
}

type Method = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

/** Same-origin JSON client. The session cookie is HttpOnly and sent automatically. */
export async function api<T>(method: Method, path: string, body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`/api${path}`, {
      method,
      credentials: 'same-origin',
      headers: body !== undefined && !(body instanceof FormData) ? { 'Content-Type': 'application/json' } : undefined,
      body: body === undefined ? undefined : body instanceof FormData ? body : JSON.stringify(body),
    });
  } catch {
    throw new ApiError(0, 'network_error', 'Network error');
  }
  if (res.status === 204) return undefined as T;
  const text = await res.text();
  let data: unknown = undefined;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
  }
  if (!res.ok) {
    const err = (data as ApiErrorBody | undefined)?.error;
    throw new ApiError(res.status, err?.code ?? 'http_error', err?.message ?? `Request failed (${res.status})`, err?.details);
  }
  return data as T;
}

export const get = <T>(path: string) => api<T>('GET', path);
export const post = <T>(path: string, body?: unknown) => api<T>('POST', path, body ?? {});
export const put = <T>(path: string, body?: unknown) => api<T>('PUT', path, body);
export const patch = <T>(path: string, body?: unknown) => api<T>('PATCH', path, body);
export const del = <T = void>(path: string, body?: unknown) => api<T>('DELETE', path, body);

/*
=========================================================
EXPLICACIÓN DEL ARCHIVO
=========================================================

Propósito: Implementa el cliente HTTP genérico con fetch para comunicarse con la API REST del
backend.

Responsabilidades principales:
- Enviar peticiones a /api/... con la cookie de sesión del mismo origen (credentials: same-origin).
- Serializar el cuerpo a JSON (o enviar FormData para archivos).
- Convertir las respuestas de error en ApiError con estado, código y mensaje.

Elementos importantes:
- class ApiError
- api(method, path, body)
- get, post, put, patch, del

Dependencias:
- fetch del navegador
- @rush/shared (ApiErrorBody)

Flujo de datos:
Recibe método, ruta y cuerpo; devuelve el JSON de la respuesta tipado, o lanza ApiError.

Aspectos técnicos importantes:
- Un error de red se convierte en ApiError con código network_error.
- La respuesta 204 devuelve undefined.

Lugar en la arquitectura:
Capa de comunicación del frontend. Todas las llamadas REST pasan por esta función.
*/
