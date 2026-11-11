import { Link } from 'react-router-dom';
import type { RoomSummaryDto } from '@rush/shared';
import { LIMITS } from '@rush/shared';
import { IconDoor, IconQuiz } from '../../components/icons';
import { Badge, cx } from '../../components/ui';
import { useI18n } from '../../i18n/I18nProvider';

export function RoomCard({ room }: { room: RoomSummaryDto }) {
  const { t } = useI18n();
  const fill = Math.round((room.memberCount / LIMITS.maxMembersPerRoom) * 100);
  return (
    <Link
      to={`/rooms/${room.roomId}`}
      className={cx(
        'group flex flex-col overflow-hidden rounded-2xl border bg-panel shadow-card transition duration-200 hover:-translate-y-1',
        room.hasActiveSession ? 'border-tangerine/50 hover:shadow-glow-magenta' : 'border-line hover:border-cyan/40 hover:shadow-glow-cyan',
      )}
    >
      <div className="relative h-32 overflow-hidden bg-panel-2">
        <img src={room.coverImageUrl} alt="" className="h-full w-full object-cover transition duration-500 group-hover:scale-105" loading="lazy" referrerPolicy="no-referrer" />
        <div className="absolute inset-0 bg-gradient-to-t from-panel via-panel/20 to-transparent" aria-hidden="true" />
        {room.hasActiveSession && (
          <span className="absolute left-3 top-3 inline-flex items-center gap-1.5 rounded-full bg-night/85 px-2.5 py-1 font-display text-xs font-bold text-tangerine ring-1 ring-tangerine/50 backdrop-blur">
            <span className="h-2 w-2 animate-glow rounded-full bg-tangerine shadow-[0_0_8px_var(--color-tangerine)]" /> {t('dash.liveNow')}
          </span>
        )}
        <span className="absolute right-3 top-3 rounded-full bg-night/80 backdrop-blur">
          <Badge tone={room.myRole === 'OWNER' ? 'brand' : room.myRole === 'ADMIN' ? 'blue' : 'stone'}>{t(`rooms.role.${room.myRole}`)}</Badge>
        </span>
      </div>
      <div className="flex flex-1 flex-col p-5 pt-3">
        <h3 className="font-display text-lg font-extrabold leading-tight text-fg transition group-hover:text-cyan">{room.name}</h3>
        {room.description && <p className="mt-1 line-clamp-2 text-sm text-muted">{room.description}</p>}
        {room.topics.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {room.topics.slice(0, 4).map((tp) => (
              <Badge key={tp.topicId} tone="violet">
                {tp.name}
              </Badge>
            ))}
          </div>
        )}
        <div className="mt-auto pt-4">
          <div className="flex items-center justify-between text-xs font-semibold text-muted">
            <span className="inline-flex items-center gap-1.5">
              <IconDoor size={14} /> {t('rooms.memberCount', { n: room.memberCount, max: LIMITS.maxMembersPerRoom })}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <IconQuiz size={14} /> {t('rooms.quizCount', { n: room.quizCount })}
            </span>
          </div>
          <div className="mt-2 h-1 overflow-hidden rounded-full bg-white/8" aria-hidden="true">
            <div className="h-full rounded-full bg-gradient-to-r from-cyan to-magenta" style={{ width: `${fill}%` }} />
          </div>
        </div>
      </div>
    </Link>
  );
}

/*
=========================================================
EXPLICACIÓN DEL ARCHIVO
=========================================================

Propósito: Tarjeta que resume una sala: portada, rol, temas, miembros, cuestionarios y si hay una
partida en vivo.

Responsabilidades principales:
- Mostrar la portada guardada (cover_image_url).
- Indicadores de rol y de partida en vivo.
- Barra de ocupación respecto a 40 miembros.

Elementos importantes:
- RoomCard({ room })

Dependencias:
- react-router-dom
- @rush/shared (LIMITS, RoomSummaryDto)
- components/icons.tsx
- components/ui.tsx

Flujo de datos:
Recibe un RoomSummaryDto.

Aspectos técnicos importantes:
- Enlaza a /rooms/:roomId.

Lugar en la arquitectura:
Capa de presentación. Se usa en el panel y en el listado de salas.
*/
