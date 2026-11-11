/** Pure helpers for word selection (unit-tested). */

/** Interactive controls are never translated (requirement: no buttons or interactive controls). */
export const NON_TRANSLATABLE_SELECTOR = [
  'button', 'a', 'input', 'textarea', 'select', 'option', 'label', 'summary',
  '[role="button"]', '[role="link"]', '[role="tab"]', '[role="menuitem"]', '[role="option"]', '[role="checkbox"]', '[role="radio"]',
  '[contenteditable=""]', '[contenteditable="true"]', '[data-no-translate]',
].join(',');

export function isTranslatableElement(el: Element | null): boolean {
  if (!el) return false;
  return el.closest(NON_TRANSLATABLE_SELECTOR) === null;
}

const WORD = /^[\p{L}\p{M}]+(?:['’-][\p{L}\p{M}]+)*$/u;
const LATIN = /^[A-Za-z'’-]+$/;
const HANGUL = /^[ᄀ-ᇿ㄰-㆏가-힯]+$/;

/** Returns the single English or Korean word in a selection, or null (phrases are not supported). */
export function extractWord(selection: string): string | null {
  const trimmed = selection.trim().replace(/^[^\p{L}]+|[^\p{L}]+$/gu, '');
  if (!trimmed || trimmed.length > 100 || /\s/.test(trimmed)) return null;
  if (!WORD.test(trimmed)) return null;
  if (!LATIN.test(trimmed) && !HANGUL.test(trimmed)) return null;
  return trimmed;
}

/*
=========================================================
EXPLICACIÓN DEL ARCHIVO
=========================================================

Propósito: Funciones puras que deciden si una selección de texto se puede traducir.

Responsabilidades principales:
- NON_TRANSLATABLE_SELECTOR: botones, enlaces, campos y elementos marcados con data-no-translate no
  se traducen.
- isTranslatableElement(el).
- extractWord(texto): devuelve una sola palabra inglesa o coreana sin signos de puntuación, o null.

Elementos importantes:
- NON_TRANSLATABLE_SELECTOR
- isTranslatableElement
- extractWord

Dependencias:
- Ninguna

Flujo de datos:
Recibe el texto seleccionado y devuelve la palabra o null.

Aspectos técnicos importantes:
- Las frases, números y otros alfabetos se rechazan (solo palabras individuales).

Lugar en la arquitectura:
Lógica de presentación. Cumple el requisito de traducir solo palabras de texto no interactivo.
*/
