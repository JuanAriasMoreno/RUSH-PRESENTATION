import type { QuestionType } from '@rush/shared';

/**
 * Visual identity of each question type (presentation only).
 * `fg` is the text colour that keeps WCAG contrast on the chip gradient.
 */
export const QUESTION_TYPE_STYLE: Record<QuestionType, { glyph: string; chip: string; ring: string; fg: string }> = {
  MULTIPLE_CHOICE: { glyph: 'ABC', chip: 'from-magenta to-violet', ring: 'ring-magenta/50', fg: 'text-white' },
  TRUE_FALSE: { glyph: 'T/F', chip: 'from-cyan to-violet', ring: 'ring-cyan/50', fg: 'text-white' },
  OPEN_ANSWER: { glyph: 'Aa', chip: 'from-lime to-cyan', ring: 'ring-lime/50', fg: 'text-night' },
  FILL_IN_THE_BLANK: { glyph: '_ _', chip: 'from-sun to-tangerine', ring: 'ring-sun/50', fg: 'text-night' },
  MATCHING: { glyph: '⇄', chip: 'from-tangerine to-magenta', ring: 'ring-tangerine/50', fg: 'text-white' },
};

/*
=========================================================
EXPLICACIÓN DEL ARCHIVO
=========================================================

Propósito: Asigna a cada tipo de pregunta un símbolo y unos colores para distinguirlos visualmente.

Responsabilidades principales:
- QUESTION_TYPE_STYLE: glyph, degradado del chip, anillo de selección y color de texto legible.

Elementos importantes:
- QUESTION_TYPE_STYLE

Dependencias:
- @rush/shared (QuestionType)

Flujo de datos:
Datos de presentación usados por el editor y por el juego.

Aspectos técnicos importantes:
- Los colores claros usan texto oscuro para mantener el contraste.

Lugar en la arquitectura:
Capa de presentación. Coherencia visual de los tipos de pregunta.
*/
