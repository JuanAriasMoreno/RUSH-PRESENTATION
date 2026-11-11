import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { ApiError } from '../api/client';
import { en, type TranslationKey } from './en';

type Vars = Record<string, string | number>;

interface I18n {
  t: (key: TranslationKey, vars?: Vars) => string;
  /** Localised message for an API error (falls back to the server message). */
  errorText: (err: unknown) => string;
  formatDate: (iso: string, withTime?: boolean) => string;
}

const I18nContext = createContext<I18n | null>(null);

function interpolate(text: string, vars?: Vars) {
  return vars ? text.replace(/\{(\w+)\}/g, (_, k: string) => String(vars[k] ?? `{${k}}`)) : text;
}

/** The interface is English-only. */
export function I18nProvider({ children }: { children: ReactNode }) {
  const value = useMemo<I18n>(() => {
    const t = (key: TranslationKey, vars?: Vars) => interpolate(en[key] ?? key, vars);
    return {
      t,
      errorText: (err) => {
        if (err instanceof ApiError) {
          const key = `err.${err.code}` as TranslationKey;
          return key in en ? t(key) : err.message;
        }
        return err instanceof Error ? err.message : t('common.errorTitle');
      },
      formatDate: (iso, withTime = false) =>
        new Date(iso).toLocaleString('en-US', withTime ? { dateStyle: 'medium', timeStyle: 'short' } : { dateStyle: 'medium' }),
    };
  }, []);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18n {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error('useI18n outside provider');
  return ctx;
}

/*
=========================================================
EXPLICACIÓN DEL ARCHIVO
=========================================================

Propósito: Proporciona los textos de la interfaz (solo en inglés) y utilidades de formato.

Responsabilidades principales:
- t(key, vars): texto traducido con sustitución de {variables}.
- errorText(err): mensaje traducido para cada código de error de la API.
- formatDate: fechas con formato en-US.

Elementos importantes:
- I18nProvider
- useI18n()

Dependencias:
- react
- i18n/en.ts
- api/client.ts (ApiError)

Flujo de datos:
Los componentes piden textos por clave; el proveedor devuelve el texto en inglés.

Aspectos técnicos importantes:
- La interfaz es solo en inglés; no hay cambio de idioma.

Lugar en la arquitectura:
Capa de presentación transversal. Centraliza todos los textos de la interfaz.
*/
