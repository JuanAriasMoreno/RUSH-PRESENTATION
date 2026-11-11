import { useCallback, useState, type ReactNode } from 'react';
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';
import { useI18n } from '../i18n/I18nProvider';
import { Logo } from './brand';
import { IconLogout, IconMenu, IconSettings } from './icons';
import { NavDrawer, navLinkClass, useNavItems } from './NavDrawer';
import { TranslationLayer } from './TranslationPopup';
import { Avatar, cx } from './ui';

export { Logo } from './brand';

/**
 * Shell for every authenticated page: fixed sidebar on large screens, top bar + drawer on
 * phones/tablets.
 */
export function AppLayout({ children }: { children: ReactNode }) {
  const { me, logout } = useAuth();
  const { t } = useI18n();
  const nav = useNavigate();
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  const items = useNavItems(false);
  // No look-ups while a live quiz is running (would let players translate the answers).
  const inGame = location.pathname.startsWith('/play/');

  const onLogout = async () => {
    await logout();
    nav('/login');
  };

  return (
    <div className="app-backdrop min-h-screen">
      {/* ---------------------------------------- sidebar (lg+) */}
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-64 flex-col border-r border-line bg-night-2/90 backdrop-blur lg:flex">
        <Link to="/" className="px-6 pb-4 pt-6" aria-label="RUSH! home">
          <Logo size="lg" />
        </Link>
        <div className="mx-6 h-px bg-gradient-to-r from-magenta via-cyan to-transparent" aria-hidden="true" />
        <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-5" aria-label="Main">
          {items.map((it) => (
            <NavLink key={it.to} to={it.to} end={it.end} className={navLinkClass}>
              <it.icon size={20} />
              {t(it.key)}
            </NavLink>
          ))}
          <NavLink to="/settings" className={navLinkClass}>
            <IconSettings size={20} />
            {t('nav.settings')}
          </NavLink>
        </nav>
        <div className="border-t border-line p-3">
          <NavLink to="/profile" className={({ isActive }) => cx('flex items-center gap-3 rounded-xl p-2.5 transition', isActive ? 'bg-white/8' : 'hover:bg-white/5')} aria-label={t('nav.profile')}>
            <Avatar name={me?.fullName ?? ''} url={me?.profilePictureUrl} size={38} />
            <span className="min-w-0">
              <span className="block truncate font-display text-sm font-bold">{me?.fullName}</span>
              <span className="block truncate text-xs text-muted">@{me?.username}</span>
            </span>
          </NavLink>
          <button
            type="button"
            onClick={onLogout}
            className="mt-1 flex w-full items-center gap-3 rounded-xl px-3.5 py-2.5 font-display text-sm font-bold text-muted transition hover:bg-danger/10 hover:text-[#ff6b6b]"
          >
            <IconLogout size={20} />
            {t('nav.logout')}
          </button>
        </div>
      </aside>

      {/* ---------------------------------------- top bar (< lg) */}
      <header className="sticky top-0 z-40 border-b border-line bg-night/85 backdrop-blur lg:hidden">
        <div className="flex h-16 items-center justify-between px-3 sm:px-5">
          <button type="button" className="rounded-full p-2.5 text-fg transition hover:bg-white/10" aria-expanded={open} aria-controls="nav-drawer" aria-label={t('nav.menu')} onClick={() => setOpen(true)}>
            <IconMenu size={24} />
          </button>
          <Link to="/" aria-label="RUSH! home">
            <Logo size="md" />
          </Link>
          <NavLink to="/profile" className="rounded-full p-1" aria-label={t('nav.profile')}>
            <Avatar name={me?.fullName ?? ''} url={me?.profilePictureUrl} size={34} />
          </NavLink>
        </div>
      </header>
      <NavDrawer open={open} onClose={close} />

      <main className="lg:pl-64">
        <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-10 lg:px-10">{children}</div>
      </main>
      <TranslationLayer disabled={inGame} />
    </div>
  );
}

/*
=========================================================
EXPLICACIÓN DEL ARCHIVO
=========================================================

Propósito: Define el marco común de todas las páginas con sesión: barra lateral en pantallas grandes
y barra superior con menú en móviles.

Responsabilidades principales:
- Mostrar el logotipo, los enlaces de navegación, el enlace al perfil y el botón de cerrar sesión.
- Abrir el NavDrawer en pantallas pequeñas.
- Montar la capa de traducción (TranslationLayer), desactivada en las rutas /play/ para que no se
  puedan traducir las respuestas durante una partida.

Elementos importantes:
- AppLayout({ children })
- reexporta Logo

Dependencias:
- react-router-dom
- auth/AuthProvider.tsx
- components/NavDrawer.tsx
- components/TranslationPopup.tsx
- components/brand.tsx
- components/icons.tsx
- components/ui.tsx

Flujo de datos:
Recibe la página como children y le añade la navegación.

Aspectos técnicos importantes:
- Cerrar sesión llama a logout() y navega a /login.

Lugar en la arquitectura:
Capa de presentación (estructura). Da la navegación a todas las páginas internas.
*/
