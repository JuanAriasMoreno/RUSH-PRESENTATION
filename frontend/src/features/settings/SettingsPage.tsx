import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import type { Language } from '@rush/shared';
import { passwordSchema } from '@rush/shared';
import { authApi } from '../../api/endpoints';
import { useAuth, useMe } from '../../auth/AuthProvider';
import { Modal, useToast } from '../../components/overlays';
import { Button, Card, FormError, PageHeader, SelectField, TextField } from '../../components/ui';
import { useI18n } from '../../i18n/I18nProvider';

export function SettingsPage() {
  const me = useMe();
  const { setMe, logout } = useAuth();
  const { t } = useI18n();
  const toast = useToast();
  const nav = useNavigate();
  const [prefsError, setPrefsError] = useState<unknown>(null);
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [pwError, setPwError] = useState<unknown>(null);
  const [pwBusy, setPwBusy] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deletePassword, setDeletePassword] = useState('');
  const [deleteError, setDeleteError] = useState<unknown>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);

  const savePref = async (body: { translationTargetLanguage: Language }) => {
    setPrefsError(null);
    try {
      const updated = await authApi.updatePreferences(body);
      setMe(updated);
      toast(t('settings.saved'));
    } catch (e) {
      setPrefsError(e);
    }
  };

  const changePassword = async (e: FormEvent) => {
    e.preventDefault();
    setPwError(null);
    if (!passwordSchema.safeParse(next).success) return setPwError(new Error(t('auth.passwordHint')));
    setPwBusy(true);
    try {
      await authApi.changePassword(current, next);
      setCurrent('');
      setNext('');
      toast(t('settings.passwordChanged'));
    } catch (err) {
      setPwError(err);
    } finally {
      setPwBusy(false);
    }
  };

  const deleteAccount = async (e: FormEvent) => {
    e.preventDefault();
    setDeleteBusy(true);
    setDeleteError(null);
    try {
      await authApi.deleteAccount(deletePassword);
      await logout();
      nav('/login', { replace: true });
    } catch (err) {
      setDeleteError(err);
      setDeleteBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <PageHeader title={t('settings.title')} />
      <Card className="p-5 sm:p-6">
        <h2 className="mb-4 font-bold">{t('settings.languages')}</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <SelectField label={t('settings.interface')} value="ENGLISH" onChange={() => undefined}>
            <option value="ENGLISH">English</option>
            <option value="KOREAN">한국어</option>
          </SelectField>
          <SelectField label={t('settings.translationTarget')} value={me.preferences.translationTargetLanguage} onChange={(e) => savePref({ translationTargetLanguage: e.target.value as Language })}>
            <option value="ENGLISH">{t('lang.ENGLISH')}</option>
            <option value="KOREAN">{t('lang.KOREAN')}</option>
          </SelectField>
        </div>
        <div className="mt-3">
          <FormError error={prefsError} />
        </div>
      </Card>

      <Card className="p-5 sm:p-6">
        <h2 className="mb-4 font-bold">{t('settings.password')}</h2>
        <form className="space-y-4" onSubmit={changePassword}>
          <TextField label={t('settings.currentPassword')} type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} />
          <TextField label={t('settings.newPassword')} type="password" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} hint={t('auth.passwordHint')} />
          <FormError error={pwError} />
          <Button type="submit" loading={pwBusy} disabled={!current || !next}>
            {t('settings.password')}
          </Button>
        </form>
      </Card>

      <Card className="border-danger/40 p-5 sm:p-6">
        <h2 className="font-bold text-danger-soft">{t('settings.danger')}</h2>
        <p className="mt-1 text-sm text-fg-soft">{t('settings.dangerHint')}</p>
        <Button variant="danger" className="mt-4" onClick={() => setDeleting(true)}>
          {t('settings.danger')}
        </Button>
      </Card>

      <Modal open={deleting} onClose={() => setDeleting(false)} title={t('settings.danger')}>
        <form className="space-y-4" onSubmit={deleteAccount}>
          <p className="text-sm text-fg-soft">{t('settings.dangerHint')}</p>
          <TextField label={t('settings.deleteConfirm')} type="password" autoComplete="current-password" value={deletePassword} onChange={(e) => setDeletePassword(e.target.value)} />
          <FormError error={deleteError} />
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setDeleting(false)}>
              {t('common.cancel')}
            </Button>
            <Button type="submit" variant="danger" loading={deleteBusy} disabled={!deletePassword}>
              {t('common.delete')}
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

Propósito: Página /settings: idiomas, cambio de contraseña y eliminación de cuenta.

Responsabilidades principales:
- Mostrar el idioma de la interfaz (fijo en inglés) y cambiar el idioma destino de traducción
  (authApi.updatePreferences).
- Cambiar la contraseña (authApi.changePassword).
- Eliminar la cuenta tras escribir la contraseña (authApi.deleteAccount) y cerrar sesión.

Elementos importantes:
- SettingsPage()

Dependencias:
- @rush/shared (passwordSchema)
- api/endpoints.ts
- auth/AuthProvider.tsx
- components/overlays.tsx
- components/ui.tsx
- i18n/I18nProvider.tsx

Flujo de datos:
Envía PATCH /api/me/preferences, POST /api/me/password y DELETE /api/me.

Aspectos técnicos importantes:
- La eliminación borra en cascada salas propias, cuestionarios y vocabulario.

Lugar en la arquitectura:
Capa de presentación (página). Configuración y seguridad de la cuenta.
*/
