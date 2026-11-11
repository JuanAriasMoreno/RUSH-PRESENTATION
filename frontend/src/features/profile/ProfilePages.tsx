import { useQuery } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { useParams } from 'react-router-dom';
import type { Language } from '@rush/shared';
import { updateProfileSchema } from '@rush/shared';
import { ApiError } from '../../api/client';
import { authApi } from '../../api/endpoints';
import { useAuth, useMe } from '../../auth/AuthProvider';
import { useToast } from '../../components/overlays';
import { Avatar, Button, Card, ErrorState, FormError, LoadingState, NotFoundState, PageHeader, SelectField, TextArea, TextField } from '../../components/ui';
import { useI18n } from '../../i18n/I18nProvider';

export function ProfilePage() {
  const me = useMe();
  const { setMe } = useAuth();
  const { t, formatDate } = useI18n();
  const toast = useToast();
  const [form, setForm] = useState({
    fullName: me.fullName,
    username: me.username,
    profilePictureUrl: me.profilePictureUrl ?? '',
    description: me.description ?? '',
    learningLanguage: (me.learningLanguage ?? '') as Language | '',
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const body = { ...form, learningLanguage: form.learningLanguage || null };
    const parsed = updateProfileSchema.safeParse(body);
    if (!parsed.success) {
      const errs: Record<string, string> = {};
      for (const i of parsed.error.issues) errs[String(i.path[0])] ??= i.path[0] === 'username' ? t('auth.usernameHint') : t('err.validation_error');
      setErrors(errs);
      return;
    }
    setErrors({});
    setError(null);
    setBusy(true);
    try {
      setMe(await authApi.updateProfile(parsed.data));
      toast(t('profile.saved'));
    } catch (err) {
      if (err instanceof ApiError && err.code === 'username_taken') setErrors({ username: t('err.username_taken') });
      else setError(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title={t('profile.title')} subtitle={t('profile.memberSince', { date: formatDate(me.createdAt) })} />
      <Card className="p-5 sm:p-6">
        <div className="mb-6 flex items-center gap-4">
          <Avatar name={form.fullName} url={form.profilePictureUrl || null} size={72} />
          <div>
            <p className="text-lg font-bold">{me.fullName}</p>
            <p className="text-muted">@{me.username}</p>
          </div>
        </div>
        <form className="space-y-4" onSubmit={submit} noValidate>
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField label={t('auth.fullName')} value={form.fullName} maxLength={100} onChange={(e) => setForm({ ...form, fullName: e.target.value })} error={errors.fullName} />
            <TextField label={t('auth.username')} value={form.username} maxLength={30} onChange={(e) => setForm({ ...form, username: e.target.value })} error={errors.username} />
          </div>
          <TextField label={t('settings.emailFixed')} value={me.email} readOnly disabled />
          <TextField label={t('profile.picture')} type="url" placeholder="https://" value={form.profilePictureUrl} onChange={(e) => setForm({ ...form, profilePictureUrl: e.target.value })} error={errors.profilePictureUrl} optional />
          <TextArea label={t('profile.description')} value={form.description} maxLength={2000} onChange={(e) => setForm({ ...form, description: e.target.value })} optional />
          <SelectField label={t('profile.learning')} value={form.learningLanguage} onChange={(e) => setForm({ ...form, learningLanguage: e.target.value as Language | '' })}>
            <option value="">{t('lang.none')}</option>
            <option value="ENGLISH">{t('lang.ENGLISH')}</option>
            <option value="KOREAN">{t('lang.KOREAN')}</option>
          </SelectField>
          <FormError error={error} />
          <div className="flex justify-end">
            <Button type="submit" loading={busy}>
              {t('common.save')}
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}

export function UserProfilePage() {
  const username = useParams().username ?? '';
  const { t } = useI18n();
  const q = useQuery({ queryKey: ['user', username], queryFn: () => authApi.profile(username) });
  if (q.isLoading) return <LoadingState />;
  if (q.error instanceof ApiError && q.error.status === 404) return <NotFoundState />;
  if (q.error) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  const u = q.data!;
  return (
    <Card className="mx-auto max-w-lg p-8 text-center">
      <div className="flex justify-center">
        <Avatar name={u.fullName} url={u.profilePictureUrl} size={96} />
      </div>
      <h1 className="mt-4 text-2xl font-extrabold">{u.fullName}</h1>
      <p className="text-muted">@{u.username}</p>
      {u.learningLanguage && (
        <p className="mt-3 text-sm">
          {t('profile.learning')}: <strong>{t(`lang.${u.learningLanguage}`)}</strong>
        </p>
      )}
      {u.description && <p className="mt-4 whitespace-pre-line text-fg-soft">{u.description}</p>}
    </Card>
  );
}

/*
=========================================================
EXPLICACIÓN DEL ARCHIVO
=========================================================

Propósito: Páginas del perfil propio (/profile) y del perfil público de otro usuario
(/users/:username).

Responsabilidades principales:
- ProfilePage: editar nombre, usuario, foto (URL), descripción e idioma que se aprende; el correo se
  muestra sin poder editarse.
- UserProfilePage: perfil público obtenido de authApi.profile.

Elementos importantes:
- ProfilePage()
- UserProfilePage()

Dependencias:
- @tanstack/react-query
- @rush/shared (updateProfileSchema)
- api/endpoints.ts
- auth/AuthProvider.tsx
- components/overlays.tsx
- components/ui.tsx

Flujo de datos:
Envía PATCH /api/me/profile y lee GET /api/users/:username.

Aspectos técnicos importantes:
- El backend solo muestra perfiles de usuarios que comparten sala o cuestionario.

Lugar en la arquitectura:
Capa de presentación (páginas). Gestión de la identidad del usuario.
*/
