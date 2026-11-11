import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { env } from '../config/env';

/**
 * Media lives in external object storage; MySQL stores only the resulting URL.
 * - s3:    any S3-compatible bucket (AWS S3, Cloudflare R2, MinIO…)
 * - local: development fallback; files are written to backend/uploads and served at /media
 */
export interface StoredFile {
  url: string;
}

const EXT: Record<string, string> = {
  'image/jpeg': 'jpg', 'image/png': 'png', 'image/gif': 'gif', 'image/webp': 'webp',
  'audio/mpeg': 'mp3', 'audio/mp4': 'm4a', 'audio/ogg': 'ogg', 'audio/wav': 'wav', 'audio/x-wav': 'wav', 'audio/webm': 'weba',
  'video/mp4': 'mp4',
};
export const ALLOWED_MIME = new Set(Object.keys(EXT));

let s3: S3Client | null = null;
function s3Client(): S3Client {
  s3 ??= new S3Client({
    region: env.S3_REGION || 'auto',
    endpoint: env.S3_ENDPOINT || undefined,
    forcePathStyle: !!env.S3_ENDPOINT,
    credentials: { accessKeyId: env.S3_ACCESS_KEY_ID, secretAccessKey: env.S3_SECRET_ACCESS_KEY },
  });
  return s3;
}

export function storageBaseUrl(): string {
  return env.STORAGE_DRIVER === 's3'
    ? env.S3_PUBLIC_BASE_URL.replace(/\/$/, '')
    : `${env.PUBLIC_API_URL.replace(/\/$/, '')}/media`;
}

/** True when the URL points at this application's storage (files that passed upload validation). */
export function isOwnStorageUrl(url: string): boolean {
  const base = storageBaseUrl();
  return base.length > 0 && url.startsWith(`${base}/`);
}

export async function storeFile(buffer: Buffer, mimeType: string): Promise<StoredFile> {
  const ext = EXT[mimeType];
  if (!ext) throw new Error(`Unsupported type ${mimeType}`);
  const key = `questions/${new Date().toISOString().slice(0, 7)}/${crypto.randomBytes(16).toString('hex')}.${ext}`;
  if (env.STORAGE_DRIVER === 's3') {
    if (!env.S3_BUCKET || !env.S3_PUBLIC_BASE_URL) throw new Error('S3 storage is not configured');
    await s3Client().send(new PutObjectCommand({ Bucket: env.S3_BUCKET, Key: key, Body: buffer, ContentType: mimeType }));
  } else {
    const file = path.join(env.uploadsDir, key);
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, buffer);
  }
  return { url: `${storageBaseUrl()}/${key}` };
}

/*
=========================================================
EXPLICACIÓN DEL ARCHIVO
=========================================================

Propósito: Guarda los archivos subidos (imágenes, audio, video) en almacenamiento local o en un
bucket compatible con S3 y devuelve su URL.

Responsabilidades principales:
- Definir los tipos MIME permitidos y su extensión.
- Generar un nombre aleatorio con fecha: questions/AAAA-MM/<32 hex>.<ext>.
- Escribir el archivo en backend/uploads (STORAGE_DRIVER=local) o subirlo con PutObjectCommand
  (STORAGE_DRIVER=s3).
- storageBaseUrl e isOwnStorageUrl: reconocer si una URL pertenece al almacenamiento propio.

Elementos importantes:
- ALLOWED_MIME
- storageBaseUrl()
- isOwnStorageUrl(url)
- storeFile(buffer, mimeType)

Dependencias:
- @aws-sdk/client-s3
- node:fs/promises
- node:crypto
- config/env.ts

Flujo de datos:
Recibe el contenido binario y su tipo MIME; devuelve { url }. La base de datos solo guarda esa URL
(question_media.media_url).

Aspectos técnicos importantes:
- En modo local la URL es PUBLIC_API_URL/media/…, y app.ts sirve esos archivos estáticos.
- Las imágenes no se guardan dentro de MySQL, sino en el sistema de archivos o en S3.

Lugar en la arquitectura:
Capa de integraciones: la usa POST /api/media; questions.ts usa isOwnStorageUrl para validar videos.
Implementa el requisito de guardar los medios fuera de la base de datos.
*/
