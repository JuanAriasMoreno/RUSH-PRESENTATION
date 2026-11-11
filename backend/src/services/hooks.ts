/**
 * Decouples services from the real-time layer (avoids circular imports). The Socket.IO layer
 * registers implementations at startup; in tests without sockets they are no-ops.
 */
export const hooks = {
  /** Called before rooms/quizzes are deleted so live sessions using them are cancelled. */
  beforeRoomsOrQuizzesDeleted: (_roomIds: number[], _quizIds: number[]): void => {},
  /** A user lost access to a room (left or removed): drop them from a live session there. */
  memberLeftRoom: (_roomId: number, _userId: number): void => {},
  /** The account was deleted or its password changed: disconnect its sockets. */
  userGone: (_userId: number): void => {},
};

/*
=========================================================
EXPLICACIÓN DEL ARCHIVO
=========================================================

Propósito: Define "ganchos" (callbacks) que permiten a los servicios avisar a la capa de tiempo real
sin importarla directamente.

Responsabilidades principales:
- beforeRoomsOrQuizzesDeleted: cancelar partidas en vivo antes de borrar salas o cuestionarios.
- memberLeftRoom: sacar a un usuario de una partida si abandona o es expulsado de la sala.
- userGone: desconectar los sockets de un usuario eliminado o que cambió su contraseña.

Elementos importantes:
- objeto hooks con tres funciones vacías por defecto

Dependencias:
- Ninguna

Flujo de datos:
Los servicios llaman a estas funciones; realtime/socket.ts las reemplaza al arrancar por
implementaciones reales.

Aspectos técnicos importantes:
- Evita dependencias circulares entre servicios y Socket.IO; en pruebas sin sockets no hacen nada.

Lugar en la arquitectura:
Capa de servicios (desacoplamiento). Mantiene coherentes las partidas en vivo cuando cambian los
datos.
*/
