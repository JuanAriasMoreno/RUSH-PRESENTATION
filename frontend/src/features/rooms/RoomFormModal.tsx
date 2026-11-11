import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState, type FormEvent } from 'react';
import type { RoomDetailDto } from '@rush/shared';
import { roomInputSchema } from '@rush/shared';
import { roomsApi, topicsApi } from '../../api/endpoints';
import { Modal } from '../../components/overlays';
import { Button, cx, FormError, TextArea, TextField, inputClass } from '../../components/ui';
import { useI18n } from '../../i18n/I18nProvider';

/** Create or edit a room, including topic assignment and custom topic creation. */
export function RoomFormModal({ open, onClose, room, onSaved }: { open: boolean; onClose: () => void; room?: RoomDetailDto; onSaved: (r: RoomDetailDto) => void }) {
  const { t } = useI18n();
  const qc = useQueryClient();
  const topics = useQuery({ queryKey: ['topics'], queryFn: topicsApi.list, enabled: open });
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [topicIds, setTopicIds] = useState<number[]>([]);
  const [newTopic, setNewTopic] = useState('');
  const [error, setError] = useState<unknown>(null);
  const [nameError, setNameError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setName(room?.name ?? '');
    setDescription(room?.description ?? '');
    setTopicIds(room?.topics.map((x) => x.topicId) ?? []);
    setError(null);
    setNameError(null);
  }, [open, room]);

  // topics already on the room (possibly someone else's custom topic) stay selectable
  const available = [...(topics.data ?? [])];
  for (const tp of room?.topics ?? []) if (!available.some((a) => a.topicId === tp.topicId)) available.push(tp);

  const toggle = (id: number) => setTopicIds((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]));

  const addTopic = async () => {
    const value = newTopic.trim();
    if (!value) return;
    try {
      const created = await topicsApi.createCustom(value);
      await qc.invalidateQueries({ queryKey: ['topics'] });
      setTopicIds((ids) => [...ids, created.topicId]);
      setNewTopic('');
    } catch (e) {
      setError(e);
    }
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    // Presentation version: no custom cover. New rooms get the default cover (null); edits never send it.
    const body = { name, description, coverImageUrl: null, topicIds };
    const parsed = roomInputSchema.safeParse(body);
    if (!parsed.success) {
      const nameIssue = parsed.error.issues.find((i) => i.path[0] === 'name');
      setNameError(nameIssue ? t('err.validation_error') : null);
      if (!nameIssue) setError(new Error(t('err.validation_error')));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const saved = room
        ? await roomsApi.update(room.roomId, { name: parsed.data.name, description: parsed.data.description, topicIds: parsed.data.topicIds })
        : await roomsApi.create(parsed.data);
      await qc.invalidateQueries({ queryKey: ['rooms'] });
      onSaved(saved);
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title={room ? t('rooms.edit') : t('rooms.create')} wide>
      <form className="space-y-4" onSubmit={submit} noValidate>
        <TextField label={t('rooms.name')} value={name} onChange={(e) => setName(e.target.value)} maxLength={100} error={nameError} required />
        <TextArea label={t('rooms.description')} value={description} onChange={(e) => setDescription(e.target.value)} maxLength={5000} optional />
        <fieldset>
          <legend className="mb-2 text-sm font-medium text-fg-soft">{t('rooms.topics')}</legend>
          <div className="flex flex-wrap gap-2">
            {available.map((tp) => {
              const on = topicIds.includes(tp.topicId);
              return (
                <button
                  key={tp.topicId}
                  type="button"
                  aria-pressed={on}
                  onClick={() => toggle(tp.topicId)}
                  className={cx('rounded-full border px-3 py-1 text-sm font-medium transition', on ? 'border-magenta bg-magenta text-white' : 'border-line-strong bg-panel-2 text-fg-soft hover:border-magenta/50')}
                >
                  {tp.topicType === 'CUSTOM' ? '★ ' : ''}
                  {tp.name}
                </button>
              );
            })}
          </div>
          <div className="mt-3 flex gap-2">
            <input
              aria-label={t('rooms.newTopic')}
              placeholder={t('rooms.newTopic')}
              value={newTopic}
              maxLength={50}
              onChange={(e) => setNewTopic(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  void addTopic();
                }
              }}
              className={cx(inputClass())}
            />
            <Button variant="secondary" onClick={addTopic} disabled={!newTopic.trim()}>
              {t('common.add')}
            </Button>
          </div>
        </fieldset>
        <FormError error={error} />
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="secondary" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" loading={busy}>
            {room ? t('common.save') : t('common.create')}
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

Propósito: Formulario modal para crear o editar una sala: nombre, descripción y temas.

Responsabilidades principales:
- Validar con roomInputSchema y llamar a roomsApi.create o roomsApi.update.
- Seleccionar temas y crear temas personalizados (topicsApi.createCustom).
- Versión de presentación: no muestra el campo de imagen de portada; al crear envía coverImageUrl =
  null (el backend asigna una portada por defecto) y al editar no envía la portada, de modo que se
  conserva la existente.

Elementos importantes:
- RoomFormModal({ open, onClose, room, onSaved })

Dependencias:
- @tanstack/react-query
- @rush/shared (roomInputSchema)
- api/endpoints.ts (roomsApi, topicsApi)
- components/overlays.tsx
- components/ui.tsx

Flujo de datos:
Envía POST /api/rooms o PATCH /api/rooms/:roomId.

Aspectos técnicos importantes:
- La restricción de portada es solo de la interfaz: la API sigue aceptando coverImageUrl.

Lugar en la arquitectura:
Capa de presentación (formulario). Contiene una de las cuatro restricciones de la versión de
presentación.
*/
