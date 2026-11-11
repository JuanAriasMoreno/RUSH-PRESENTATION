import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import type { TopicDto } from '@rush/shared';
import { topicsApi } from '../../api/endpoints';
import { useConfirm, useToast } from '../../components/overlays';
import { Button, Card, ErrorState, FormError, LoadingState, PageHeader, inputClass, cx } from '../../components/ui';
import { useI18n } from '../../i18n/I18nProvider';

export function AdminPage() {
  const { t } = useI18n();
  const qc = useQueryClient();
  const topics = useQuery({ queryKey: ['admin', 'topics'], queryFn: topicsApi.adminList });
  const [name, setName] = useState('');
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ['admin', 'topics'] });
    void qc.invalidateQueries({ queryKey: ['topics'] });
  };

  const create = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await topicsApi.adminCreate(name.trim());
      setName('');
      refresh();
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title={t('admin.title')} />
      <Card className="p-5 sm:p-6">
        <h2 className="font-bold">{t('admin.topics')}</h2>
        <p className="mb-4 mt-1 text-sm text-muted">{t('admin.topicsHint')}</p>
        <form className="mb-5 flex gap-2" onSubmit={create}>
          <input
            aria-label={t('admin.newTopic')}
            placeholder={t('admin.newTopic')}
            value={name}
            maxLength={50}
            onChange={(e) => setName(e.target.value)}
            className={cx(inputClass())}
          />
          <Button type="submit" loading={busy} disabled={!name.trim()}>
            {t('common.add')}
          </Button>
        </form>
        <FormError error={error} />
        {topics.isLoading ? (
          <LoadingState />
        ) : topics.error ? (
          <ErrorState error={topics.error} onRetry={() => topics.refetch()} />
        ) : topics.data!.length === 0 ? (
          <p className="text-sm text-muted">{t('admin.noTopics')}</p>
        ) : (
          <ul className="divide-y divide-line">
            {topics.data!.map((tp) => (
              <TopicRow key={tp.topicId} topic={tp} onChanged={refresh} />
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

function TopicRow({ topic, onChanged }: { topic: TopicDto; onChanged: () => void }) {
  const { t, errorText } = useI18n();
  const confirm = useConfirm();
  const toast = useToast();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(topic.name);

  const save = async (e: FormEvent) => {
    e.preventDefault();
    try {
      await topicsApi.adminRename(topic.topicId, name.trim());
      setEditing(false);
      onChanged();
    } catch (err) {
      toast(errorText(err), 'error');
    }
  };

  return (
    <li className="flex items-center justify-between gap-3 py-2.5">
      {editing ? (
        <form className="flex flex-1 gap-2" onSubmit={save}>
          <input
            aria-label={t('admin.renamePrompt')}
            value={name}
            maxLength={50}
            autoFocus
            onChange={(e) => setName(e.target.value)}
            className={cx(inputClass(), 'py-1.5')}
          />
          <Button type="submit" size="sm" disabled={!name.trim()}>
            {t('common.save')}
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>
            {t('common.cancel')}
          </Button>
        </form>
      ) : (
        <>
          <span className="font-medium">{topic.name}</span>
          <span className="flex gap-1">
            <Button size="sm" variant="secondary" onClick={() => setEditing(true)}>
              {t('common.edit')}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="text-danger-soft hover:bg-danger/10"
              onClick={async () => {
                if (!(await confirm({ title: t('common.delete'), message: t('admin.deleteTopicConfirm', { name: topic.name }), danger: true, confirmLabel: t('common.delete') }))) return;
                try {
                  await topicsApi.adminRemove(topic.topicId);
                  onChanged();
                } catch (err) {
                  toast(errorText(err), 'error');
                }
              }}
            >
              {t('common.delete')}
            </Button>
          </span>
        </>
      )}
    </li>
  );
}

/*
=========================================================
EXPLICACIÓN DEL ARCHIVO
=========================================================

Propósito: Página /admin para que un SUPERADMIN gestione los temas predefinidos.

Responsabilidades principales:
- Listar, crear, renombrar y borrar temas predefinidos (topicsApi.admin*).

Elementos importantes:
- AdminPage()
- TopicRow

Dependencias:
- @tanstack/react-query
- api/endpoints.ts (topicsApi)
- components/overlays.tsx
- components/ui.tsx

Flujo de datos:
Usa GET/POST/PATCH/DELETE /api/admin/topics.

Aspectos técnicos importantes:
- Protegida por App.tsx (RequireAuth admin) y por requireSuperadmin en el backend.

Lugar en la arquitectura:
Capa de presentación (página). Única función de administración de la plataforma.
*/
