import { describe, expect, it } from 'vitest';
import { isWithin720p, readMp4Resolution } from '../src/integrations/mp4';
import { as, registerUser } from './helpers';

function box(type: string, payload: Buffer): Buffer {
  const header = Buffer.alloc(8);
  header.writeUInt32BE(8 + payload.length, 0);
  header.write(type, 4, 'latin1');
  return Buffer.concat([header, payload]);
}

/** Minimal MP4: ftyp + moov/trak/tkhd (version 0) with the given dimensions. */
export function fakeMp4(width: number, height: number): Buffer {
  const tkhd = Buffer.alloc(84);
  tkhd.writeUInt32BE(width * 65536, 76);
  tkhd.writeUInt32BE(height * 65536, 80);
  return Buffer.concat([box('ftyp', Buffer.from('isom\0\0\0\0isomavc1', 'latin1')), box('moov', box('trak', box('tkhd', tkhd)))]);
}

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);

describe('mp4 resolution', () => {
  it('reads tkhd dimensions', () => {
    expect(readMp4Resolution(fakeMp4(1280, 720))).toEqual({ width: 1280, height: 720 });
    expect(readMp4Resolution(Buffer.from('not a video'))).toBeNull();
  });
  it('enforces the 720p limit (portrait allowed)', () => {
    expect(isWithin720p({ width: 1280, height: 720 })).toBe(true);
    expect(isWithin720p({ width: 720, height: 1280 })).toBe(true);
    expect(isWithin720p({ width: 1920, height: 1080 })).toBe(false);
  });
});

describe('media upload', () => {
  it('stores valid files and returns a URL', async () => {
    const u = await registerUser();
    const img = await as(u).upload('/api/media').attach('file', PNG, { filename: 'a.png', contentType: 'image/png' });
    expect(img.status).toBe(201);
    expect(img.body.mediaType).toBe('IMAGE');
    expect(img.body.mediaUrl).toMatch(/\/media\/questions\/.+\.png$/);
    const vid = await as(u).upload('/api/media').attach('file', fakeMp4(1280, 720), { filename: 'v.mp4', contentType: 'video/mp4' });
    expect(vid.status).toBe(201);
    expect(vid.body.mediaType).toBe('VIDEO');
  });

  it('rejects videos above 720p, spoofed types and unsupported files', async () => {
    const u = await registerUser();
    const hd = await as(u).upload('/api/media').attach('file', fakeMp4(1920, 1080), { filename: 'v.mp4', contentType: 'video/mp4' });
    expect(hd.status).toBe(400);
    expect(hd.body.error.code).toBe('video_too_large');
    const spoof = await as(u).upload('/api/media').attach('file', Buffer.from('<html>'), { filename: 'a.png', contentType: 'image/png' });
    expect(spoof.body.error.code).toBe('invalid_file');
    const exe = await as(u).upload('/api/media').attach('file', Buffer.from('MZ'), { filename: 'a.exe', contentType: 'application/octet-stream' });
    expect(exe.body.error.code).toBe('unsupported_type');
  });

  it('accepts an uploaded video URL in a question but not an external one', async () => {
    const u = await registerUser();
    const vid = await as(u).upload('/api/media').attach('file', fakeMp4(640, 360), { filename: 'v.mp4', contentType: 'video/mp4' });
    const quiz = await as(u).post('/api/quizzes', { title: 'Q' });
    const q = { questionType: 'TRUE_FALSE', questionText: 'Watch', correctAnswer: true };
    expect((await as(u).post(`/api/quizzes/${quiz.body.quizId}/questions`, { ...q, media: vid.body })).status).toBe(201);
    const ext = await as(u).post(`/api/quizzes/${quiz.body.quizId}/questions`, { ...q, media: { mediaType: 'VIDEO', mediaUrl: 'https://youtube.com/x' } });
    expect(ext.body.error.code).toBe('video_upload_required');
  });
});

/*
=========================================================
EXPLICACIÓN DEL ARCHIVO
=========================================================

Propósito: Pruebas de la subida de archivos y de la lectura de resolución de videos MP4.

Responsabilidades principales:
- fakeMp4: construye un MP4 mínimo con la resolución deseada.
- Acepta PNG y videos de hasta 720p; rechaza videos mayores, archivos con firma falsa y tipos no
  admitidos.
- Un video subido puede usarse en una pregunta; un enlace de video externo no.

Elementos importantes:
- fakeMp4(width, height)
- 5 casos de prueba

Dependencias:
- vitest
- test/helpers.ts
- src/integrations/mp4.ts

Flujo de datos:
Envía archivos multipart a POST /api/media.

Aspectos técnicos importantes:
- Los archivos de prueba se guardan en una carpeta temporal del sistema.

Lugar en la arquitectura:
Pruebas automatizadas. Valida la seguridad básica de la subida de archivos.
*/
