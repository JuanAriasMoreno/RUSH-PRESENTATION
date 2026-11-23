import { useState, type FormEvent, type ReactNode } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { registerSchema } from '@rush/shared';
import { ApiError } from '../../api/client';
import { authApi } from '../../api/endpoints';
import { useAuth } from '../../auth/AuthProvider';
import { Logo, NeonFloor } from '../../components/brand';
import { Button, FormError, TextField } from '../../components/ui';
import { useI18n } from '../../i18n/I18nProvider';
import { SECURITY_QUESTIONS, questionText } from './securityQuestions';

function useNext() {
  const [params] = useSearchParams();
  const next = params.get('next');
  // only same-site relative paths (no open redirect)
  return next && next.startsWith('/') && !next.startsWith('//') ? next : '/dashboard';
}

function AuthShell({ title, children, footer }: { title: string; children: ReactNode; footer: ReactNode }) {
  const { t } = useI18n();
  return (
    <div className="relative isolate flex min-h-screen flex-col overflow-hidden bg-night">
      <div className="absolute inset-0 -z-20 bg-[radial-gradient(50rem_30rem_at_50%_110%,rgb(160_32_240/0.4),transparent_60%),radial-gradient(30rem_24rem_at_0%_0%,rgb(0_217_255/0.15),transparent_60%),radial-gradient(30rem_24rem_at_100%_10%,rgb(240_0_200/0.2),transparent_60%)]" />
      <NeonFloor className="-z-10 h-[38%]" cols={12} rows={6} dim />
      <div className="flex items-center justify-between p-4 sm:p-6">
        <Link to="/" className="rounded-full px-3 py-1.5 text-sm font-semibold text-fg-soft transition hover:bg-white/10">
          ← {t('nav.home')}
        </Link>
        <button
          type="button"
          className="rounded-full px-3 py-1.5 text-sm font-semibold text-fg-soft transition hover:bg-white/10"
        >
          한국어
        </button>
      </div>
      <div className="flex flex-1 items-center justify-center px-4 pb-20">
        <div className="w-full max-w-md">
          <div className="mb-8 text-center">
            <Link to="/" aria-label="RUSH!">
              <Logo size="lg" neon className="text-5xl sm:text-6xl" />
            </Link>
            <p className="mx-auto mt-3 max-w-sm text-sm text-fg-soft">{t('app.tagline')}</p>
          </div>
          <div className="relative rounded-3xl border border-line-strong bg-panel/90 p-6 shadow-[0_30px_80px_-30px_rgb(240_0_200/0.45)] backdrop-blur sm:p-8">
            <div className="pointer-events-none absolute inset-x-8 -top-px h-px bg-gradient-to-r from-transparent via-magenta to-transparent" aria-hidden="true" />
            <h1 className="mb-6 font-display text-2xl font-black tracking-tight">{title}</h1>
            {children}
          </div>
          <p className="mt-6 text-center text-sm text-fg-soft">{footer}</p>
        </div>
      </div>
    </div>
  );
}

const linkClass = 'font-display font-bold text-cyan transition hover:text-white hover:underline';

export function LoginPage() {
  const { t } = useI18n();
  const { setMe } = useAuth();
  const nav = useNavigate();
  const next = useNext();
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      setMe(await authApi.login(identifier, password));
      nav(next, { replace: true });
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthShell
      title={t('auth.welcome')}
      footer={
        <>
          {t('auth.noAccount')}{' '}
          <Link className={linkClass} to={`/register${next !== '/dashboard' ? `?next=${encodeURIComponent(next)}` : ''}`}>
            {t('auth.register')}
          </Link>
        </>
      }
    >
      <form className="space-y-4" onSubmit={submit} noValidate>
        <TextField label={t('auth.identifier')} autoComplete="username" value={identifier} onChange={(e) => setIdentifier(e.target.value)} required />
        <TextField label={t('auth.password')} type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        <div className="text-right text-sm">
          <Link className={linkClass} to="/forgot-password">Forgot your password?</Link>
        </div>
        <FormError error={error} />
        <Button type="submit" className="w-full" size="lg" loading={busy} disabled={!identifier || !password}>
          {t('auth.login')}
        </Button>
      </form>
    </AuthShell>
  );
}

export function RegisterPage() {
  const { t } = useI18n();
  const { setMe } = useAuth();
  const nav = useNavigate();
  const next = useNext();
  const [form, setForm] = useState({ fullName: '', username: '', email: '', password: '', securityQuestionId: 1, securityAnswer: '' });
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const set = (k: 'fullName' | 'username' | 'email' | 'password') => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm({ ...form, [k]: e.target.value });
  const setQuestion = (e: React.ChangeEvent<HTMLSelectElement>) => setForm({ ...form, securityQuestionId: Number(e.target.value) });
  const setAnswer = (e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, securityAnswer: e.target.value });

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    const parsed = registerSchema.safeParse(form);
    if (!parsed.success) {
      const errs: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        const k = String(issue.path[0]);
        errs[k] ??=
          k === 'password' ? t('auth.passwordHint')
          : k === 'username' ? t('auth.usernameHint')
          : k === 'securityAnswer' ? 'Enter an answer of at least 2 characters.'
          : t('err.validation_error');
      }
      setFieldErrors(errs);
      return;
    }
    setFieldErrors({});
    setBusy(true);
    try {
      setMe(await authApi.register(parsed.data));
      nav(next, { replace: true });
    } catch (err) {
      if (err instanceof ApiError && err.code === 'username_taken') setFieldErrors({ username: t('err.username_taken') });
      else if (err instanceof ApiError && err.code === 'email_taken') setFieldErrors({ email: t('err.email_taken') });
      else setError(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthShell
      title={t('auth.join')}
      footer={
        <>
          {t('auth.haveAccount')}{' '}
          <Link className={linkClass} to={`/login${next !== '/dashboard' ? `?next=${encodeURIComponent(next)}` : ''}`}>
            {t('auth.login')}
          </Link>
        </>
      }
    >
      <form className="space-y-4" onSubmit={submit} noValidate>
        <TextField label={t('auth.fullName')} autoComplete="name" value={form.fullName} onChange={set('fullName')} error={fieldErrors.fullName} maxLength={100} />
        <TextField label={t('auth.username')} autoComplete="username" value={form.username} onChange={set('username')} error={fieldErrors.username} hint={t('auth.usernameHint')} maxLength={30} />
        <TextField label={t('auth.email')} type="email" autoComplete="email" value={form.email} onChange={set('email')} error={fieldErrors.email} hint={t('auth.emailHint')} />
        <TextField label={t('auth.password')} type="password" autoComplete="new-password" value={form.password} onChange={set('password')} error={fieldErrors.password} hint={t('auth.passwordHint')} />
        <label className="block text-sm font-semibold text-fg-soft">
          Security question (used to recover your password)
          <select
            className="mt-1 w-full rounded-xl border border-line-strong bg-night px-3 py-2 text-fg"
            value={form.securityQuestionId}
            onChange={setQuestion}
          >
            {SECURITY_QUESTIONS.map((q) => (
              <option key={q.id} value={q.id}>{q.text}</option>
            ))}
          </select>
        </label>
        <TextField label="Your answer" value={form.securityAnswer} onChange={setAnswer} error={fieldErrors.securityAnswer} maxLength={100} />
        <FormError error={error} />
        <Button type="submit" className="w-full" size="lg" loading={busy}>
          {t('auth.register')}
        </Button>
      </form>
    </AuthShell>
  );
}

export function ForgotPasswordPage() {
  const nav = useNavigate();
  const [step, setStep] = useState<1 | 2>(1);
  const [identifier, setIdentifier] = useState('');
  const [questionId, setQuestionId] = useState(1);
  const [answer, setAnswer] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [error, setError] = useState<unknown>(null);
  const [passwordError, setPasswordError] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);

  const findQuestion = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await authApi.recoveryQuestion(identifier);
      setQuestionId(res.questionId);
      setStep(2);
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };

  const reset = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (newPassword.length < 8) {
      setPasswordError('Use at least 8 characters.');
      return;
    }
    setPasswordError(undefined);
    setBusy(true);
    try {
      await authApi.recoveryReset(identifier, answer, newPassword);
      nav('/login', { replace: true });
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthShell
      title="Recover your password"
      footer={<Link className={linkClass} to="/login">Back to login</Link>}
    >
      {step === 1 ? (
        <form className="space-y-4" onSubmit={findQuestion} noValidate>
          <TextField label="Username or email" autoComplete="username" value={identifier} onChange={(e) => setIdentifier(e.target.value)} required />
          <FormError error={error} />
          <Button type="submit" className="w-full" size="lg" loading={busy} disabled={!identifier}>
            Continue
          </Button>
        </form>
      ) : (
        <form className="space-y-4" onSubmit={reset} noValidate>
          <p className="text-sm text-fg-soft">{questionText(questionId)}</p>
          <TextField label="Your answer" value={answer} onChange={(e) => setAnswer(e.target.value)} maxLength={100} required />
          <TextField label="New password" type="password" autoComplete="new-password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} error={passwordError} />
          <FormError error={error} />
          <Button type="submit" className="w-full" size="lg" loading={busy} disabled={!answer || !newPassword}>
            Reset password
          </Button>
        </form>
      )}
    </AuthShell>
  );
}

/*
=========================================================
EXPLICACIÓN DEL ARCHIVO
=========================================================

Propósito: Páginas de inicio de sesión (/login) y de registro (/register).

Responsabilidades principales:
- LoginPage: envía usuario o correo y contraseña a authApi.login.
- RegisterPage: valida en el navegador con registerSchema (compartido) antes de llamar a
  authApi.register y muestra errores por campo.
- useNext: vuelve a la ruta indicada en ?next= (solo rutas internas) o a /dashboard.

Elementos importantes:
- LoginPage
- RegisterPage
- AuthShell
- useNext

Dependencias:
- react-router-dom
- @rush/shared (registerSchema)
- api/endpoints.ts (authApi)
- auth/AuthProvider.tsx
- components/brand.tsx
- components/ui.tsx

Flujo de datos:
Envía las credenciales por HTTPS/HTTP al backend; recibe el usuario y lo guarda en el contexto.

Aspectos técnicos importantes:
- useNext solo acepta rutas que empiezan por "/" y no por "//", lo que evita redirecciones a otros
  sitios.
- La contraseña nunca se guarda en el navegador.

Lugar en la arquitectura:
Capa de presentación (páginas). Inicio del flujo de autenticación.
*/
