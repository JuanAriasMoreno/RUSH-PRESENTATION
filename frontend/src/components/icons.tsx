import type { SVGProps } from 'react';

/** Minimal stroke icon set (24×24, currentColor). Decorative by default. */
type IconProps = SVGProps<SVGSVGElement> & { size?: number };

function make(paths: string[]) {
  return function Icon({ size = 22, ...rest }: IconProps) {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false" {...rest}>
        {paths.map((d) => (
          <path key={d} d={d} />
        ))}
      </svg>
    );
  };
}

export const IconMenu = make(['M4 7h16', 'M4 12h16', 'M4 17h16']);
export const IconClose = make(['M6 6l12 12', 'M18 6L6 18']);
export const IconUser = make(['M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8z', 'M4 21a8 8 0 0 1 16 0']);
export const IconHome = make(['M3 11l9-8 9 8', 'M5 10v10h14V10']);
export const IconGrid = make(['M4 4h7v7H4z', 'M13 4h7v7h-7z', 'M4 13h7v7H4z', 'M13 13h7v7h-7z']);
export const IconDoor = make(['M14 3H6v18h8', 'M14 3l5 2v14l-5 2z', 'M11 12h.01']);
export const IconQuiz = make(['M9 9a3 3 0 1 1 4 2.8c-.6.3-1 .9-1 1.6V14', 'M12 17.5h.01', 'M4 4h16v16H4z']);
export const IconBook = make(['M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2z', 'M4 19V5', 'M9 7h6']);
export const IconShield = make(['M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z', 'M9 12l2 2 4-4']);
export const IconSettings = make([
  'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z',
  'M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z',
]);
export const IconLogout = make(['M15 4h4v16h-4', 'M10 17l-5-5 5-5', 'M5 12h11']);
export const IconBolt = make(['M13 2L4 14h7l-1 8 9-12h-7z']);
export const IconUsers = make(['M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z', 'M2 21a7 7 0 0 1 14 0', 'M16 3.5a4 4 0 0 1 0 7', 'M18 14a7 7 0 0 1 4 7']);
export const IconLive = make(['M12 14a2 2 0 1 0 0-4 2 2 0 0 0 0 4z', 'M7.8 7.8a6 6 0 0 0 0 8.4', 'M16.2 16.2a6 6 0 0 0 0-8.4', 'M4.9 4.9a10 10 0 0 0 0 14.2', 'M19.1 19.1a10 10 0 0 0 0-14.2']);
export const IconPencil = make(['M4 20h4L19 9l-4-4L4 16z', 'M13.5 6.5l4 4']);
export const IconTrophy = make(['M8 21h8', 'M12 17v4', 'M7 4h10v5a5 5 0 0 1-10 0z', 'M7 6H4a3 3 0 0 0 3 4', 'M17 6h3a3 3 0 0 1-3 4']);
export const IconPlay = make(['M7 4l13 8-13 8z']);
export const IconPlus = make(['M12 5v14', 'M5 12h14']);
export const IconArrow = make(['M5 12h14', 'M13 6l6 6-6 6']);

/*
=========================================================
EXPLICACIÓN DEL ARCHIVO
=========================================================

Propósito: Conjunto de iconos SVG de trazo usados en la navegación y las tarjetas.

Responsabilidades principales:
- make(paths): crea un componente de icono a partir de trazados SVG.
- Exportar iconos como IconMenu, IconUser, IconDoor, IconQuiz, IconPlay, IconTrophy, etc.

Elementos importantes:
- make
- IconMenu, IconClose, IconUser, IconHome, IconGrid, IconDoor, IconQuiz, IconBook, IconShield,
  IconSettings, IconLogout, IconBolt, IconUsers, IconLive, IconPencil, IconTrophy, IconPlay,
  IconPlus, IconArrow

Dependencias:
- react

Flujo de datos:
Componentes visuales sin datos.

Aspectos técnicos importantes:
- Los iconos usan currentColor y son decorativos (aria-hidden).

Lugar en la arquitectura:
Capa de presentación. Evita depender de una librería externa de iconos.
*/
