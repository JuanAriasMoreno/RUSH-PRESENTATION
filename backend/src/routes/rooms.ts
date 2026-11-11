import { Router } from 'express';
import {
  createSessionSchema,
  invitationCreateSchema,
  memberRoleSchema,
  quizInputSchema,
  roomInputSchema,
  roomQuizSchema,
  roomUpdateSchema,
} from '@rush/shared';
import { parse, parseId } from '../http/errors';
import { ah, currentUser, invitationLimiter, requireAuth } from '../http/middleware';
import * as invitations from '../services/invitations';
import * as quizzes from '../services/quizzes';
import * as rooms from '../services/rooms';
import * as sessions from '../services/sessions';

export const roomsRouter = Router();
roomsRouter.use(requireAuth);

roomsRouter.get('/rooms', ah(async (req, res) => {
  res.json(await rooms.listMyRooms(currentUser(req).userId));
}));

roomsRouter.post('/rooms', ah(async (req, res) => {
  const userId = currentUser(req).userId;
  const roomId = await rooms.createRoom(userId, parse(roomInputSchema, req.body));
  res.status(201).json(await rooms.getRoom(roomId, userId));
}));

roomsRouter.get('/rooms/:roomId', ah(async (req, res) => {
  res.json(await rooms.getRoom(parseId(req.params.roomId), currentUser(req).userId));
}));

roomsRouter.patch('/rooms/:roomId', ah(async (req, res) => {
  const roomId = parseId(req.params.roomId);
  const userId = currentUser(req).userId;
  await rooms.updateRoom(roomId, userId, parse(roomUpdateSchema, req.body));
  res.json(await rooms.getRoom(roomId, userId));
}));

roomsRouter.delete('/rooms/:roomId', ah(async (req, res) => {
  await rooms.deleteRoom(parseId(req.params.roomId), currentUser(req).userId);
  res.status(204).end();
}));

roomsRouter.post('/rooms/:roomId/leave', ah(async (req, res) => {
  await rooms.leaveRoom(parseId(req.params.roomId), currentUser(req).userId);
  res.status(204).end();
}));

roomsRouter.delete('/rooms/:roomId/members/:userId', ah(async (req, res) => {
  await rooms.removeMember(parseId(req.params.roomId), currentUser(req).userId, parseId(req.params.userId));
  res.status(204).end();
}));

roomsRouter.patch('/rooms/:roomId/members/:userId', ah(async (req, res) => {
  const { role } = parse(memberRoleSchema, req.body);
  await rooms.setMemberRole(parseId(req.params.roomId), currentUser(req).userId, parseId(req.params.userId), role);
  res.status(204).end();
}));

roomsRouter.post('/rooms/:roomId/quizzes', ah(async (req, res) => {
  const { quizId } = parse(roomQuizSchema, req.body);
  await rooms.addQuizToRoom(parseId(req.params.roomId), currentUser(req).userId, quizId);
  res.status(201).json({ quizId });
}));

/** Creates a quiz directly from the room (not shown in the library, A-3). */
roomsRouter.post('/rooms/:roomId/quizzes/new', ah(async (req, res) => {
  const quizId = await quizzes.createQuiz(currentUser(req).userId, parse(quizInputSchema, req.body), parseId(req.params.roomId));
  res.status(201).json({ quizId });
}));

roomsRouter.delete('/rooms/:roomId/quizzes/:quizId', ah(async (req, res) => {
  await rooms.removeQuizFromRoom(parseId(req.params.roomId), currentUser(req).userId, parseId(req.params.quizId));
  res.status(204).end();
}));

roomsRouter.get('/rooms/:roomId/invitations', ah(async (req, res) => {
  res.json(await invitations.listInvitations(parseId(req.params.roomId), currentUser(req).userId));
}));

roomsRouter.post('/rooms/:roomId/invitations', invitationLimiter, ah(async (req, res) => {
  const input = parse(invitationCreateSchema, req.body ?? {});
  res.status(201).json(await invitations.createInvitation(parseId(req.params.roomId), currentUser(req).userId, input));
}));

roomsRouter.delete('/rooms/:roomId/invitations/:invitationId', ah(async (req, res) => {
  await invitations.revokeInvitation(parseId(req.params.roomId), parseId(req.params.invitationId), currentUser(req).userId);
  res.status(204).end();
}));

roomsRouter.get('/rooms/:roomId/sessions', ah(async (req, res) => {
  res.json(await sessions.listRoomSessions(parseId(req.params.roomId), currentUser(req).userId));
}));

roomsRouter.post('/rooms/:roomId/sessions', ah(async (req, res) => {
  const { quizId } = parse(createSessionSchema, req.body);
  const sessionId = await sessions.createSession(parseId(req.params.roomId), currentUser(req).userId, quizId);
  res.status(201).json({ sessionId });
}));

/*
=========================================================
EXPLICACIÓN DEL ARCHIVO
=========================================================

Propósito: Define las rutas de salas: listado, creación, detalle, edición, borrado, abandono,
miembros, cuestionarios de la sala, invitaciones y sesiones de juego.

Responsabilidades principales:
- GET/POST /api/rooms; GET/PATCH/DELETE /api/rooms/:roomId; POST /api/rooms/:roomId/leave.
- PATCH y DELETE /api/rooms/:roomId/members/:userId (rol y expulsión).
- POST /api/rooms/:roomId/quizzes, POST /api/rooms/:roomId/quizzes/new y DELETE
  /api/rooms/:roomId/quizzes/:quizId.
- GET/POST /api/rooms/:roomId/invitations y DELETE /api/rooms/:roomId/invitations/:invitationId.
- GET/POST /api/rooms/:roomId/sessions.

Elementos importantes:
- roomsRouter (todas las rutas exigen requireAuth)

Dependencias:
- express
- @rush/shared (esquemas de validación)
- services/rooms.ts
- services/invitations.ts
- services/quizzes.ts
- services/sessions.ts
- http/middleware.ts
- http/errors.ts

Flujo de datos:
Recibe peticiones de roomsApi (frontend), valida el cuerpo y los identificadores y delega en los
servicios, que aplican los permisos.

Aspectos técnicos importantes:
- Los permisos (OWNER/ADMIN/MEMBER) no se comprueban aquí sino en los servicios, de modo que no
  pueden saltarse desde otra ruta.

Lugar en la arquitectura:
Capa de controladores. Expone toda la gestión de salas privadas.
*/
