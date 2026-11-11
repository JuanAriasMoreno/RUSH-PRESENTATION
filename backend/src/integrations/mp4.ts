/**
 * Reads the display resolution of an MP4/MOV file from its track header boxes ('tkhd').
 * Used to enforce the "videos must not exceed 720p" rule without external tools (A-31).
 * Returns the largest video track dimensions, or null if the file is not a parseable MP4.
 */
const CONTAINERS = new Set(['moov', 'trak', 'mdia', 'minf', 'stbl', 'edts', 'udta']);

export function readMp4Resolution(buf: Buffer): { width: number; height: number } | null {
  let best: { width: number; height: number } | null = null;
  let sawFtyp = false;

  function walk(start: number, end: number, depth: number) {
    let pos = start;
    while (pos + 8 <= end && depth < 10) {
      let size = buf.readUInt32BE(pos);
      const type = buf.toString('latin1', pos + 4, pos + 8);
      let header = 8;
      if (size === 1) {
        if (pos + 16 > end) return;
        const big = buf.readBigUInt64BE(pos + 8);
        if (big > BigInt(Number.MAX_SAFE_INTEGER)) return;
        size = Number(big);
        header = 16;
      } else if (size === 0) {
        size = end - pos;
      }
      if (size < header || pos + size > end) return;
      if (type === 'ftyp') sawFtyp = true;
      if (CONTAINERS.has(type)) walk(pos + header, pos + size, depth + 1);
      if (type === 'tkhd') {
        const version = buf.readUInt8(pos + header);
        // width/height are the last 8 bytes of tkhd (16.16 fixed point)
        const whOffset = pos + header + (version === 1 ? 88 : 76);
        if (whOffset + 8 <= pos + size) {
          const width = Math.round(buf.readUInt32BE(whOffset) / 65536);
          const height = Math.round(buf.readUInt32BE(whOffset + 4) / 65536);
          if (width > 0 && height > 0) {
            if (!best || width * height > best.width * best.height) best = { width, height };
          }
        }
      }
      pos += size;
    }
  }

  try {
    walk(0, buf.length, 0);
  } catch {
    return null;
  }
  return sawFtyp ? best : null;
}

/** 720p rule: the shorter side must be ≤ 720 and the longer side ≤ 1280 (portrait videos allowed). */
export function isWithin720p(r: { width: number; height: number }): boolean {
  return Math.min(r.width, r.height) <= 720 && Math.max(r.width, r.height) <= 1280;
}

/*
=========================================================
EXPLICACIÓN DEL ARCHIVO
=========================================================

Propósito: Lee la resolución de un archivo MP4 directamente de sus cajas internas "tkhd" para
comprobar el límite de 720p sin herramientas externas.

Responsabilidades principales:
- Recorrer recursivamente las cajas (atoms) del contenedor MP4 (moov, trak, mdia…).
- Extraer ancho y alto (formato de punto fijo 16.16) de cada pista y quedarse con la mayor.
- isWithin720p: aceptar como máximo 720 px en el lado corto y 1280 px en el lado largo.

Elementos importantes:
- readMp4Resolution(buffer)
- isWithin720p(resolution)

Dependencias:
- Ninguna librería externa (solo Buffer de Node.js)

Flujo de datos:
Recibe el contenido binario del archivo subido y devuelve { width, height } o null si no es un MP4
válido.

Aspectos técnicos importantes:
- Admite cajas de tamaño extendido (64 bits) y limita la profundidad del recorrido.

Lugar en la arquitectura:
Integración usada por la ruta POST /api/media (routes/misc.ts). En la versión de presentación la
interfaz no permite subir videos, pero el backend conserva esta validación.
*/
