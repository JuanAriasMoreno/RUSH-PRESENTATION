import { useQuery } from '@tanstack/react-query';
import type { ComponentType } from 'react';
import { Link } from 'react-router-dom';
import { roomsApi, sessionsApi } from '../../api/endpoints';
import { useMe } from '../../auth/AuthProvider';
import { NeonFloor } from '../../components/brand';
import { IconArrow, IconBook, IconDoor, IconLive, IconPencil, IconPlus, IconTrophy } from '../../components/icons';
import { Badge, ButtonLink, Card, cx, EmptyState, ErrorState, LoadingState, SectionLabel } from '../../components/ui';
import { useI18n } from '../../i18n/I18nProvider';
import { RoomCard } from '../rooms/RoomCard';

function StatTile({ icon: Icon, label, value, color }: { icon: ComponentType<{ size?: number }>; label: string; value: number | string; color: string }) {
  return (
    <Card className="flex items-center gap-4 p-4">
      <span className={cx('flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br text-white', color)}>
        <Icon size={22} />
      </span>
      <span className="min-w-0">
        <span className="block font-display text-2xl font-black tabular-nums leading-none">{value}</span>
        <span className="mt-1 block truncate text-xs font-semibold text-muted">{label}</span>
      </span>
    </Card>
  );
}

export function DashboardPage() {
  const me = useMe();
  const { t, formatDate } = useI18n();
  const rooms = useQuery({ queryKey: ['rooms'], queryFn: roomsApi.list });
  const history = useQuery({ queryKey: ['sessions', 'mine'], queryFn: sessionsApi.mine });

  const live = rooms.data?.filter((r) => r.hasActiveSession) ?? [];
  // Stats derived only from the user's own loaded data.
  const played = history.data?.filter((s) => s.status === 'COMPLETED').length ?? 0;
  const points = history.data?.reduce((sum, s) => sum + (s.myScore ?? 0), 0) ?? 0;
  const dash = (v: number) => (rooms.isLoading || history.isLoading ? '–' : v);

  return (
    <div className="space-y-10">
      {/* welcome / control center */}
      <section className="relative isolate overflow-hidden rounded-3xl border border-line-strong bg-gradient-to-br from-violet/40 via-panel to-night-2 p-6 shadow-card sm:p-9">
        <NeonFloor className="-z-10 h-[75%]" cols={14} rows={5} dim />
        <div className="pointer-events-none absolute -right-24 -top-24 -z-10 h-72 w-72 rounded-full bg-magenta/30 blur-3xl" aria-hidden="true" />
        <p className="font-display text-xs font-bold uppercase tracking-[0.2em] text-cyan">{t('dash.controlCenter')}</p>
        <h1 className="mt-2 font-display text-3xl font-black tracking-tight sm:text-5xl">{t('dash.hello', { name: me.fullName.split(' ')[0] ?? me.username })}</h1>
        <p className="mt-2 max-w-xl text-fg-soft">{t('dash.subtitle')}</p>
        <div className="mt-6 flex flex-wrap gap-2">
          <ButtonLink to="/rooms?new=1">
            <IconPlus size={18} /> {t('dash.newRoom')}
          </ButtonLink>
          <ButtonLink to="/quizzes?new=1" variant="neon">
            <IconPencil size={18} /> {t('dash.newQuiz')}
          </ButtonLink>
          <ButtonLink to="/vocabulary" variant="secondary">
            <IconBook size={18} /> {t('dash.openVocabulary')}
          </ButtonLink>
        </div>
        <p className="mt-5 text-sm text-fg-soft">💡 {t('dash.translateTip')}</p>
      </section>

      <section className="grid grid-cols-2 gap-3 xl:grid-cols-4" aria-label={t('dash.quickActions')}>
        <StatTile icon={IconDoor} label={t('dash.stats.rooms')} value={dash(rooms.data?.length ?? 0)} color="from-cyan to-violet" />
        <StatTile icon={IconLive} label={t('dash.stats.live')} value={dash(live.length)} color="from-tangerine to-magenta" />
        <StatTile icon={IconTrophy} label={t('dash.stats.played')} value={dash(played)} color="from-lime to-cyan" />
        <StatTile icon={IconPencil} label={t('dash.stats.points')} value={dash(points)} color="from-sun to-tangerine" />
      </section>

      {live.length > 0 && (
        <section>
          <SectionLabel className="mb-3 text-tangerine">{t('dash.liveNow')}</SectionLabel>
          <div className="flex flex-col gap-2">
            {live.map((r) => (
              <Link
                key={r.roomId}
                to={`/rooms/${r.roomId}`}
                className="flex items-center justify-between rounded-2xl border border-tangerine/40 bg-gradient-to-r from-tangerine/15 to-magenta/10 px-5 py-4 transition hover:shadow-glow-magenta"
              >
                <span className="flex items-center gap-3 font-display font-bold">
                  <span className="h-2.5 w-2.5 animate-glow rounded-full bg-tangerine shadow-[0_0_10px_var(--color-tangerine)]" />
                  {r.name}
                </span>
                <span className="inline-flex items-center gap-1.5 text-sm font-bold text-tangerine">
                  {t('rooms.joinSession')} <IconArrow size={16} />
                </span>
              </Link>
            ))}
          </div>
        </section>
      )}

      <section>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-display text-xl font-extrabold">{t('dash.myRooms')}</h2>
          <Link to="/rooms" className="inline-flex items-center gap-1 text-sm font-bold text-cyan hover:text-white">
            {t('nav.rooms')} <IconArrow size={16} />
          </Link>
        </div>
        {rooms.isLoading ? (
          <LoadingState />
        ) : rooms.error ? (
          <ErrorState error={rooms.error} onRetry={() => rooms.refetch()} />
        ) : rooms.data!.length === 0 ? (
          <EmptyState icon="🏠" title={t('rooms.empty')} hint={t('dash.noRooms')} action={<ButtonLink to="/rooms?new=1">{t('rooms.create')}</ButtonLink>} />
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {rooms.data!.slice(0, 6).map((r) => (
              <RoomCard key={r.roomId} room={r} />
            ))}
          </div>
        )}
      </section>

      <section>
        <h2 className="mb-4 font-display text-xl font-extrabold">{t('dash.recentResults')}</h2>
        {history.isLoading ? (
          <LoadingState />
        ) : history.error ? (
          <ErrorState error={history.error} onRetry={() => history.refetch()} />
        ) : history.data!.length === 0 ? (
          <EmptyState icon="🏆" title={t('dash.noResults')} />
        ) : (
          <Card className="divide-y divide-line overflow-hidden">
            {history.data!.slice(0, 8).map((s) => (
              <Link key={s.sessionId} to={`/sessions/${s.sessionId}/results`} className="flex items-center justify-between gap-3 px-5 py-4 transition hover:bg-white/5">
                <div className="flex min-w-0 items-center gap-3">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-sun/25 to-tangerine/20 text-sun ring-1 ring-sun/30">
                    <IconTrophy size={20} />
                  </span>
                  <div className="min-w-0">
                    <p className="truncate font-display font-bold">{s.quizTitle}</p>
                    <p className="truncate text-sm text-muted">
                      {s.roomName} · {formatDate(s.createdAt, true)}
                    </p>
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {s.status !== 'COMPLETED' && <Badge tone="amber">{t(`res.status.${s.status}`)}</Badge>}
                  <span className="font-display text-lg font-black tabular-nums text-lime">{t('common.points', { n: s.myScore ?? 0 })}</span>
                </div>
              </Link>
            ))}
          </Card>
        )}
      </section>
    </div>
  );
}

/*
=========================================================
EXPLICACIÓN DEL ARCHIVO
=========================================================

Propósito: Panel del usuario con sesión (/dashboard): saludo, accesos rápidos, estadísticas, salas y
resultados recientes.

Responsabilidades principales:
- Consultar salas (roomsApi.list) e historial (sessionsApi.mine).
- Calcular estadísticas a partir de esos datos: número de salas, salas en vivo, partidas completadas
  y puntos.
- Mostrar salas con partida en curso, tarjetas de sala y resultados recientes.

Elementos importantes:
- DashboardPage()
- StatTile

Dependencias:
- @tanstack/react-query
- api/endpoints.ts
- auth/AuthProvider.tsx
- components/brand.tsx
- components/icons.tsx
- components/ui.tsx
- features/rooms/RoomCard.tsx

Flujo de datos:
Lee GET /api/rooms y GET /api/sessions/mine.

Aspectos técnicos importantes:
- Las estadísticas no son inventadas: se calculan solo con los datos del usuario.

Lugar en la arquitectura:
Capa de presentación (página). Pantalla principal tras iniciar sesión.
*/
