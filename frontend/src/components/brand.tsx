import { cx } from './ui';

/** RUSH! wordmark. `size` scales the whole mark; `neon` uses the animated gradient. */
export function Logo({ size = 'md', neon = false, className }: { size?: 'sm' | 'md' | 'lg' | 'hero'; neon?: boolean; className?: string }) {
  const sizes = {
    sm: 'text-xl',
    md: 'text-2xl',
    lg: 'text-4xl',
    hero: 'text-[clamp(4.5rem,18vw,11rem)] leading-[0.85]',
  };
  return (
    <span className={cx('inline-flex select-none items-baseline font-display font-black italic tracking-tighter', sizes[size], className)} aria-label="RUSH!">
      <span aria-hidden="true" className={neon ? 'text-neon animate-shimmer drop-shadow-[0_0_24px_rgb(240_0_200/0.45)]' : 'text-fg'}>
        RUSH
      </span>
      <span aria-hidden="true" className="text-sun drop-shadow-[0_0_14px_rgb(255_230_0/0.7)]">
        !
      </span>
    </span>
  );
}

const TILE_COLORS = ['#F000C8', '#00D9FF', '#39F500', '#FFE600', '#FF9500', '#A020F0', '#FF3030'];

/**
 * Illuminated dance-floor grid (decorative). Pure CSS: tiles in perspective with staggered glow.
 * aria-hidden; animation is disabled for users who prefer reduced motion (see index.css).
 */
export function NeonFloor({ cols = 12, rows = 7, className, dim = false }: { cols?: number; rows?: number; className?: string; dim?: boolean }) {
  const tiles = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const color = TILE_COLORS[(r * 3 + c * 5 + ((r * c) % 4)) % TILE_COLORS.length]!;
      const lit = (r * 7 + c * 3) % 5 !== 0;
      tiles.push(
        <span
          key={`${r}-${c}`}
          className={cx('rounded-[6px]', lit && 'animate-tile')}
          style={{
            background: lit ? color : 'transparent',
            boxShadow: lit ? `0 0 18px ${color}, inset 0 0 12px rgb(255 255 255 / 0.35)` : 'inset 0 0 0 1px rgb(255 255 255 / 0.06)',
            animationDelay: `${((r * cols + c) * 137) % 3200}ms`,
          }}
        />,
      );
    }
  }
  return (
    <div aria-hidden="true" className={cx('pointer-events-none absolute inset-x-0 bottom-0 overflow-hidden', className)} style={{ perspective: '900px', opacity: dim ? 0.4 : undefined }}>
      <div
        className="absolute bottom-0 left-[-20%] grid w-[140%] gap-2 p-2 sm:gap-3"
        style={{
          gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
          aspectRatio: `${cols} / ${rows}`,
          transform: 'rotateX(58deg)',
          transformOrigin: '50% 100%',
          maskImage: 'linear-gradient(to top, black 45%, transparent 100%)',
          WebkitMaskImage: 'linear-gradient(to top, black 45%, transparent 100%)',
        }}
      >
        {tiles}
      </div>
    </div>
  );
}

/** Small row of neon dots used as a section divider / accent. */
export function NeonDots({ className }: { className?: string }) {
  return (
    <span className={cx('inline-flex gap-1.5', className)} aria-hidden="true">
      {['bg-magenta', 'bg-cyan', 'bg-lime', 'bg-sun', 'bg-tangerine'].map((c) => (
        <span key={c} className={cx('h-1.5 w-1.5 rounded-full shadow-[0_0_8px_currentColor]', c)} />
      ))}
    </span>
  );
}

/*
=========================================================
EXPLICACIÓN DEL ARCHIVO
=========================================================

Propósito: Contiene los elementos de marca: el logotipo RUSH! y el fondo decorativo de baldosas de
neón.

Responsabilidades principales:
- Logo: texto RUSH con signo de exclamación amarillo y tamaños sm/md/lg/hero.
- NeonFloor: cuadrícula de baldosas de colores en perspectiva con brillo animado.
- NeonDots: fila de puntos de colores.

Elementos importantes:
- Logo
- NeonFloor
- NeonDots

Dependencias:
- components/ui.tsx (cx)

Flujo de datos:
Componentes puramente visuales.

Aspectos técnicos importantes:
- NeonFloor está marcado con aria-hidden para no molestar a los lectores de pantalla.

Lugar en la arquitectura:
Capa de presentación. Aporta la identidad visual de la página de inicio y del juego.
*/
