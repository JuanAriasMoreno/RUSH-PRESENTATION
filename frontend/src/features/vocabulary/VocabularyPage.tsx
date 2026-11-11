import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import type { SavedWordDto } from '@rush/shared';
import { vocabularyApi } from '../../api/endpoints';
import { useConfirm, useToast } from '../../components/overlays';
import { Button, Card, cx, EmptyState, ErrorState, LoadingState, PageHeader, inputClass } from '../../components/ui';
import { useI18n } from '../../i18n/I18nProvider';

function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setV(value), ms);
    return () => clearTimeout(id);
  }, [value, ms]);
  return v;
}

export function VocabularyPage() {
  const { t } = useI18n();
  const [search, setSearch] = useState('');
  const [favorites, setFavorites] = useState(false);
  const q = useDebounced(search, 250);
  const words = useQuery({ queryKey: ['vocabulary', q, favorites], queryFn: () => vocabularyApi.list(q, favorites) });
  const filtering = q.trim() !== '' || favorites;

  return (
    <div>
      <PageHeader
        title={t('voc.title')}
        subtitle={t('voc.subtitle')}
      />
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center">
        <input
          type="search"
          aria-label={t('voc.search')}
          placeholder={t('voc.search')}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className={cx(inputClass())}
        />
        <label className="flex items-center gap-2 text-sm font-medium text-fg-soft">
          <input type="checkbox" checked={favorites} onChange={(e) => setFavorites(e.target.checked)} className="h-4 w-4 accent-magenta" />
          {t('voc.favoritesOnly')}
        </label>
      </div>
      {words.isLoading ? (
        <LoadingState />
      ) : words.error ? (
        <ErrorState error={words.error} onRetry={() => words.refetch()} />
      ) : words.data!.length === 0 ? (
        filtering ? <EmptyState icon="🔍" title={t('voc.noMatch')} /> : <EmptyState icon="📚" title={t('voc.empty')} hint={t('voc.emptyHint')} />
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {words.data!.map((w) => (
            <WordCard key={w.savedWordId} word={w} />
          ))}
        </div>
      )}
    </div>
  );
}

function WordCard({ word }: { word: SavedWordDto }) {
  const { t, formatDate, errorText } = useI18n();
  const qc = useQueryClient();
  const confirm = useConfirm();
  const toast = useToast();
  const [note, setNote] = useState(word.personalNote ?? '');
  const [saving, setSaving] = useState(false);
  const dirty = note !== (word.personalNote ?? '');
  const invalidate = () => qc.invalidateQueries({ queryKey: ['vocabulary'] });

  const update = async (body: Parameters<typeof vocabularyApi.update>[1]) => {
    setSaving(true);
    try {
      await vocabularyApi.update(word.savedWordId, body);
      await invalidate();
    } catch (e) {
      toast(errorText(e), 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card className="p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-lg font-bold">{word.sourceWord}</p>
          <p className="font-semibold text-pink">{word.translatedWord}</p>
          <p className="text-xs text-muted">
            {t(`lang.${word.sourceLanguage}`)} → {t(`lang.${word.targetLanguage}`)} · {t('voc.saved', { date: formatDate(word.savedAt) })}
          </p>
        </div>
        <button
          type="button"
          aria-pressed={word.isFavorite}
          aria-label={word.isFavorite ? t('voc.unfavorite') : t('voc.favorite')}
          title={word.isFavorite ? t('voc.unfavorite') : t('voc.favorite')}
          onClick={() => update({ isFavorite: !word.isFavorite })}
          className={cx('rounded-lg p-1.5 text-2xl leading-none transition hover:bg-white/8', word.isFavorite ? 'text-sun' : 'text-faint')}
        >
          ★
        </button>
      </div>
      {word.contextualExplanation && (
        <details className="mt-2 text-sm text-fg-soft">
          <summary className="cursor-pointer font-medium text-muted">{t('voc.explanation')}</summary>
          <p className="mt-1 whitespace-pre-line">{word.contextualExplanation}</p>
        </details>
      )}
      <div className="mt-3">
        <textarea
          aria-label={t('voc.note')}
          placeholder={t('voc.note')}
          value={note}
          maxLength={2000}
          onChange={(e) => setNote(e.target.value)}
          className={cx(inputClass(), 'min-h-[64px]')}
        />
      </div>
      <div className="mt-2 flex justify-end gap-2">
        {dirty && (
          <Button size="sm" onClick={() => update({ personalNote: note.trim() || null })} loading={saving}>
            {t('common.save')}
          </Button>
        )}
        <Button
          size="sm"
          variant="ghost"
          className="text-danger-soft hover:bg-danger/10"
          onClick={async () => {
            if (!(await confirm({ title: t('common.delete'), message: t('voc.deleteConfirm', { word: word.sourceWord }), danger: true, confirmLabel: t('common.delete') }))) return;
            try {
              await vocabularyApi.remove(word.savedWordId);
              await invalidate();
            } catch (e) {
              toast(errorText(e), 'error');
            }
          }}
        >
          {t('common.delete')}
        </Button>
      </div>
    </Card>
  );
}

/*
=========================================================
EXPLICACIÓN DEL ARCHIVO
=========================================================

Propósito: Página /vocabulary con las palabras guardadas: búsqueda, favoritos, notas y borrado.

Responsabilidades principales:
- Buscar con retardo de 250 ms (useDebounced) y filtrar favoritos.
- WordCard: marcar favorito, editar nota, ver la explicación y borrar con confirmación.
- Versión de presentación: no hay botones de exportar a CSV o JSON.

Elementos importantes:
- VocabularyPage()
- WordCard
- useDebounced

Dependencias:
- @tanstack/react-query
- api/endpoints.ts (vocabularyApi)
- components/overlays.tsx
- components/ui.tsx

Flujo de datos:
Lee GET /api/vocabulary y envía PATCH/DELETE /api/vocabulary/:savedWordId.

Aspectos técnicos importantes:
- El endpoint de exportación sigue existiendo en el backend, pero no se muestra.

Lugar en la arquitectura:
Capa de presentación (página). Contiene una de las cuatro restricciones de la versión de
presentación.
*/
