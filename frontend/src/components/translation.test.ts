import { describe, expect, it } from 'vitest';
import { extractWord, isTranslatableElement } from './translation';

describe('extractWord', () => {
  it('accepts single English and Korean words and strips punctuation', () => {
    expect(extractWord('hello')).toBe('hello');
    expect(extractWord('  "Hello," ')).toBe('Hello');
    expect(extractWord("don't")).toBe("don't");
    expect(extractWord('사랑해요.')).toBe('사랑해요');
  });
  it('rejects phrases, numbers, other scripts and long strings', () => {
    expect(extractWord('hello world')).toBeNull();
    expect(extractWord('2024')).toBeNull();
    expect(extractWord('こんにちは')).toBeNull();
    expect(extractWord('a'.repeat(101))).toBeNull();
    expect(extractWord('')).toBeNull();
  });
});

describe('isTranslatableElement', () => {
  const make = (html: string) => {
    document.body.innerHTML = html;
    return document.getElementById('t');
  };
  it('allows plain text', () => {
    expect(isTranslatableElement(make('<p><span id="t">word</span></p>'))).toBe(true);
  });
  it('never translates buttons, links, inputs or opted-out areas', () => {
    expect(isTranslatableElement(make('<button><span id="t">Save</span></button>'))).toBe(false);
    expect(isTranslatableElement(make('<a href="/"><b id="t">Rooms</b></a>'))).toBe(false);
    expect(isTranslatableElement(make('<label id="t">Name</label>'))).toBe(false);
    expect(isTranslatableElement(make('<div role="button"><i id="t">x</i></div>'))).toBe(false);
    expect(isTranslatableElement(make('<div data-no-translate><p id="t">popup</p></div>'))).toBe(false);
    expect(isTranslatableElement(null)).toBe(false);
  });
});

/*
=========================================================
EXPLICACIÓN DEL ARCHIVO
=========================================================

Propósito: Pruebas de extractWord e isTranslatableElement.

Responsabilidades principales:
- Acepta palabras en inglés y coreano; rechaza frases, números y otros alfabetos.
- Nunca traduce botones, enlaces, etiquetas ni zonas excluidas.

Elementos importantes:
- 4 casos de prueba

Dependencias:
- vitest
- jsdom
- components/translation.ts

Flujo de datos:
Crea elementos HTML de prueba en jsdom.

Aspectos técnicos importantes:
- Prueba lógica pura sin red.

Lugar en la arquitectura:
Pruebas automatizadas. Protege la regla de qué se puede traducir.
*/
