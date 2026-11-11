import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import type { QuizSummaryDto } from '@rush/shared';
import { LIMITS, quizInputSchema } from '@rush/shared';
import { quizzesApi } from '../../api/endpoints';
import { Modal } from '../../components/overlays';
import { IconPlus, IconQuiz } from '../../components/icons';
import { Badge, Button, cx, EmptyState, ErrorState, FormError, LoadingState, Meter, PageHeader, Tabs, TextArea, TextField } from '../../components/ui';
import { useI18n } from '../../i18n/I18nProvider';

function QuizCard({ quiz }: { quiz: QuizSummaryDto }) {
  const { t, formatDate } = useI18n();
  const published = quiz.status === 'PUBLISHED';
  return (
    <Link
      to={`/quizzes/${quiz.quizId}`}
      className="group relative flex flex-col overflow-hidden rounded-2xl border border-line bg-panel p-5 shadow-card transition duration-200 hover:-translate-y-1 hover:border-magenta/40 hover:shadow-glow-magenta"
    >
      <span className={cx('absolute inset-x-0 top-0 h-1 bg-gradient-to-r', published ? 'from-lime to-cyan' : 'from-faint to-muted')} aria-hidden="true" />
      <div className="flex items-start justify-between gap-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-magenta/30 to-violet/30 text-pink ring-1 ring-magenta/30">
          <IconQuiz size={22} />
        </span>
        <Badge tone={published ? 'green' : 'amber'}>{t(`quiz.status.${quiz.status}`)}</Badge>
      </div>
      <h3 className="mt-4 font-display text-lg font-extrabold leading-tight transition group-hover:text-pink">{quiz.title}</h3>
      {quiz.description && <p className="mt-1 line-clamp-2 text-sm text-muted">{quiz.description}</p>}
      <div className="mt-auto pt-5">
        <Meter value={quiz.questionCount} max={LIMITS.maxQuestionsPerQuiz} tone="magenta" label={t('quiz.questionCount', { n: quiz.questionCount, max: LIMITS.maxQuestionsPerQuiz })} />
        <p className="mt-3 text-xs text-faint">
          {t('quiz.updated', { date: formatDate(quiz.updatedAt) })}
          {!quiz.isOwner && ` · ${t('quiz.owner', { name: `@${quiz.creatorUsername}` })}`}
        </p>
      </div>
    </Link>
  );
}

export function QuizLibraryPage() {
  const { t } = useI18n();
  const nav = useNavigate();
  const qc = useQueryClient();
  const [params, setParams] = useSearchParams();
  const [tab, setTab] = useState<'mine' | 'shared'>('mine');
  const lib = useQuery({ queryKey: ['quizzes', 'library'], queryFn: quizzesApi.library });
  const creating = params.get('new') === '1';
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const atLimit = (lib.data?.ownedTotal ?? 0) >= LIMITS.maxQuizzesPerUser;

  const create = async (e: FormEvent) => {
    e.preventDefault();
    const parsed = quizInputSchema.safeParse({ title, description });
    if (!parsed.success) return setError(new Error(t('err.validation_error')));
    setBusy(true);
    setError(null);
    try {
      const quiz = await quizzesApi.create(parsed.data);
      await qc.invalidateQueries({ queryKey: ['quizzes'] });
      nav(`/quizzes/${quiz.quizId}`);
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };

  const list = tab === 'mine' ? lib.data?.owned : lib.data?.shared;

  return (
    <div>
      <PageHeader
        title={t('quiz.library')}
        subtitle={t('quiz.librarySubtitle')}
        actions={
          <Button onClick={() => setParams({ new: '1' })} disabled={atLimit} title={atLimit ? t('err.quiz_limit') : undefined}>
            <IconPlus size={18} /> {t('quiz.create')}
          </Button>
        }
      />
      {lib.data && <p className="-mt-4 mb-6 text-sm text-muted">{t('quiz.limit', { n: lib.data.ownedTotal, max: LIMITS.maxQuizzesPerUser })}</p>}
      <div className="mb-6">
        <Tabs
          pill
          value={tab}
          onChange={setTab}
          tabs={(['mine', 'shared'] as const).map((x) => ({
            id: x,
            label: `${x === 'mine' ? t('quiz.mine') : t('quiz.shared')}${lib.data ? ` (${(x === 'mine' ? lib.data.owned : lib.data.shared).length})` : ''}`,
          }))}
        />
      </div>
      {lib.isLoading ? (
        <LoadingState />
      ) : lib.error ? (
        <ErrorState error={lib.error} onRetry={() => lib.refetch()} />
      ) : list!.length === 0 ? (
        tab === 'mine' ? (
          <EmptyState icon="📝" title={t('quiz.empty')} hint={t('quiz.emptyHint')} action={<Button onClick={() => setParams({ new: '1' })}>{t('quiz.create')}</Button>} />
        ) : (
          <EmptyState icon="🤝" title={t('quiz.sharedEmpty')} />
        )
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {list!.map((q) => (
            <QuizCard key={q.quizId} quiz={q} />
          ))}
        </div>
      )}
      <Modal open={creating} onClose={() => setParams({})} title={t('quiz.create')}>
        <form className="space-y-4" onSubmit={create}>
          <TextField label={t('quiz.title')} value={title} onChange={(e) => setTitle(e.target.value)} maxLength={150} required />
          <TextArea label={t('quiz.description')} value={description} onChange={(e) => setDescription(e.target.value)} maxLength={5000} optional />
          <FormError error={error} />
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setParams({})}>
              {t('common.cancel')}
            </Button>
            <Button type="submit" loading={busy} disabled={!title.trim()}>
              {t('common.create')}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

/*
=========================================================
EXPLICACIÓN DEL ARCHIVO
=========================================================

Propósito: Página /quizzes con mis cuestionarios y los compartidos conmigo, y creación de
cuestionarios.

Responsabilidades principales:
- Consultar quizzesApi.library.
- Pestañas "mis cuestionarios" y "compartidos".
- Crear un cuestionario (quizzesApi.create) respetando el límite de 15.

Elementos importantes:
- QuizLibraryPage()
- QuizCard

Dependencias:
- @tanstack/react-query
- @rush/shared
- api/endpoints.ts
- components/overlays.tsx
- components/icons.tsx
- components/ui.tsx

Flujo de datos:
Lee GET /api/quizzes y envía POST /api/quizzes.

Aspectos técnicos importantes:
- Muestra el número de preguntas frente al máximo de 25.

Lugar en la arquitectura:
Capa de presentación (página). Entrada a la gestión de cuestionarios.
*/
