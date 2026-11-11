import { useEffect, useRef, type ComponentType } from 'react';
import { createPortal } from 'react-dom';
import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';
import type { TranslationKey } from '../i18n/en';
import { useI18n } from '../i18n/I18nProvider';
import { Logo } from './brand';
import { IconBook, IconClose, IconDoor, IconGrid, IconHome, IconLogout, IconQuiz, IconSettings, IconShield, IconUser } from './icons';
import { Avatar, ButtonLink, cx } from './ui';

export interface NavItem {
  to: string;
  key: TranslationKey;
  icon: ComponentType<{ size?: number }>;
  end?: boolean;
}

/** Sections of the existing application (no new modules). Admin is added for SUPERADMINs. */
export function useNavItems(includeHome: boolean): NavItem[] {
  const { me } = useAuth();
  return [
    ...(includeHome ? [{ to: '/', key: 'nav.home' as const, icon: IconHome, end: true }] : []),
    { to: '/dashboard', key: 'nav.dashboard', icon: IconGrid },
    { to: '/rooms', key: 'nav.rooms', icon: IconDoor },
    { to: '/quizzes', key: 'nav.quizzes', icon: IconQuiz },
    { to: '/vocabulary', key: 'nav.vocabulary', icon: IconBook },
    ...(me?.accountRole === 'SUPERADMIN' ? [{ to: '/admin', key: 'nav.admin' as const, icon: IconShield }] : []),
  ];
}

export const navLinkClass = ({ isActive }: { isActive: boolean }) =>
  cx(
    'group flex items-center gap-3 rounded-xl px-3.5 py-2.5 font-display text-sm font-bold transition',
    isActive ? 'bg-gradient-to-r from-magenta/25 to-violet/10 text-fg shadow-[inset_3px_0_0_var(--color-magenta)]' : 'text-muted hover:bg-white/5 hover:text-fg',
  );

/** Slide-in navigation used by the landing page and by the app on small screens. */
export function NavDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useI18n();
  const { me, logout } = useAuth();
  const nav = useNavigate();
  const items = useNavItems(true);
  const panel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    panel.current?.querySelector<HTMLElement>('a, button')?.focus();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
      previous?.focus?.();
    };
  }, [open, onClose]);

  if (!open) return null;

  const onLogout = async () => {
    onClose();
    await logout();
    nav('/login');
  };

  return createPortal(
    <div className="fixed inset-0 z-50" data-no-translate>
      <div className="absolute inset-0 bg-night/70 backdrop-blur-sm" onClick={onClose} aria-hidden="true" />
      <div
        ref={panel}
        id="nav-drawer"
        role="dialog"
        aria-modal="true"
        aria-label={t('nav.menu')}
        className="animate-pop absolute inset-y-0 left-0 flex w-[min(20rem,86vw)] flex-col border-r border-line-strong bg-night-2 shadow-[20px_0_60px_-20px_rgb(160_32_240/0.5)]"
      >
        <div className="flex items-center justify-between px-5 py-4">
          <Logo size="md" />
          <button type="button" onClick={onClose} className="rounded-full p-2 text-muted transition hover:bg-white/10 hover:text-fg" aria-label={t('nav.closeMenu')}>
            <IconClose />
          </button>
        </div>
        <div className="mx-5 h-px bg-gradient-to-r from-magenta via-cyan to-transparent" aria-hidden="true" />
        <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4" aria-label={t('nav.menu')} onClick={onClose}>
          {items.map((it) => (
            <NavLink key={it.to} to={it.to} end={it.end} className={navLinkClass}>
              <it.icon size={20} />
              {t(it.key)}
            </NavLink>
          ))}
          {me && (
            <>
              <NavLink to="/profile" className={navLinkClass}>
                <IconUser size={20} />
                {t('nav.profile')}
              </NavLink>
              <NavLink to="/settings" className={navLinkClass}>
                <IconSettings size={20} />
                {t('nav.settings')}
              </NavLink>
            </>
          )}
        </nav>
        <div className="border-t border-line p-4">
          {me ? (
            <div className="flex items-center gap-3">
              <Avatar name={me.fullName} url={me.profilePictureUrl} size={40} />
              <div className="min-w-0 flex-1">
                <p className="truncate font-display text-sm font-bold">{me.fullName}</p>
                <p className="truncate text-xs text-muted">@{me.username}</p>
              </div>
              <button type="button" onClick={onLogout} className="rounded-full p-2 text-muted transition hover:bg-danger/15 hover:text-danger" aria-label={t('nav.logout')} title={t('nav.logout')}>
                <IconLogout size={20} />
              </button>
            </div>
          ) : (
            <div className="grid gap-2" onClick={onClose}>
              <ButtonLink to="/login" variant="secondary">
                {t('auth.login')}
              </ButtonLink>
              <ButtonLink to="/register">{t('auth.register')}</ButtonLink>
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}

/*
=========================================================
EXPLICACIÓN DEL ARCHIVO
=========================================================

Propósito: Menú deslizante usado por la página de inicio y por la aplicación en móviles.

Responsabilidades principales:
- useNavItems: lista de secciones (inicio, panel, salas, cuestionarios, vocabulario y administración
  solo para SUPERADMIN).
- Mostrar perfil y ajustes si hay sesión; botones de iniciar sesión y registrarse si no.
- Cerrar con Escape o con clic fuera; bloquear el desplazamiento de la página mientras está abierto.

Elementos importantes:
- useNavItems(includeHome)
- navLinkClass
- NavDrawer({ open, onClose })
- interface NavItem

Dependencias:
- react-router-dom
- react-dom (createPortal)
- auth/AuthProvider.tsx
- components/brand.tsx
- components/icons.tsx
- components/ui.tsx

Flujo de datos:
Lee el usuario actual para decidir qué enlaces mostrar.

Aspectos técnicos importantes:
- El enlace de administración solo aparece para SUPERADMIN; la ruta además está protegida en App.tsx
  y en el backend.

Lugar en la arquitectura:
Capa de presentación (navegación). Navegación principal en móviles y en la página pública.
*/
