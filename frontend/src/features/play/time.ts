/** "4:05" — remaining time on the global quiz timer. */
export function formatClock(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

/** "5 min", "4 min 30 s", "45 s" — a configured time limit. */
export function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  if (m === 0) return `${s} s`;
  return s === 0 ? `${m} min` : `${m} min ${s} s`;
}

/*
=========================================================
EXPLICACIÓN DEL ARCHIVO
=========================================================

Propósito: Da formato a los tiempos del temporizador global del cuestionario.

Responsabilidades principales:
- formatClock(ms): tiempo restante como m:ss.
- formatDuration(segundos): tiempo total configurado, por ejemplo "5 min".

Elementos importantes:
- formatClock
- formatDuration

Dependencias:
- Ninguna

Flujo de datos:
Recibe números y devuelve textos para la pantalla.

Aspectos técnicos importantes:
- Redondea hacia arriba los segundos restantes para no mostrar 0:00 antes de tiempo.

Lugar en la arquitectura:
Utilidad de la capa de presentación (partida, sala de espera y editor de cuestionarios).
*/
