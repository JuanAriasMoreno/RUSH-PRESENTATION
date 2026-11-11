import { useCallback, useRef, useState, type ComponentType } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../auth/AuthProvider';
import { Logo, NeonDots, NeonFloor } from '../../components/brand';
import { IconArrow, IconBolt, IconBook, IconDoor, IconLive, IconMenu, IconPencil, IconTrophy, IconUser, IconUsers } from '../../components/icons';
import { NavDrawer } from '../../components/NavDrawer';
import { Avatar, Button, ButtonLink, cx } from '../../components/ui';
import type { TranslationKey } from '../../i18n/en';
import { useI18n } from '../../i18n/I18nProvider';

interface Highlight {
  icon: ComponentType<{ size?: number }>;
  title: TranslationKey;
  text: TranslationKey;
  color: string;
}

const HIGHLIGHTS: Highlight[] = [
  { icon: IconBolt, title: 'landing.h.interactive', text: 'landing.h.interactiveText', color: 'from-magenta to-violet' },
  { icon: IconDoor, title: 'landing.h.rooms', text: 'landing.h.roomsText', color: 'from-cyan to-violet' },
  { icon: IconLive, title: 'landing.h.realtime', text: 'landing.h.realtimeText', color: 'from-tangerine to-magenta' },
  { icon: IconPencil, title: 'landing.h.created', text: 'landing.h.createdText', color: 'from-lime to-cyan' },
  { icon: IconBook, title: 'landing.h.vocabulary', text: 'landing.h.vocabularyText', color: 'from-sun to-tangerine' },
];

interface Feature extends Highlight {
  to: string;
  glow: string;
}

/** Each card opens the existing feature (protected routes go through the normal login flow). */
const FEATURES: Feature[] = [
  { icon: IconPencil, title: 'landing.f.create', text: 'landing.f.createText', to: '/quizzes?new=1', color: 'from-magenta to-violet', glow: 'hover:shadow-glow-magenta hover:border-magenta/50' },
  { icon: IconDoor, title: 'landing.f.join', text: 'landing.f.joinText', to: '/rooms', color: 'from-cyan to-violet', glow: 'hover:shadow-glow-cyan hover:border-cyan/50' },
  { icon: IconUsers, title: 'landing.f.challenge', text: 'landing.f.challengeText', to: '/rooms?new=1', color: 'from-tangerine to-magenta', glow: 'hover:shadow-glow-magenta hover:border-tangerine/50' },
  { icon: IconLive, title: 'landing.f.play', text: 'landing.f.playText', to: '/rooms', color: 'from-lime to-cyan', glow: 'hover:shadow-glow-lime hover:border-lime/50' },
  { icon: IconTrophy, title: 'landing.f.results', text: 'landing.f.resultsText', to: '/dashboard', color: 'from-sun to-tangerine', glow: 'hover:shadow-glow-cyan hover:border-sun/50' },
  { icon: IconBook, title: 'landing.f.vocabulary', text: 'landing.f.vocabularyText', to: '/vocabulary', color: 'from-violet to-cyan', glow: 'hover:shadow-glow-cyan hover:border-violet/60' },
];

export function LandingPage() {
  const { t } = useI18n();
  const { me } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const closeMenu = useCallback(() => setMenuOpen(false), []);
  const more = useRef<HTMLElement>(null);

  const scrollToMore = () => {
    more.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    more.current?.focus({ preventScroll: true });
  };

  return (
    <div className="min-h-screen bg-night text-fg">
      {/* ------------------------------------------------ header */}
      <header className="absolute inset-x-0 top-0 z-30">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:h-20 sm:px-6">
          <button
            type="button"
            onClick={() => setMenuOpen(true)}
            className="rounded-full p-2.5 text-fg transition hover:bg-white/10"
            aria-label={t('nav.menu')}
            aria-expanded={menuOpen}
            aria-controls="nav-drawer"
          >
            <IconMenu size={26} />
          </button>
          <Link to="/" aria-label="RUSH!" className="sm:hidden">
            <Logo size="sm" />
          </Link>
          <div className="flex items-center gap-1">
            <button
              type="button"
              className="hidden rounded-full px-3 py-1.5 text-sm font-semibold text-fg-soft transition hover:bg-white/10 sm:block"
            >
              한국어
            </button>
            <Link
              to={me ? '/profile' : '/login'}
              className="rounded-full p-1.5 text-fg transition hover:bg-white/10"
              aria-label={me ? t('nav.profile') : t('auth.login')}
              title={me ? t('nav.profile') : t('auth.login')}
            >
              {me ? <Avatar name={me.fullName} url={me.profilePictureUrl} size={36} /> : <span className="flex h-9 w-9 items-center justify-center rounded-full ring-2 ring-inset ring-white/70"><IconUser size={20} /></span>}
            </Link>
          </div>
        </div>
      </header>
      <NavDrawer open={menuOpen} onClose={closeMenu} />

      <main>
        {/* ------------------------------------------------ hero */}
        <section className="relative isolate flex min-h-[100svh] items-center overflow-hidden pb-52 pt-24 sm:pb-60">
          <div className="absolute inset-0 -z-20 bg-[radial-gradient(70rem_40rem_at_50%_110%,rgb(160_32_240/0.45),transparent_60%),radial-gradient(40rem_30rem_at_10%_10%,rgb(0_217_255/0.18),transparent_60%),radial-gradient(40rem_30rem_at_90%_20%,rgb(240_0_200/0.22),transparent_60%)]" />
          <NeonFloor className="-z-10 h-[30%] sm:h-[34%]" cols={12} rows={7} />
          <div className="mx-auto w-full max-w-6xl px-5 text-center sm:px-6">
            <p className="mx-auto inline-flex items-center gap-2 rounded-full border border-line-strong bg-night/60 px-4 py-1.5 font-display text-xs font-bold uppercase tracking-[0.2em] text-cyan backdrop-blur">
              <span className="h-2 w-2 animate-glow rounded-full bg-lime shadow-[0_0_10px_var(--color-lime)]" />
              {t('landing.eyebrow')}
            </p>
            <h1 className="mt-6">
              <Logo size="hero" neon className="animate-float" />
              <span className="mt-4 block font-display text-2xl font-extrabold tracking-tight sm:text-4xl">{t('landing.title')}</span>
            </h1>
            <p className="mx-auto mt-4 max-w-xl text-lg font-semibold text-fg sm:text-xl">{t('landing.tagline')}</p>
            <p className="mx-auto mt-3 max-w-xl text-fg-soft">{t('landing.description')}</p>
            <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <ButtonLink to="/dashboard" size="lg" className="w-full max-w-xs text-lg sm:w-auto">
                {t('landing.cta')} <IconArrow size={20} />
              </ButtonLink>
              <Button variant="light" size="lg" className="w-full max-w-xs text-lg sm:w-auto" onClick={scrollToMore}>
                {t('landing.more')}
              </Button>
            </div>
          </div>
        </section>

        {/* ------------------------------------------------ highlights (white contrast section) */}
        <section ref={more} id="learn-more" tabIndex={-1} className="relative scroll-mt-4 rounded-t-[2.5rem] bg-white text-night focus:outline-none">
          <div className="mx-auto max-w-6xl px-5 py-20 sm:px-6 sm:py-24">
            <div className="text-center">
              <NeonDots />
              <h2 className="mt-4 font-display text-3xl font-black tracking-tight sm:text-5xl">{t('landing.highlightsTitle')}</h2>
              <p className="mx-auto mt-3 max-w-xl text-lg text-[#4a5180]">{t('landing.highlightsSubtitle')}</p>
            </div>
            <ul className="mt-14 grid gap-5 sm:grid-cols-2 lg:grid-cols-5">
              {HIGHLIGHTS.map((h) => (
                <li key={h.title} className="rounded-3xl bg-[#f2f3fb] p-6 text-left transition hover:-translate-y-1 hover:shadow-[0_20px_40px_-20px_rgb(5_9_31/0.35)]">
                  <span className={cx('flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br text-white shadow-lg', h.color)}>
                    <h.icon size={24} />
                  </span>
                  <h3 className="mt-5 font-display text-lg font-extrabold leading-tight">{t(h.title)}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-[#4a5180]">{t(h.text)}</p>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* ------------------------------------------------ features */}
        <section className="relative bg-night-2">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(50rem_30rem_at_80%_0%,rgb(160_32_240/0.2),transparent_60%)]" aria-hidden="true" />
          <div className="relative mx-auto max-w-6xl px-5 py-20 sm:px-6 sm:py-24">
            <div className="max-w-2xl">
              <p className="font-display text-xs font-bold uppercase tracking-[0.2em] text-magenta">RUSH!</p>
              <h2 className="mt-2 font-display text-3xl font-black tracking-tight sm:text-5xl">{t('landing.featuresTitle')}</h2>
              <p className="mt-3 text-lg text-fg-soft">{t('landing.featuresSubtitle')}</p>
            </div>
            <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {FEATURES.map((f) => (
                <Link key={f.title} to={f.to} className={cx('group flex flex-col rounded-3xl border border-line bg-panel p-6 shadow-card transition duration-200 hover:-translate-y-1', f.glow)}>
                  <span className={cx('flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br text-white', f.color)}>
                    <f.icon size={28} />
                  </span>
                  <h3 className="mt-6 font-display text-xl font-extrabold">{t(f.title)}</h3>
                  <p className="mt-2 flex-1 text-fg-soft">{t(f.text)}</p>
                  <span className="mt-6 inline-flex items-center gap-1.5 font-display text-sm font-bold text-cyan transition group-hover:gap-2.5">
                    {t('landing.open')} <IconArrow size={16} />
                  </span>
                </Link>
              ))}
            </div>
          </div>
        </section>

        {/* ------------------------------------------------ final call to action */}
        <section className="relative isolate overflow-hidden bg-night">
          <NeonFloor className="-z-10 h-full" cols={14} rows={5} dim />
          <div className="mx-auto max-w-3xl px-5 py-24 text-center sm:py-32">
            <h2 className="font-display text-4xl font-black tracking-tight sm:text-6xl">
              <span className="text-neon animate-shimmer">{t('landing.finalTitle')}</span>
            </h2>
            <p className="mx-auto mt-4 max-w-xl text-lg text-fg-soft">{t('landing.finalText')}</p>
            <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
              {me ? (
                <ButtonLink to="/dashboard" size="lg">
                  {t('landing.goDashboard')} <IconArrow size={20} />
                </ButtonLink>
              ) : (
                <>
                  <ButtonLink to="/register" size="lg">
                    {t('auth.register')}
                  </ButtonLink>
                  <ButtonLink to="/login" variant="neon" size="lg">
                    {t('auth.login')}
                  </ButtonLink>
                </>
              )}
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-line bg-night-2">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-3 px-5 py-8 text-sm text-muted sm:flex-row sm:px-6">
          <Logo size="sm" />
          <p>{t('landing.footer')}</p>
        </div>
      </footer>
    </div>
  );
}

/*
=========================================================
EXPLICACIÓN DEL ARCHIVO
=========================================================

Propósito: Página pública (ruta /) que presenta RUSH! a los visitantes sin necesidad de iniciar
sesión.

Responsabilidades principales:
- Cabecera con menú, logotipo, botón de idioma (sin función; la interfaz es solo en inglés) y acceso a perfil o inicio de sesión.
- Sección principal con el logotipo grande, el fondo de neón y los botones "Try it now!" (a
  /dashboard) y "Learn more" (desplazamiento suave).
- Sección blanca de ventajas, tarjetas de funciones que enlazan a las páginas reales y llamada final
  a la acción.

Elementos importantes:
- LandingPage()
- HIGHLIGHTS
- FEATURES

Dependencias:
- react-router-dom
- auth/AuthProvider.tsx
- components/brand.tsx
- components/icons.tsx
- components/NavDrawer.tsx
- components/ui.tsx
- i18n/I18nProvider.tsx

Flujo de datos:
Solo lee si hay usuario para adaptar los botones; no consulta otros datos.

Aspectos técnicos importantes:
- Las rutas protegidas a las que enlaza llevan al visitante por el flujo normal de inicio de sesión.
- El texto describe la aplicación completa (por ejemplo, cinco tipos de pregunta).

Lugar en la arquitectura:
Capa de presentación (página). Primera pantalla que ve cualquier visitante.
*/
