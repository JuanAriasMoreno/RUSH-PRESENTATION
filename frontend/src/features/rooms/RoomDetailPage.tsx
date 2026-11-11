import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import type { RoomDetailDto } from '@rush/shared';
import { LIMITS } from '@rush/shared';
import { ApiError } from '../../api/client';
import { roomsApi, sessionsApi } from '../../api/endpoints';
import { useMe } from '../../auth/AuthProvider';
import { useConfirm, useToast } from '../../components/overlays';
import { IconDoor, IconLive, IconPlay, IconPlus, IconQuiz } from '../../components/icons';
import { Avatar, Badge, Button, ButtonLink, Card, EmptyState, ErrorState, LoadingState, Meter, NotFoundState, Tabs } from '../../components/ui';
import { useI18n } from '../../i18n/I18nProvider';
import { AddQuizModal } from './AddQuizModal';
import { InvitationsPanel } from './InvitationsPanel';
import { RoomFormModal } from './RoomFormModal';

type Tab = 'quizzes' | 'members' | 'history' | 'invitations';

export function RoomDetailPage() {
  const roomId = Number(useParams().roomId);
  const room = useQuery({ queryKey: ['room', roomId], queryFn: () => roomsApi.get(roomId), enabled: Number.isFinite(roomId), refetchInterval: 15_000 });
  if (room.isLoading) return <LoadingState />;
  if (room.error instanceof ApiError && room.error.status === 404) return <NotFoundState />;
  if (room.error) return <ErrorState error={room.error} onRetry={() => room.refetch()} />;
  if (!room.data) return <NotFoundState />;
  return <RoomView room={room.data} key={room.data.roomId} />;
}

function RoomView({ room }: { room: RoomDetailDto }) {
  const { t, errorText } = useI18n();
  const me = useMe();
  const qc = useQueryClient();
  const nav = useNavigate();
  const confirm = useConfirm();
  const toast = useToast();
  const isManager = room.myRole === 'OWNER' || room.myRole === 'ADMIN';
  const isOwner = room.myRole === 'OWNER';
  const [tab, setTab] = useState<Tab>('quizzes');
  const [editing, setEditing] = useState(false);
  const [adding, setAdding] = useState(false);

  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ['room', room.roomId] });
    void qc.invalidateQueries({ queryKey: ['rooms'] });
  };
  const onError = (e: unknown) => toast(errorText(e), 'error');

  const startSession = useMutation({
    mutationFn: (quizId: number) => roomsApi.startSession(room.roomId, quizId),
    onSuccess: ({ sessionId }) => nav(`/play/${sessionId}`),
    onError,
  });

  const act = async (opts: { title: string; message?: string; danger?: boolean; confirmLabel?: string }, fn: () => Promise<unknown>, after?: () => void) => {
    if (!(await confirm(opts))) return;
    try {
      await fn();
      after ? after() : refresh();
    } catch (e) {
      onError(e);
    }
  };

  const tabs: { id: Tab; label: string }[] = [
    { id: 'quizzes', label: `${t('rooms.tab.quizzes')} (${room.quizzes.length})` },
    { id: 'members', label: `${t('rooms.tab.members')} (${room.memberCount})` },
    { id: 'history', label: t('rooms.tab.history') },
    ...(isManager ? [{ id: 'invitations' as Tab, label: t('rooms.tab.invitations') }] : []),
  ];

  return (
    <div>
      <div className="relative overflow-hidden rounded-3xl border border-line-strong bg-panel shadow-card">
        <div className="relative h-40 sm:h-56">
          <img src={room.coverImageUrl} alt="" className="h-full w-full object-cover" referrerPolicy="no-referrer" />
          <div className="absolute inset-x-0 -bottom-px top-0 bg-gradient-to-t from-panel via-panel/50 to-transparent" aria-hidden="true" />
        </div>
        <div className="relative -mt-16 p-5 sm:-mt-20 sm:p-7">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="font-display text-3xl font-black tracking-tight sm:text-4xl">{room.name}</h1>
                <Badge tone={isOwner ? 'brand' : room.myRole === 'ADMIN' ? 'blue' : 'stone'}>{t(`rooms.role.${room.myRole}`)}</Badge>
              </div>
              {room.description && <p className="mt-2 max-w-2xl whitespace-pre-line text-fg-soft">{room.description}</p>}
              <div className="mt-3 flex flex-wrap gap-1.5">
                {room.topics.map((tp) => (
                  <Badge key={tp.topicId} tone="violet">
                    {tp.name}
                  </Badge>
                ))}
              </div>
              <div className="mt-4 flex max-w-sm items-center gap-3 text-sm font-semibold text-muted">
                <IconDoor size={16} />
                <div className="flex-1">
                  <Meter value={room.memberCount} max={LIMITS.maxMembersPerRoom} />
                </div>
                <span className="whitespace-nowrap">{t('rooms.memberCount', { n: room.memberCount, max: LIMITS.maxMembersPerRoom })}</span>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              {isManager && (
                <Button variant="secondary" size="sm" onClick={() => setEditing(true)}>
                  {t('common.edit')}
                </Button>
              )}
              {isOwner ? (
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-danger-soft hover:bg-danger/10"
                  onClick={() =>
                    act({ title: t('rooms.delete'), message: t('rooms.deleteConfirm', { name: room.name }), danger: true, confirmLabel: t('common.delete') }, () => roomsApi.remove(room.roomId), () => {
                      void qc.invalidateQueries({ queryKey: ['rooms'] });
                      nav('/rooms');
                    })
                  }
                >
                  {t('rooms.delete')}
                </Button>
              ) : (
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-danger-soft hover:bg-danger/10"
                  onClick={() =>
                    act({ title: t('rooms.leave'), message: t('rooms.leaveConfirm', { name: room.name }), danger: true, confirmLabel: t('rooms.leave') }, () => roomsApi.leave(room.roomId), () => {
                      void qc.invalidateQueries({ queryKey: ['rooms'] });
                      nav('/rooms');
                    })
                  }
                >
                  {t('rooms.leave')}
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>

      {room.activeSession && (
        <div className="mt-5 flex flex-col gap-3 rounded-2xl border border-tangerine/50 bg-gradient-to-r from-tangerine/15 via-magenta/10 to-transparent p-4 shadow-glow-magenta sm:flex-row sm:items-center sm:justify-between sm:p-5">
          <p className="flex items-center gap-3 font-display font-bold text-fg">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-tangerine/20 text-tangerine">
              <IconLive size={20} />
            </span>
            {t('rooms.activeSession', { title: room.activeSession.quizTitle, status: t(`res.status.${room.activeSession.status}`) })}
          </p>
          <div className="flex gap-2">
            {room.activeSession.status === 'WAITING' && <ButtonLink to={`/play/${room.activeSession.sessionId}`}>{t('rooms.joinSession')}</ButtonLink>}
            {isManager && (
              <Button
                variant="secondary"
                onClick={() => act({ title: t('play.cancel'), message: t('play.cancelConfirm'), danger: true }, () => sessionsApi.cancel(room.activeSession!.sessionId))}
              >
                {t('play.cancel')}
              </Button>
            )}
          </div>
        </div>
      )}

      <div className="mt-8">
        <Tabs tabs={tabs} value={tab} onChange={setTab} />
      </div>

      <div className="mt-5" role="tabpanel">
        {tab === 'quizzes' && (
          <div className="space-y-3">
            {isManager && (
              <div className="flex justify-end">
                <Button onClick={() => setAdding(true)}>
                  <IconPlus size={18} /> {t('rooms.addQuiz')}
                </Button>
              </div>
            )}
            {room.quizzes.length === 0 ? (
              <EmptyState icon="📝" title={t('rooms.noQuizzes')} />
            ) : (
              room.quizzes.map((q) => (
                <Card key={q.quizId} className="flex flex-col gap-4 p-4 transition hover:border-cyan/30 sm:flex-row sm:items-center sm:justify-between sm:p-5">
                  <div className="flex min-w-0 items-start gap-4">
                    <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-magenta/30 to-violet/30 text-pink ring-1 ring-magenta/30">
                      <IconQuiz size={24} />
                    </span>
                    <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-display text-lg font-extrabold">{q.title}</h3>
                      <Badge tone={q.status === 'PUBLISHED' ? 'green' : 'stone'}>{t(`quiz.status.${q.status}`)}</Badge>
                    </div>
                    {q.description && <p className="mt-0.5 line-clamp-2 text-sm text-muted">{q.description}</p>}
                    <p className="mt-1 text-xs font-semibold text-muted">
                      {t('rooms.questions', { n: q.questionCount })} · {t('rooms.by', { name: q.creatorUsername })}
                    </p>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {q.canEdit && <ButtonLink to={`/quizzes/${q.quizId}`} variant="secondary">{t('common.edit')}</ButtonLink>}
                    {isManager && (
                      <>
                        <Button
                          onClick={() => startSession.mutate(q.quizId)}
                          disabled={q.status !== 'PUBLISHED' || !!room.activeSession || q.questionCount === 0}
                          title={q.status !== 'PUBLISHED' ? t('rooms.draftCannotPlay') : undefined}
                          loading={startSession.isPending && startSession.variables === q.quizId}
                        >
                          <IconPlay size={16} /> {t('rooms.play')}
                        </Button>
                        <Button
                          variant="ghost"
                          onClick={() => act({ title: t('rooms.removeQuiz'), message: t('rooms.removeQuizConfirm', { title: q.title }) }, () => roomsApi.removeQuiz(room.roomId, q.quizId))}
                        >
                          {t('common.remove')}
                        </Button>
                      </>
                    )}
                  </div>
                </Card>
              ))
            )}
          </div>
        )}

        {tab === 'members' && (
          <Card className="divide-y divide-line overflow-hidden">
            {room.members.map((m) => {
              const canRemove = m.userId !== me.userId && m.role !== 'OWNER' && (isOwner || (room.myRole === 'ADMIN' && m.role === 'MEMBER'));
              return (
                <div key={m.userId} className="flex flex-col gap-2 px-4 py-3.5 transition hover:bg-white/[0.03] sm:flex-row sm:items-center sm:justify-between sm:px-5">
                  <Link to={`/users/${m.username}`} className="flex min-w-0 items-center gap-3 hover:opacity-80">
                    <Avatar name={m.fullName} url={m.profilePictureUrl} size={42} ring={m.role === 'OWNER'} />
                    <div className="min-w-0">
                      <p className="truncate font-display font-bold">{m.fullName}</p>
                      <p className="truncate text-sm text-muted">@{m.username}</p>
                    </div>
                    <Badge tone={m.role === 'OWNER' ? 'brand' : m.role === 'ADMIN' ? 'blue' : 'stone'}>{t(`rooms.role.${m.role}`)}</Badge>
                  </Link>
                  <div className="flex gap-2">
                    {isOwner && m.role !== 'OWNER' && (
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={async () => {
                          try {
                            await roomsApi.setRole(room.roomId, m.userId, m.role === 'ADMIN' ? 'MEMBER' : 'ADMIN');
                            refresh();
                          } catch (e) {
                            onError(e);
                          }
                        }}
                      >
                        {m.role === 'ADMIN' ? t('rooms.makeMember') : t('rooms.makeAdmin')}
                      </Button>
                    )}
                    {canRemove && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-danger-soft hover:bg-danger/10"
                        onClick={() =>
                          act({ title: t('rooms.removeMember'), message: t('rooms.removeMemberConfirm', { name: m.fullName }), danger: true, confirmLabel: t('rooms.removeMember') }, () =>
                            roomsApi.removeMember(room.roomId, m.userId),
                          )
                        }
                      >
                        {t('rooms.removeMember')}
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
          </Card>
        )}

        {tab === 'history' && <RoomHistory roomId={room.roomId} />}
        {tab === 'invitations' && isManager && <InvitationsPanel roomId={room.roomId} />}
      </div>

      <RoomFormModal
        open={editing}
        onClose={() => setEditing(false)}
        room={room}
        onSaved={(saved) => {
          qc.setQueryData(['room', room.roomId], saved);
          void qc.invalidateQueries({ queryKey: ['rooms'] });
          setEditing(false);
        }}
      />
      {isManager && <AddQuizModal open={adding} onClose={() => setAdding(false)} room={room} onDone={refresh} />}
    </div>
  );
}

function RoomHistory({ roomId }: { roomId: number }) {
  const { t, formatDate } = useI18n();
  const q = useQuery({ queryKey: ['room', roomId, 'sessions'], queryFn: () => roomsApi.sessions(roomId) });
  if (q.isLoading) return <LoadingState />;
  if (q.error) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  if (q.data!.length === 0) return <EmptyState icon="🕑" title={t('rooms.noHistory')} />;
  return (
    <Card className="divide-y divide-line overflow-hidden">
      {q.data!.map((s) => (
        <div key={s.sessionId} className="flex flex-col gap-2 px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between sm:px-5">
          <div>
            <p className="font-display font-bold">{s.quizTitle}</p>
            <p className="text-sm text-muted">
              {formatDate(s.createdAt, true)} · {t('rooms.participants', { n: s.participantCount })}
              {s.myScore !== null && ` · ${t('rooms.myScore', { n: s.myScore })}`}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Badge tone={s.status === 'COMPLETED' ? 'green' : s.status === 'CANCELLED' ? 'red' : 'amber'}>{t(`res.status.${s.status}`)}</Badge>
            {(s.status === 'COMPLETED' || s.status === 'CANCELLED') && (
              <ButtonLink to={`/sessions/${s.sessionId}/results`} variant="secondary">
                {t('rooms.viewResults')}
              </ButtonLink>
            )}
          </div>
        </div>
      ))}
    </Card>
  );
}

/*
=========================================================
EXPLICACIÓN DEL ARCHIVO
=========================================================

Propósito: Página de una sala (/rooms/:roomId) con pestañas de cuestionarios, miembros, historial e
invitaciones.

Responsabilidades principales:
- Consultar roomsApi.get cada 15 segundos para ver cambios (por ejemplo, partidas activas).
- Editar, borrar o abandonar la sala con confirmación.
- Iniciar una sesión de juego (roomsApi.startSession) y navegar a /play/:sessionId; cancelar la
  sesión activa.
- Gestionar miembros: nombrar o quitar administradores (solo el propietario) y expulsar miembros.
- Mostrar el historial de sesiones (RoomHistory) y el panel de invitaciones (solo OWNER/ADMIN).

Elementos importantes:
- RoomDetailPage()
- RoomView
- RoomHistory

Dependencias:
- @tanstack/react-query
- api/endpoints.ts
- auth/AuthProvider.tsx
- components/overlays.tsx
- components/ui.tsx
- components/icons.tsx
- features/rooms/AddQuizModal.tsx, InvitationsPanel.tsx, RoomFormModal.tsx

Flujo de datos:
Lee GET /api/rooms/:roomId y GET /api/rooms/:roomId/sessions; envía las acciones de gestión.

Aspectos técnicos importantes:
- Los botones se muestran según el rol, pero el backend vuelve a verificar cada acción.

Lugar en la arquitectura:
Capa de presentación (página). Centro de gestión de una sala.
*/
