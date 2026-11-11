import {
  forwardRef,
  useId,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react';
import { Link } from 'react-router-dom';
import { useI18n } from '../i18n/I18nProvider';

export const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(' ');

// ---------------------------------------------------------------- buttons
export type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'neon' | 'light';
const variants: Record<Variant, string> = {
  /** main call to action: magenta → violet with glow */
  primary: 'bg-gradient-to-r from-magenta to-violet text-white shadow-glow-magenta hover:brightness-110 hover:-translate-y-px active:translate-y-0',
  secondary: 'bg-panel-2 text-fg ring-1 ring-inset ring-line-strong hover:bg-panel-3 hover:ring-cyan/50',
  ghost: 'text-fg-soft hover:bg-white/5 hover:text-fg',
  danger: 'bg-danger text-white hover:brightness-110 shadow-[0_8px_24px_-8px_rgb(255_48_48/0.6)]',
  /** cyan outline, for secondary game actions */
  neon: 'bg-transparent text-cyan ring-2 ring-inset ring-cyan hover:bg-cyan/10 hover:shadow-glow-cyan',
  /** for use on white landing sections */
  light: 'bg-white text-night hover:bg-white/90 shadow-[0_8px_24px_-10px_rgb(255_255_255/0.6)]',
};

const sizes = {
  sm: 'px-3.5 py-1.5 text-sm',
  md: 'px-5 py-2.5 text-sm',
  lg: 'px-7 py-3.5 text-base',
} as const;

const buttonBase =
  'inline-flex items-center justify-center gap-2 rounded-full font-display font-bold tracking-tight transition duration-150 disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none disabled:hover:translate-y-0';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: keyof typeof sizes;
  loading?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'primary', size = 'md', loading, disabled, className, children, type = 'button', ...rest },
  ref,
) {
  return (
    <button ref={ref} type={type} disabled={disabled || loading} className={cx(buttonBase, sizes[size], variants[variant], className)} {...rest}>
      {loading && <Spinner className="h-4 w-4" />}
      {children}
    </button>
  );
});

export function ButtonLink({
  to,
  variant = 'primary',
  size = 'md',
  children,
  className,
}: {
  to: string;
  variant?: Variant;
  size?: keyof typeof sizes;
  children: ReactNode;
  className?: string;
}) {
  return (
    <Link to={to} className={cx(buttonBase, sizes[size], variants[variant], className)}>
      {children}
    </Link>
  );
}

// ---------------------------------------------------------------- form fields
interface FieldProps {
  label: ReactNode;
  hint?: ReactNode;
  error?: string | null;
  optional?: boolean;
}

function FieldShell({ id, label, hint, error, optional, children }: FieldProps & { id: string; children: ReactNode }) {
  const { t } = useI18n();
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="block text-sm font-semibold text-fg-soft">
        {label}
        {optional && <span className="ml-1 font-normal text-faint">({t('common.optional')})</span>}
      </label>
      {children}
      {error ? (
        <p id={`${id}-err`} className="text-sm font-medium text-danger" role="alert">
          {error}
        </p>
      ) : hint ? (
        <p id={`${id}-hint`} className="text-xs text-muted">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

/** Shared input styling (also used by the few raw inputs in feature pages). */
export const inputClass = (error?: string | null) =>
  cx(
    'block w-full rounded-xl border bg-panel-2 px-3.5 py-2.5 text-sm text-fg placeholder:text-faint transition focus:outline-none focus:ring-2 disabled:cursor-not-allowed disabled:opacity-60',
    error ? 'border-danger/70 focus:ring-danger/30' : 'border-line-strong focus:border-cyan focus:ring-cyan/25',
  );

export const TextField = forwardRef<HTMLInputElement, FieldProps & InputHTMLAttributes<HTMLInputElement>>(function TextField(
  { label, hint, error, optional, className, ...rest },
  ref,
) {
  const id = useId();
  return (
    <FieldShell id={id} label={label} hint={hint} error={error} optional={optional}>
      <input ref={ref} id={id} aria-invalid={!!error} aria-describedby={error ? `${id}-err` : hint ? `${id}-hint` : undefined} className={cx(inputClass(error), className)} {...rest} />
    </FieldShell>
  );
});

export function TextArea({ label, hint, error, optional, className, ...rest }: FieldProps & TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const id = useId();
  return (
    <FieldShell id={id} label={label} hint={hint} error={error} optional={optional}>
      <textarea id={id} aria-invalid={!!error} className={cx(inputClass(error), 'min-h-[92px]', className)} {...rest} />
    </FieldShell>
  );
}

export function SelectField({ label, hint, error, optional, className, children, ...rest }: FieldProps & SelectHTMLAttributes<HTMLSelectElement>) {
  const id = useId();
  return (
    <FieldShell id={id} label={label} hint={hint} error={error} optional={optional}>
      <select id={id} className={cx(inputClass(error), 'appearance-none bg-[length:1.1rem] bg-[right_0.8rem_center] bg-no-repeat pr-10', className)} style={{ backgroundImage: CHEVRON }} {...rest}>
        {children}
      </select>
    </FieldShell>
  );
}
const CHEVRON = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 20 20' fill='%238f97c4'%3E%3Cpath d='M5.3 7.3a1 1 0 0 1 1.4 0L10 10.6l3.3-3.3a1 1 0 1 1 1.4 1.4l-4 4a1 1 0 0 1-1.4 0l-4-4a1 1 0 0 1 0-1.4z'/%3E%3C/svg%3E")`;

// ---------------------------------------------------------------- surfaces
export function Card({ className, children, glow }: { className?: string; children: ReactNode; glow?: 'magenta' | 'cyan' | 'lime' }) {
  return (
    <div
      className={cx(
        'rounded-2xl border border-line bg-panel/90 shadow-card backdrop-blur-sm',
        glow === 'magenta' && 'border-magenta/40 shadow-glow-magenta',
        glow === 'cyan' && 'border-cyan/40 shadow-glow-cyan',
        glow === 'lime' && 'border-lime/40 shadow-glow-lime',
        className,
      )}
    >
      {children}
    </div>
  );
}

/** Small uppercase heading used inside cards and sections. */
export function SectionLabel({ children, className }: { children: ReactNode; className?: string }) {
  return <h2 className={cx('font-display text-xs font-bold uppercase tracking-[0.18em] text-muted', className)}>{children}</h2>;
}

// ---------------------------------------------------------------- feedback
export function Spinner({ className }: { className?: string }) {
  return (
    <svg className={cx('animate-spin text-current', className ?? 'h-5 w-5')} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle className="opacity-20" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-90" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
    </svg>
  );
}

export function LoadingState() {
  const { t } = useI18n();
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-20 text-muted" role="status">
      <span className="flex gap-1.5" aria-hidden="true">
        {['bg-magenta', 'bg-cyan', 'bg-lime', 'bg-sun'].map((c, i) => (
          <span key={c} className={cx('h-2.5 w-2.5 animate-bounce rounded-full', c)} style={{ animationDelay: `${i * 120}ms` }} />
        ))}
      </span>
      <span className="text-sm font-medium">{t('common.loading')}</span>
    </div>
  );
}

export function ErrorState({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const { t, errorText } = useI18n();
  return (
    <div className="mx-auto max-w-md rounded-2xl border border-danger/40 bg-danger/10 p-6 text-center" role="alert">
      <p className="font-display font-bold text-fg">{t('common.errorTitle')}</p>
      <p className="mt-1 text-sm text-fg-soft">{errorText(error)}</p>
      {onRetry && (
        <Button variant="secondary" size="sm" className="mt-4" onClick={onRetry}>
          {t('common.retry')}
        </Button>
      )}
    </div>
  );
}

export function NotFoundState() {
  const { t } = useI18n();
  return (
    <div className="mx-auto max-w-md py-20 text-center">
      <p className="text-neon font-display text-7xl font-black">404</p>
      <p className="mt-4 text-fg-soft">{t('common.notFound')}</p>
      <ButtonLink to="/dashboard" variant="secondary" className="mt-8">
        {t('common.goHome')}
      </ButtonLink>
    </div>
  );
}

export function EmptyState({ icon = '✨', title, hint, action }: { icon?: string; title: string; hint?: string; action?: ReactNode }) {
  return (
    <div className="relative overflow-hidden rounded-2xl border border-dashed border-line-strong bg-panel/50 px-6 py-14 text-center">
      <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-magenta/20 to-cyan/20 text-3xl ring-1 ring-line" aria-hidden="true">
        {icon}
      </div>
      <p className="mt-4 font-display font-bold text-fg">{title}</p>
      {hint && <p className="mx-auto mt-1 max-w-sm text-sm text-muted">{hint}</p>}
      {action && <div className="mt-6">{action}</div>}
    </div>
  );
}

export type Tone = 'stone' | 'brand' | 'green' | 'blue' | 'amber' | 'red' | 'violet' | 'sun';
const tones: Record<Tone, string> = {
  stone: 'bg-white/8 text-fg-soft ring-line',
  brand: 'bg-magenta/15 text-[#ff7be4] ring-magenta/40',
  green: 'bg-lime/12 text-lime ring-lime/40',
  blue: 'bg-cyan/12 text-cyan ring-cyan/40',
  amber: 'bg-tangerine/15 text-tangerine ring-tangerine/40',
  red: 'bg-danger/15 text-[#ff6b6b] ring-danger/40',
  violet: 'bg-violet/20 text-[#d18bff] ring-violet/45',
  sun: 'bg-sun/12 text-sun ring-sun/40',
};

export function Badge({ tone = 'stone', children }: { tone?: Tone; children: ReactNode }) {
  return <span className={cx('inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-bold ring-1 ring-inset', tones[tone])}>{children}</span>;
}

const AVATAR_COLORS = ['from-magenta to-violet', 'from-cyan to-violet', 'from-lime to-cyan', 'from-sun to-tangerine', 'from-tangerine to-magenta'];

export function Avatar({ name, url, size = 36, ring }: { name: string; url?: string | null; size?: number; ring?: boolean }) {
  const initials = name.split(/\s+/).map((p) => p[0]).join('').slice(0, 2).toUpperCase();
  const style = { width: size, height: size };
  if (url) {
    return <img src={url} alt="" width={size} height={size} className={cx('shrink-0 rounded-full object-cover', ring && 'ring-2 ring-magenta ring-offset-2 ring-offset-night')} style={style} referrerPolicy="no-referrer" />;
  }
  const color = AVATAR_COLORS[[...name].reduce((a, c) => a + c.charCodeAt(0), 0) % AVATAR_COLORS.length];
  return (
    <span
      className={cx('inline-flex shrink-0 items-center justify-center rounded-full bg-gradient-to-br font-display font-extrabold text-white', color, ring && 'ring-2 ring-magenta ring-offset-2 ring-offset-night')}
      style={{ ...style, fontSize: size * 0.38 }}
      aria-hidden="true"
    >
      {initials || '?'}
    </span>
  );
}

export function PageHeader({ title, subtitle, actions, eyebrow }: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode; eyebrow?: ReactNode }) {
  return (
    <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div>
        {eyebrow && <p className="mb-1 font-display text-xs font-bold uppercase tracking-[0.2em] text-cyan">{eyebrow}</p>}
        <h1 className="font-display text-3xl font-black tracking-tight text-fg sm:text-4xl">{title}</h1>
        {subtitle && <p className="mt-2 max-w-2xl text-fg-soft">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function FormError({ error }: { error: unknown }) {
  const { errorText } = useI18n();
  if (!error) return null;
  return (
    <p className="rounded-xl border border-danger/40 bg-danger/10 px-3.5 py-2.5 text-sm font-medium text-[#ff8a8a]" role="alert">
      {errorText(error)}
    </p>
  );
}

// ---------------------------------------------------------------- navigation pieces
/** Accessible tab bar (role=tablist) with a neon underline. */
export function Tabs<T extends string>({ tabs, value, onChange, pill }: { tabs: { id: T; label: ReactNode }[]; value: T; onChange: (id: T) => void; pill?: boolean }) {
  if (pill) {
    return (
      <div className="inline-flex rounded-full bg-panel-2 p-1 ring-1 ring-inset ring-line" role="tablist">
        {tabs.map((x) => (
          <button
            key={x.id}
            type="button"
            role="tab"
            aria-selected={value === x.id}
            onClick={() => onChange(x.id)}
            className={cx('rounded-full px-4 py-1.5 font-display text-sm font-bold transition', value === x.id ? 'bg-gradient-to-r from-magenta to-violet text-white shadow-glow-magenta' : 'text-muted hover:text-fg')}
          >
            {x.label}
          </button>
        ))}
      </div>
    );
  }
  return (
    <div className="flex gap-1 overflow-x-auto overflow-y-hidden border-b border-line [scrollbar-width:none]" role="tablist">
      {tabs.map((x) => (
        <button
          key={x.id}
          role="tab"
          type="button"
          aria-selected={value === x.id}
          onClick={() => onChange(x.id)}
          className={cx(
            'relative -mb-px whitespace-nowrap px-4 py-3 font-display text-sm font-bold transition',
            value === x.id ? 'text-fg' : 'text-muted hover:text-fg',
          )}
        >
          {x.label}
          <span className={cx('absolute inset-x-3 bottom-0 h-0.5 rounded-full transition', value === x.id ? 'bg-gradient-to-r from-magenta to-cyan shadow-[0_0_12px_rgb(240_0_200/0.8)]' : 'bg-transparent')} />
        </button>
      ))}
    </div>
  );
}

/** Horizontal progress/limit meter. */
export function Meter({ value, max, tone = 'cyan', label }: { value: number; max: number; tone?: 'cyan' | 'magenta' | 'lime'; label?: string }) {
  const pct = Math.min(100, Math.round((value / Math.max(1, max)) * 100));
  const color = tone === 'magenta' ? 'from-magenta to-violet' : tone === 'lime' ? 'from-lime to-cyan' : 'from-cyan to-violet';
  return (
    <div className="space-y-1.5">
      {label && <p className="text-xs font-semibold text-muted">{label}</p>}
      <div className="h-1.5 overflow-hidden rounded-full bg-white/8" role="progressbar" aria-valuemin={0} aria-valuemax={max} aria-valuenow={value} aria-label={label}>
        <div className={cx('h-full rounded-full bg-gradient-to-r', color, pct >= 100 && 'from-tangerine to-danger')} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

/*
=========================================================
EXPLICACIÓN DEL ARCHIVO
=========================================================

Propósito: Biblioteca de componentes visuales reutilizables usados en todas las páginas.

Responsabilidades principales:
- Botones (Button, ButtonLink) con variantes primary, secondary, ghost, danger, neon y light.
- Campos de formulario (TextField, TextArea, SelectField) con etiqueta, ayuda y error accesibles.
- Contenedores y estados: Card, LoadingState, ErrorState, EmptyState, NotFoundState, FormError,
  Spinner.
- Otros: Badge, Avatar, PageHeader, SectionLabel, Tabs (role="tablist") y Meter (barra de progreso).

Elementos importantes:
- cx
- Button
- ButtonLink
- inputClass
- TextField
- TextArea
- SelectField
- Card
- SectionLabel
- Spinner
- LoadingState
- ErrorState
- NotFoundState
- EmptyState
- Badge
- Avatar
- PageHeader
- FormError
- Tabs
- Meter

Dependencias:
- react
- react-router-dom (Link)
- i18n/I18nProvider.tsx

Flujo de datos:
Recibe propiedades (props) de las páginas y devuelve elementos visuales; no llama a la API.

Aspectos técnicos importantes:
- Los campos asocian etiqueta y mensaje de error mediante useId y aria-describedby (accesibilidad).

Lugar en la arquitectura:
Capa de presentación. Garantiza un aspecto coherente en toda la aplicación.
*/
