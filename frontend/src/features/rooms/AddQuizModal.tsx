import { useQuery } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import type { RoomDetailDto } from '@rush/shared';
import { quizInputSchema } from '@rush/shared';
import { quizzesApi, roomsApi } from '../../api/endpoints';
import { Modal } from '../../components/overlays';
import { Badge, Button, FormError, LoadingState, TextArea, TextField } from '../../components/ui';
import { useI18n } from '../../i18n/I18nProvider';

/** Add one of my quizzes to the room, or create a new quiz directly inside the room. */
export function AddQuizModal({ open, onClose, room, onDone }: { open: boolean; onClose: () => void; room: RoomDetailDto; onDone: () => void }) {
  const { t } = useI18n();
  const nav = useNavigate();
  const editable = useQuery({ queryKey: ['quizzes', 'editable'], queryFn: quizzesApi.editable, enabled: open });
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState<number | 'new' | null>(null);
  const inRoom = new Set(room.quizzes.map((q) => q.quizId));
  const candidates = (editable.data ?? []).filter((q) => !inRoom.has(q.quizId));

  const add = async (quizId: number) => {
    setBusy(quizId);
    setError(null);
    try {
      await roomsApi.addQuiz(room.roomId, quizId);
      onDone();
      onClose();
    } catch (e) {
      setError(e);
    } finally {
      setBusy(null);
    }
  };

  const createHere = async (e: FormEvent) => {
    e.preventDefault();
    const parsed = quizInputSchema.safeParse({ title, description });
    if (!parsed.success) return setError(new Error(t('err.validation_error')));
    setBusy('new');
    setError(null);
    try {
      const { quizId } = await roomsApi.createQuizInRoom(room.roomId, parsed.data);
      onDone();
      nav(`/quizzes/${quizId}`);
    } catch (err) {
      setError(err);
    } finally {
      setBusy(null);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title={t('rooms.addQuiz')} wide>
      <section>
        <h3 className="mb-2 text-sm font-bold uppercase tracking-wide text-muted">{t('rooms.addExistingQuiz')}</h3>
        {editable.isLoading ? (
          <LoadingState />
        ) : candidates.length === 0 ? (
          <p className="rounded-xl bg-panel-2 px-3 py-3 text-sm text-muted">{t('rooms.noQuizzesToAdd')}</p>
        ) : (
          <ul className="max-h-64 divide-y divide-line overflow-y-auto rounded-xl border border-line">
            {candidates.map((q) => (
              <li key={q.quizId} className="flex items-center justify-between gap-3 px-3 py-2.5">
                <div className="min-w-0">
                  <p className="truncate font-medium">{q.title}</p>
                  <p className="text-xs text-muted">
                    <Badge tone={q.status === 'PUBLISHED' ? 'green' : 'stone'}>{t(`quiz.status.${q.status}`)}</Badge> {t('rooms.questions', { n: q.questionCount })}
                  </p>
                </div>
                <Button size="sm" variant="secondary" onClick={() => add(q.quizId)} loading={busy === q.quizId}>
                  {t('common.add')}
                </Button>
              </li>
            ))}
          </ul>
        )}
      </section>
      <form className="mt-6 space-y-3 border-t border-line pt-5" onSubmit={createHere}>
        <h3 className="text-sm font-bold uppercase tracking-wide text-muted">{t('rooms.createQuizHere')}</h3>
        <TextField label={t('quiz.title')} value={title} onChange={(e) => setTitle(e.target.value)} maxLength={150} required />
        <TextArea label={t('quiz.description')} value={description} onChange={(e) => setDescription(e.target.value)} optional />
        <FormError error={error} />
        <div className="flex justify-end">
          <Button type="submit" loading={busy === 'new'} disabled={!title.trim()}>
            {t('common.create')}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

/*
=========================================================
EXPLICACIÓN DEL ARCHIVO
=========================================================

Propósito: Ventana para añadir uno de mis cuestionarios a la sala o crear uno nuevo directamente en
ella.

Responsabilidades principales:
- Listar cuestionarios editables que no están ya en la sala (quizzesApi.editable).
- Añadir con roomsApi.addQuiz o crear con roomsApi.createQuizInRoom y abrir el editor.

Elementos importantes:
- AddQuizModal({ open, onClose, room, onDone })

Dependencias:
- @tanstack/react-query
- @rush/shared
- api/endpoints.ts
- components/overlays.tsx
- components/ui.tsx

Flujo de datos:
Envía POST /api/rooms/:roomId/quizzes o /quizzes/new.

Aspectos técnicos importantes:
- Un cuestionario creado desde la sala no aparece en la biblioteca personal (is_in_library = FALSE).

Lugar en la arquitectura:
Capa de presentación. Conecta cuestionarios y salas.
*/
