import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import type { QuestionDto, QuizDetailDto } from '@rush/shared';
import { LIMITS } from '@rush/shared';
import { ApiError } from '../../api/client';
import { quizzesApi } from '../../api/endpoints';
import { useMe } from '../../auth/AuthProvider';
import { useConfirm, useToast } from '../../components/overlays';
import { Avatar, Badge, Button, Card, EmptyState, ErrorState, FormError, LoadingState, NotFoundState, TextArea, TextField, inputClass, cx } from '../../components/ui';
import { useI18n } from '../../i18n/I18nProvider';
import { MediaPreview, QuestionEditorModal } from './QuestionEditorModal';
import { QUESTION_TYPE_STYLE } from './questionTypes';
import { formatDuration } from '../play/time';
import { IconPlus } from '../../components/icons';

export function QuizEditorPage() {
  const quizId = Number(useParams().quizId);
  const quiz = useQuery({ queryKey: ['quiz', quizId], queryFn: () => quizzesApi.get(quizId), enabled: Number.isFinite(quizId) });
  if (quiz.isLoading) return <LoadingState />;
  if (quiz.error instanceof ApiError && quiz.error.status === 404) return <NotFoundState />;
  if (quiz.error) return <ErrorState error={quiz.error} onRetry={() => quiz.refetch()} />;
  if (!quiz.data) return <NotFoundState />;
  return <Editor quiz={quiz.data} />;
}

function answerSummary(q: QuestionDto, t: ReturnType<typeof useI18n>['t']): string {
  switch (q.questionType) {
    case 'MULTIPLE_CHOICE':
      return q.options.map((o) => (o.isCorrect ? `✓ ${o.text}` : o.text)).join(' · ');
    case 'TRUE_FALSE':
      return `✓ ${q.options.find((o) => o.isCorrect)?.text === 'TRUE' ? t('common.true') : t('common.false')}`;
    case 'OPEN_ANSWER':
    case 'FILL_IN_THE_BLANK':
      return `✓ ${q.correctTextAnswer}`;
    case 'MATCHING':
      return q.pairs.map((p) => `${p.left} → ${p.right}`).join(' · ');
  }
}

function Editor({ quiz }: { quiz: QuizDetailDto }) {
  const { t, errorText } = useI18n();
  const me = useMe();
  const qc = useQueryClient();
  const nav = useNavigate();
  const confirm = useConfirm();
  const toast = useToast();
  const [title, setTitle] = useState(quiz.title);
  const [description, setDescription] = useState(quiz.description);
  const [minutes, setMinutes] = useState(String(Math.round(quiz.totalTimeLimitSeconds / 60)));
  const [detailsError, setDetailsError] = useState<unknown>(null);
  const [savingDetails, setSavingDetails] = useState(false);
  const [editing, setEditing] = useState<QuestionDto | null | 'new'>(null);
  const [collabName, setCollabName] = useState('');
  const [collabError, setCollabError] = useState<unknown>(null);

  useEffect(() => {
    setTitle(quiz.title);
    setDescription(quiz.description);
    setMinutes(String(Math.round(quiz.totalTimeLimitSeconds / 60)));
  }, [quiz.title, quiz.description, quiz.totalTimeLimitSeconds]);

  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ['quiz', quiz.quizId] });
    void qc.invalidateQueries({ queryKey: ['quizzes'] });
  };
  const run = async (fn: () => Promise<unknown>) => {
    try {
      await fn();
      refresh();
    } catch (e) {
      toast(errorText(e), 'error');
    }
  };

  const saveDetails = async (e: FormEvent) => {
    e.preventDefault();
    setSavingDetails(true);
    setDetailsError(null);
    try {
      qc.setQueryData(['quiz', quiz.quizId], await quizzesApi.update(quiz.quizId, { title, description, totalTimeLimitSeconds: Number(minutes) * 60 }));
      void qc.invalidateQueries({ queryKey: ['quizzes'] });
      toast(t('common.save'));
    } catch (err) {
      setDetailsError(err);
    } finally {
      setSavingDetails(false);
    }
  };

  const addCollaborator = async (e: FormEvent) => {
    e.preventDefault();
    setCollabError(null);
    try {
      qc.setQueryData(['quiz', quiz.quizId], await quizzesApi.addCollaborator(quiz.quizId, collabName.trim()));
      setCollabName('');
    } catch (err) {
      setCollabError(err);
    }
  };

  const n = quiz.questions.length;
  const minMinutes = LIMITS.minQuizTimeLimitSeconds / 60;
  const maxMinutes = LIMITS.maxQuizTimeLimitSeconds / 60;
  const minutesValid = /^\d+$/.test(minutes) && Number(minutes) >= minMinutes && Number(minutes) <= maxMinutes;
  const dirty = title !== quiz.title || description !== quiz.description || Number(minutes) * 60 !== quiz.totalTimeLimitSeconds;

  return (
    <div className="grid gap-6 xl:grid-cols-3">
      <div className="space-y-4 xl:col-span-2">
        <div className="flex flex-wrap items-center gap-2">
          <Link to="/quizzes" className="text-sm font-semibold text-muted hover:text-fg">
            ← {t('quiz.library')}
          </Link>
        </div>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="font-display text-3xl font-black tracking-tight sm:text-4xl">{quiz.title}</h1>
            <Badge tone={quiz.status === 'PUBLISHED' ? 'green' : 'stone'}>{t(`quiz.status.${quiz.status}`)}</Badge>
            <Badge tone="violet">{t('quiz.totalTimeBadge', { t: formatDuration(quiz.totalTimeLimitSeconds) })}</Badge>
          </div>
          <div className="flex gap-2">
            {quiz.status === 'DRAFT' ? (
              <Button onClick={() => run(() => quizzesApi.setStatus(quiz.quizId, 'PUBLISHED'))} disabled={n === 0}>
                {t('quiz.publish')}
              </Button>
            ) : (
              <Button variant="secondary" onClick={() => run(() => quizzesApi.setStatus(quiz.quizId, 'DRAFT'))}>
                {t('quiz.unpublish')}
              </Button>
            )}
          </div>
        </div>

        <div className="flex items-center justify-between pt-2">
          <h2 className="font-display text-xl font-extrabold">
            {t('quiz.questions')} <span className="text-sm font-medium text-muted">{t('quiz.questionCount', { n, max: LIMITS.maxQuestionsPerQuiz })}</span>
          </h2>
          <Button onClick={() => setEditing('new')} disabled={n >= LIMITS.maxQuestionsPerQuiz}>
            <IconPlus size={18} /> {t('quiz.addQuestion')}
          </Button>
        </div>

        {n === 0 ? (
          <EmptyState icon="❓" title={t('quiz.noQuestions')} action={<Button onClick={() => setEditing('new')}>{t('quiz.addQuestion')}</Button>} />
        ) : (
          <ol className="space-y-3">
            {quiz.questions.map((q, i) => (
              <li key={q.questionId}>
                <Card className={cx('p-4 transition sm:p-5', q.locked ? 'border-tangerine/30' : 'hover:border-line-strong')}>
                  <div className="flex items-start gap-4">
                    <span className="flex flex-col items-center gap-1.5">
                      <span className={cx('flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br font-display text-xs font-black', QUESTION_TYPE_STYLE[q.questionType].chip, QUESTION_TYPE_STYLE[q.questionType].fg)} aria-hidden="true">
                        {QUESTION_TYPE_STYLE[q.questionType].glyph}
                      </span>
                      <span className="font-display text-xs font-black text-muted">#{q.displayOrder}</span>
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge tone="violet">{t(`qe.type.${q.questionType}`)}</Badge>
                        <span className="text-xs text-muted">
                          {t('common.points', { n: q.pointValue })}
                        </span>
                        {q.locked && (
                          <span title={t('quiz.lockedHint')}>
                            <Badge tone="amber">🔒 {t('quiz.locked')}</Badge>
                          </span>
                        )}
                      </div>
                      <p className="mt-2 whitespace-pre-line font-display text-lg font-bold leading-snug text-fg">{q.questionText}</p>
                      <p className="mt-1 text-sm text-muted">{answerSummary(q, t)}</p>
                      {q.media && <MediaPreview media={q.media} className="mt-2 max-h-40" />}
                    </div>
                  </div>
                  <div className="mt-3 flex flex-wrap justify-end gap-1">
                    <Button size="sm" variant="ghost" aria-label={t('quiz.moveUp')} disabled={i === 0 || n >= LIMITS.maxQuestionsPerQuiz} onClick={() => run(() => quizzesApi.moveQuestion(q.questionId, q.displayOrder - 1))}>
                      ↑
                    </Button>
                    <Button size="sm" variant="ghost" aria-label={t('quiz.moveDown')} disabled={i === n - 1 || n >= LIMITS.maxQuestionsPerQuiz} onClick={() => run(() => quizzesApi.moveQuestion(q.questionId, q.displayOrder + 1))}>
                      ↓
                    </Button>
                    <Button size="sm" variant="secondary" disabled={q.locked} title={q.locked ? t('quiz.lockedHint') : undefined} onClick={() => setEditing(q)}>
                      {t('common.edit')}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-danger-soft hover:bg-danger/10"
                      disabled={q.locked}
                      onClick={async () => {
                        if (await confirm({ title: t('quiz.deleteQuestion'), message: t('quiz.deleteQuestionConfirm', { n: q.displayOrder }), danger: true, confirmLabel: t('common.delete') })) {
                          await run(() => quizzesApi.deleteQuestion(q.questionId));
                        }
                      }}
                    >
                      {t('common.delete')}
                    </Button>
                  </div>
                </Card>
              </li>
            ))}
          </ol>
        )}
      </div>

      <aside className="grid content-start gap-4 sm:grid-cols-2 xl:grid-cols-1">
        <Card className="p-5">
          <h2 className="mb-3 font-display font-extrabold">{t('quiz.details')}</h2>
          <form className="space-y-3" onSubmit={saveDetails}>
            <TextField label={t('quiz.title')} value={title} onChange={(e) => setTitle(e.target.value)} maxLength={150} />
            <TextArea label={t('quiz.description')} value={description} onChange={(e) => setDescription(e.target.value)} maxLength={5000} />
            <TextField
              label={t('quiz.totalTime')}
              type="number"
              min={minMinutes}
              max={maxMinutes}
              step={1}
              value={minutes}
              onChange={(e) => setMinutes(e.target.value)}
              hint={t('quiz.totalTimeHint')}
              error={minutesValid ? null : `${minMinutes}–${maxMinutes}`}
            />
            <FormError error={detailsError} />
            <Button type="submit" size="sm" loading={savingDetails} disabled={!dirty || !title.trim() || !minutesValid}>
              {t('common.save')}
            </Button>
          </form>
          <p className="mt-4 text-xs text-muted">{t('quiz.owner', { name: `@${quiz.creatorUsername}` })}</p>
        </Card>

        <Card className="p-5">
          <h2 className="font-display font-extrabold">{t('quiz.collaborators')}</h2>
          <p className="mb-3 mt-1 text-xs text-muted">{t('quiz.collaboratorsHint')}</p>
          {quiz.collaborators.length === 0 ? (
            <p className="text-sm text-muted">{t('quiz.noCollaborators')}</p>
          ) : (
            <ul className="space-y-2">
              {quiz.collaborators.map((c) => (
                <li key={c.userId} className="flex items-center justify-between gap-2">
                  <span className="flex min-w-0 items-center gap-2">
                    <Avatar name={c.fullName} url={c.profilePictureUrl} size={28} />
                    <span className="truncate text-sm font-medium">@{c.username}</span>
                  </span>
                  {(quiz.isOwner || c.userId === me.userId) && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={async () => {
                        try {
                          await quizzesApi.removeCollaborator(quiz.quizId, c.userId);
                          if (c.userId === me.userId) {
                            await qc.invalidateQueries({ queryKey: ['quizzes'] });
                            nav('/quizzes');
                          } else refresh();
                        } catch (e) {
                          toast(errorText(e), 'error');
                        }
                      }}
                    >
                      {c.userId === me.userId ? t('quiz.leaveCollab') : t('common.remove')}
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          )}
          {quiz.isOwner && (
            <form className="mt-3 flex gap-2" onSubmit={addCollaborator}>
              <input
                aria-label={t('quiz.addCollaborator')}
                placeholder={t('quiz.addCollaborator')}
                value={collabName}
                onChange={(e) => setCollabName(e.target.value)}
                className={cx(inputClass())}
              />
              <Button type="submit" variant="secondary" disabled={!collabName.trim()}>
                {t('common.add')}
              </Button>
            </form>
          )}
          <div className="mt-2">
            <FormError error={collabError} />
          </div>
        </Card>

        <Card className="p-5">
          <h2 className="mb-2 font-display font-extrabold">{t('quiz.inRooms')}</h2>
          {quiz.rooms.length === 0 ? (
            <p className="text-sm text-muted">{t('quiz.notInRooms')}</p>
          ) : (
            <ul className="space-y-1">
              {quiz.rooms.map((r) => (
                <li key={r.roomId}>
                  <Link to={`/rooms/${r.roomId}`} className="text-sm font-medium text-pink hover:underline">
                    {r.name}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>

        {quiz.isOwner && (
          <Button
            variant="ghost"
            className="w-full text-danger-soft hover:bg-danger/10"
            onClick={async () => {
              if (!(await confirm({ title: t('quiz.delete'), message: t('quiz.deleteConfirm', { title: quiz.title }), danger: true, confirmLabel: t('common.delete') }))) return;
              try {
                await quizzesApi.remove(quiz.quizId);
                await qc.invalidateQueries({ queryKey: ['quizzes'] });
                nav('/quizzes');
              } catch (e) {
                toast(errorText(e), 'error');
              }
            }}
          >
            {t('quiz.delete')}
          </Button>
        )}
      </aside>

      <QuestionEditorModal open={editing !== null} onClose={() => setEditing(null)} quizId={quiz.quizId} question={editing === 'new' ? null : editing} onSaved={refresh} />
    </div>
  );
}

/*
=========================================================
EXPLICACIÓN DEL ARCHIVO
=========================================================

Propósito: Página /quizzes/:quizId para editar un cuestionario: datos, preguntas, colaboradores,
salas, publicación y borrado.

Responsabilidades principales:
- Listar las preguntas con su tipo, puntos, respuesta correcta y medio.
- Configurar en "Details" el tiempo límite total del cuestionario (en minutos, de 1 a 60), que es
  un único temporizador para toda la partida, y mostrarlo junto al título ("⏱ 5 min total").
- Mover preguntas, editarlas o borrarlas (bloqueadas si ya se jugaron).
- Publicar o volver a borrador; añadir y quitar colaboradores (solo el propietario); borrar el
  cuestionario.

Elementos importantes:
- QuizEditorPage()
- Editor
- answerSummary

Dependencias:
- @tanstack/react-query
- @rush/shared
- api/endpoints.ts (quizzesApi)
- auth/AuthProvider.tsx
- components/overlays.tsx
- components/ui.tsx
- features/quizzes/QuestionEditorModal.tsx
- features/quizzes/questionTypes.ts

Flujo de datos:
Lee GET /api/quizzes/:quizId y envía las modificaciones a la API.

Aspectos técnicos importantes:
- Solo propietario y colaboradores pueden abrir esta página (el backend devuelve 404 a los demás).

Lugar en la arquitectura:
Capa de presentación (página). Herramienta principal de creación de contenido.
*/
