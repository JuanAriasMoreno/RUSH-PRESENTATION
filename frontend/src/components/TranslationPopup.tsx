import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { TranslationDto } from '@rush/shared';
import { ApiError } from '../api/client';
import { translationApi, vocabularyApi } from '../api/endpoints';
import { useI18n } from '../i18n/I18nProvider';
import { extractWord, isTranslatableElement } from './translation';
import { Button, Spinner } from './ui';

interface PopupState {
  word: string;
  x: number;
  y: number;
}

/**
 * Global word lookup: double-click (or select) a single word in non-interactive text.
 * The translation appears first; the contextual explanation loads afterwards.
 */
export function TranslationLayer({ disabled }: { disabled?: boolean }) {
  const [popup, setPopup] = useState<PopupState | null>(null);

  const onSelect = useCallback(() => {
    if (disabled) return;
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0 || sel.isCollapsed) return;
    const range = sel.getRangeAt(0);
    const node = range.commonAncestorContainer;
    const el = node.nodeType === Node.ELEMENT_NODE ? (node as Element) : node.parentElement;
    if (!isTranslatableElement(el)) return;
    const word = extractWord(sel.toString());
    if (!word) return;
    const rect = range.getBoundingClientRect();
    setPopup({ word, x: rect.left + rect.width / 2, y: rect.bottom });
  }, [disabled]);

  useEffect(() => {
    if (disabled) {
      setPopup(null);
      return;
    }
    const handler = () => setTimeout(onSelect, 10);
    document.addEventListener('dblclick', handler);
    document.addEventListener('mouseup', handler);
    document.addEventListener('touchend', handler);
    return () => {
      document.removeEventListener('dblclick', handler);
      document.removeEventListener('mouseup', handler);
      document.removeEventListener('touchend', handler);
    };
  }, [onSelect, disabled]);

  if (!popup) return null;
  return <TranslationPopup key={popup.word + popup.x} {...popup} onClose={() => setPopup(null)} />;
}

function TranslationPopup({ word, x, y, onClose }: PopupState & { onClose: () => void }) {
  const { t, errorText } = useI18n();
  const qc = useQueryClient();
  const ref = useRef<HTMLDivElement>(null);
  const [data, setData] = useState<TranslationDto | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [explanation, setExplanation] = useState<{ text: string | null; loading: boolean; failed: boolean }>({ text: null, loading: false, failed: false });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let alive = true;
    translationApi
      .translate(word)
      .then((d) => {
        if (!alive) return;
        setData(d);
        if (d.contextualExplanation) {
          setExplanation({ text: d.contextualExplanation, loading: false, failed: false });
          return;
        }
        setExplanation({ text: null, loading: true, failed: false });
        translationApi
          .explanation(d.translationId)
          .then((e) => alive && setExplanation({ text: e.contextualExplanation, loading: false, failed: false }))
          .catch(() => alive && setExplanation({ text: null, loading: false, failed: true }));
      })
      .catch((e) => alive && setError(e));
    return () => {
      alive = false;
    };
  }, [word]);

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    const onScroll = () => onClose();
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('scroll', onScroll);
    };
  }, [onClose]);

  const save = async () => {
    if (!data) return;
    setSaving(true);
    try {
      const saved = await vocabularyApi.save(data.translationId);
      setData({ ...data, savedWordId: saved.savedWordId });
      void qc.invalidateQueries({ queryKey: ['vocabulary'] });
    } catch (e) {
      if (e instanceof ApiError && e.code === 'already_saved') setData({ ...data, savedWordId: -1 });
      else setError(e);
    } finally {
      setSaving(false);
    }
  };

  const width = 320;
  const left = Math.min(Math.max(8, x - width / 2), window.innerWidth - width - 8);
  const top = Math.min(y + 8, window.innerHeight - 260);
  const langLabel = (l: 'ENGLISH' | 'KOREAN') => t(`lang.${l}`);

  return (
    <div
      ref={ref}
      data-no-translate
      role="dialog"
      aria-label={word}
      className="animate-pop fixed z-[70] rounded-2xl border border-line bg-panel-2 p-4 shadow-2xl"
      style={{ left, top: Math.max(8, top), width }}
      lang="en"
    >
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-lg font-bold text-fg">{word}</p>
        {data && (
          <p className="text-xs text-muted">
            {langLabel(data.sourceLanguage)} → {langLabel(data.targetLanguage)}
          </p>
        )}
      </div>
      {!data && !error && (
        <p className="mt-2 flex items-center gap-2 text-sm text-muted">
          <Spinner className="h-4 w-4" /> {t('tr.translating')}
        </p>
      )}
      {error !== null && <p className="mt-2 text-sm text-danger-soft">{error instanceof ApiError ? errorText(error) : t('tr.unavailable')}</p>}
      {data && (
        <>
          <p className="mt-1 text-xl font-semibold text-pink">{data.translatedWord}</p>
          <div className="mt-3 border-t border-line pt-3 text-sm text-fg-soft">
            {explanation.loading && (
              <span className="flex items-center gap-2 text-muted">
                <Spinner className="h-4 w-4" /> {t('tr.explaining')}
              </span>
            )}
            {explanation.text && <p className="max-h-36 overflow-y-auto whitespace-pre-line">{explanation.text}</p>}
            {explanation.failed && <p className="text-muted">{t('tr.explanationUnavailable')}</p>}
          </div>
          <div className="mt-3 flex justify-end">
            {data.savedWordId ? (
              <span className="text-sm font-semibold text-lime">✓ {t('tr.saved')}</span>
            ) : (
              <Button size="sm" onClick={save} loading={saving}>
                {t('tr.save')}
              </Button>
            )}
          </div>
        </>
      )}
    </div>
  );
}

/*
=========================================================
EXPLICACIÓN DEL ARCHIVO
=========================================================

Propósito: Detecta cuando el usuario selecciona o hace doble clic en una palabra y muestra una
ventana con su traducción, explicación y opción de guardarla.

Responsabilidades principales:
- TranslationLayer: escucha dblclick, mouseup y touchend, valida la selección y calcula la posición.
- TranslationPopup: llama a POST /api/translate, después a GET /api/translate/:id/explanation, y
  permite guardar con POST /api/vocabulary.
- Cerrar con clic fuera, Escape o desplazamiento.

Elementos importantes:
- TranslationLayer({ disabled })
- TranslationPopup (interno)

Dependencias:
- @tanstack/react-query
- api/endpoints.ts (translationApi, vocabularyApi)
- components/translation.ts
- components/ui.tsx
- i18n/I18nProvider.tsx

Flujo de datos:
Envía la palabra al backend y muestra la traducción primero y la explicación cuando llega.

Aspectos técnicos importantes:
- Si la palabra ya estaba guardada se muestra "Guardado" en lugar del botón.

Lugar en la arquitectura:
Capa de presentación con acceso a la API. Implementa la función de traducción y vocabulario en toda
la interfaz.
*/
