import { useQuery } from '@tanstack/react-query';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { LIMITS } from '@rush/shared';
import { roomsApi } from '../../api/endpoints';
import { useMe } from '../../auth/AuthProvider';
import { IconPlus } from '../../components/icons';
import { Button, EmptyState, ErrorState, LoadingState, PageHeader } from '../../components/ui';
import { useI18n } from '../../i18n/I18nProvider';
import { RoomCard } from './RoomCard';
import { RoomFormModal } from './RoomFormModal';

export function RoomsPage() {
  const { t } = useI18n();
  const me = useMe();
  const nav = useNavigate();
  const [params, setParams] = useSearchParams();
  const creating = params.get('new') === '1';
  const rooms = useQuery({ queryKey: ['rooms'], queryFn: roomsApi.list });
  const owned = rooms.data?.filter((r) => r.ownerUserId === me.userId).length ?? 0;
  const atLimit = owned >= LIMITS.maxRoomsPerUser;

  return (
    <div>
      <PageHeader
        title={t('rooms.title')}
        subtitle={t('rooms.subtitle')}
        actions={
          <Button onClick={() => setParams({ new: '1' })} disabled={atLimit} title={atLimit ? t('err.room_limit') : undefined}>
            <IconPlus size={18} /> {t('rooms.create')}
          </Button>
        }
      />
      {rooms.data && <p className="-mt-3 mb-5 text-sm text-muted">{t('rooms.limit', { n: owned, max: LIMITS.maxRoomsPerUser })}</p>}
      {rooms.isLoading ? (
        <LoadingState />
      ) : rooms.error ? (
        <ErrorState error={rooms.error} onRetry={() => rooms.refetch()} />
      ) : rooms.data!.length === 0 ? (
        <EmptyState icon="🏠" title={t('rooms.empty')} hint={t('rooms.emptyHint')} action={<Button onClick={() => setParams({ new: '1' })}>{t('rooms.create')}</Button>} />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {rooms.data!.map((r) => (
            <RoomCard key={r.roomId} room={r} />
          ))}
        </div>
      )}
      <RoomFormModal open={creating} onClose={() => setParams({})} onSaved={(r) => nav(`/rooms/${r.roomId}`)} />
    </div>
  );
}

/*
=========================================================
EXPLICACIÓN DEL ARCHIVO
=========================================================

Propósito: Lista las salas del usuario y permite crear una nueva (/rooms).

Responsabilidades principales:
- Consultar roomsApi.list.
- Mostrar cuántas salas posee el usuario frente al límite de 10.
- Abrir RoomFormModal con ?new=1.

Elementos importantes:
- RoomsPage()

Dependencias:
- @tanstack/react-query
- api/endpoints.ts
- auth/AuthProvider.tsx
- features/rooms/RoomCard.tsx
- features/rooms/RoomFormModal.tsx
- components/ui.tsx

Flujo de datos:
Lee GET /api/rooms.

Aspectos técnicos importantes:
- El botón de crear se desactiva al alcanzar el límite; el backend también lo comprueba.

Lugar en la arquitectura:
Capa de presentación (página). Punto de entrada a las salas privadas.
*/
