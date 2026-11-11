import { Router } from 'express';
import multer from 'multer';
import { LIMITS, saveWordSchema, topicInputSchema, translateSchema, updateSavedWordSchema } from '@rush/shared';
import { AppError, badRequest, notFound, parse, parseId } from '../http/errors';
import { ah, currentUser, invitationLimiter, requireAuth, requireSuperadmin, translationLimiter, uploadLimiter } from '../http/middleware';
import { isWithin720p, readMp4Resolution } from '../integrations/mp4';
import { ALLOWED_MIME, storeFile } from '../integrations/storage';
import { engine } from '../realtime/socket';
import { SessionError } from '../realtime/sessionEngine';
import * as invitations from '../services/invitations';
import { getMembershipRole, isManager } from '../services/permissions';
import * as sessions from '../services/sessions';
import * as topics from '../services/topics';
import * as translation from '../services/translation';
import * as vocabulary from '../services/vocabulary';

export const miscRouter = Router();
miscRouter.use(requireAuth);

// ---------------------------------------------------------------- invitations (join flow)
miscRouter.get('/invitations/:token', invitationLimiter, ah(async (req, res) => {
  res.json(await invitations.previewInvitation(String(req.params.token), currentUser(req).userId));
}));
miscRouter.post('/invitations/:token/accept', invitationLimiter, ah(async (req, res) => {
  res.json(await invitations.acceptInvitation(String(req.params.token), currentUser(req).userId));
}));

// ---------------------------------------------------------------- topics
miscRouter.get('/topics', ah(async (req, res) => {
  res.json(await topics.listAssignableTopics(currentUser(req).userId));
}));
miscRouter.post('/topics', ah(async (req, res) => {
  res.status(201).json(await topics.createCustomTopic(currentUser(req).userId, parse(topicInputSchema, req.body).name));
}));
miscRouter.delete('/topics/:topicId', ah(async (req, res) => {
  await topics.deleteCustomTopic(currentUser(req).userId, parseId(req.params.topicId));
  res.status(204).end();
}));

// ---------------------------------------------------------------- platform administration (SUPERADMIN)
miscRouter.get('/admin/topics', requireSuperadmin, ah(async (_req, res) => {
  res.json(await topics.listPredefinedTopics());
}));
miscRouter.post('/admin/topics', requireSuperadmin, ah(async (req, res) => {
  res.status(201).json(await topics.createPredefinedTopic(parse(topicInputSchema, req.body).name));
}));
miscRouter.patch('/admin/topics/:topicId', requireSuperadmin, ah(async (req, res) => {
  await topics.renamePredefinedTopic(parseId(req.params.topicId), parse(topicInputSchema, req.body).name);
  res.status(204).end();
}));
miscRouter.delete('/admin/topics/:topicId', requireSuperadmin, ah(async (req, res) => {
  await topics.deletePredefinedTopic(parseId(req.params.topicId));
  res.status(204).end();
}));

// ---------------------------------------------------------------- sessions (history / control)
miscRouter.get('/sessions/mine', ah(async (req, res) => {
  res.json(await sessions.listMySessions(currentUser(req).userId));
}));
miscRouter.get('/sessions/:sessionId', ah(async (req, res) => {
  const userId = currentUser(req).userId;
  const s = await sessions.getSessionRow(parseId(req.params.sessionId));
  if (!s) throw notFound('Session');
  const role = await getMembershipRole(s.room_id, userId);
  if (!role) throw notFound('Session');
  res.json({
    sessionId: s.session_id,
    roomId: s.room_id,
    roomName: s.room_name,
    quizId: s.quiz_id,
    quizTitle: s.title,
    status: s.session_status,
    hostUserId: s.host_user_id,
    canControl: isManager(role),
  });
}));
miscRouter.get('/sessions/:sessionId/results', ah(async (req, res) => {
  res.json(await sessions.getSessionResult(parseId(req.params.sessionId), currentUser(req).userId));
}));
miscRouter.post('/sessions/:sessionId/cancel', ah(async (req, res) => {
  try {
    await engine.cancel(parseId(req.params.sessionId), currentUser(req).userId);
  } catch (err) {
    if (err instanceof SessionError) {
      const status = err.code === 'forbidden' ? 403 : err.code === 'not_found' ? 404 : 409;
      throw new AppError(status, err.code, err.message);
    }
    throw err;
  }
  res.status(204).end();
}));

// ---------------------------------------------------------------- translation & vocabulary
miscRouter.post('/translate', translationLimiter, ah(async (req, res) => {
  res.json(await translation.translateWord(currentUser(req).userId, parse(translateSchema, req.body).word));
}));
miscRouter.get('/translate/:translationId/explanation', translationLimiter, ah(async (req, res) => {
  res.json(await translation.explainTranslation(parseId(req.params.translationId)));
}));

miscRouter.get('/vocabulary', ah(async (req, res) => {
  const q = typeof req.query.q === 'string' ? req.query.q : undefined;
  res.json(await vocabulary.listSavedWords(currentUser(req).userId, { q, favorites: req.query.favorites === '1' }));
}));
miscRouter.get('/vocabulary/export', ah(async (req, res) => {
  const format = req.query.format === 'json' ? 'json' : 'csv';
  const file = await vocabulary.exportSavedWords(currentUser(req).userId, format);
  res.setHeader('Content-Type', file.contentType);
  res.setHeader('Content-Disposition', `attachment; filename="${file.filename}"`);
  res.send(file.body);
}));
miscRouter.post('/vocabulary', ah(async (req, res) => {
  const { translationId, personalNote } = parse(saveWordSchema, req.body);
  res.status(201).json(await vocabulary.saveWord(currentUser(req).userId, translationId, personalNote));
}));
miscRouter.patch('/vocabulary/:savedWordId', ah(async (req, res) => {
  res.json(await vocabulary.updateSavedWord(currentUser(req).userId, parseId(req.params.savedWordId), parse(updateSavedWordSchema, req.body)));
}));
miscRouter.delete('/vocabulary/:savedWordId', ah(async (req, res) => {
  await vocabulary.deleteSavedWord(currentUser(req).userId, parseId(req.params.savedWordId));
  res.status(204).end();
}));

// ---------------------------------------------------------------- media upload
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: LIMITS.maxVideoBytes, files: 1 } });

function sniffOk(buf: Buffer, mime: string): boolean {
  const ascii = (s: number, e: number) => buf.toString('latin1', s, e);
  switch (mime) {
    case 'image/jpeg': return buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff;
    case 'image/png': return buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
    case 'image/gif': return ascii(0, 4) === 'GIF8';
    case 'image/webp': return ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP';
    case 'video/mp4': case 'audio/mp4': return ascii(4, 8) === 'ftyp';
    case 'audio/ogg': return ascii(0, 4) === 'OggS';
    case 'audio/wav': case 'audio/x-wav': return ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WAVE';
    case 'audio/mpeg': return ascii(0, 3) === 'ID3' || (buf[0] === 0xff && (buf[1]! & 0xe0) === 0xe0);
    case 'audio/webm': return buf.readUInt32BE(0) === 0x1a45dfa3;
    default: return false;
  }
}

miscRouter.post('/media', uploadLimiter, upload.single('file'), ah(async (req, res) => {
  const file = req.file;
  if (!file) throw badRequest('file_required', 'Choose a file to upload');
  if (!ALLOWED_MIME.has(file.mimetype)) throw badRequest('unsupported_type', 'Unsupported file type');
  if (!sniffOk(file.buffer, file.mimetype)) throw badRequest('invalid_file', 'The file content does not match its type');
  const mediaType = file.mimetype.startsWith('image/') ? 'IMAGE' : file.mimetype.startsWith('audio/') ? 'AUDIO' : 'VIDEO';
  const maxBytes = mediaType === 'IMAGE' ? LIMITS.maxImageBytes : mediaType === 'AUDIO' ? LIMITS.maxAudioBytes : LIMITS.maxVideoBytes;
  if (file.size > maxBytes) throw badRequest('too_large', `The file is larger than ${Math.round(maxBytes / 1024 / 1024)} MB`);
  if (mediaType === 'VIDEO') {
    const resolution = readMp4Resolution(file.buffer);
    if (!resolution) throw badRequest('invalid_video', 'The video resolution could not be read (MP4 required)');
    if (!isWithin720p(resolution)) {
      throw badRequest('video_too_large', `Videos must not exceed 720p (got ${resolution.width}×${resolution.height})`);
    }
  }
  const stored = await storeFile(file.buffer, file.mimetype);
  res.status(201).json({ mediaType, mediaUrl: stored.url });
}));

/*
=========================================================
EXPLICACIÓN DEL ARCHIVO
=========================================================

Propósito: Agrupa el resto de rutas: aceptar invitaciones, temas, administración, historial y
resultados de sesiones, traducción, vocabulario y subida de archivos.

Responsabilidades principales:
- GET /api/invitations/:token y POST /api/invitations/:token/accept.
- GET/POST /api/topics, DELETE /api/topics/:topicId y /api/admin/topics (solo SUPERADMIN).
- GET /api/sessions/mine, /api/sessions/:sessionId, /api/sessions/:sessionId/results y POST
  /api/sessions/:sessionId/cancel.
- POST /api/translate y GET /api/translate/:translationId/explanation.
- GET/POST /api/vocabulary, GET /api/vocabulary/export, PATCH/DELETE /api/vocabulary/:savedWordId.
- POST /api/media: recibe el archivo con multer, comprueba tipo, firma binaria, tamaño y (si es
  video) la resolución, y lo guarda.

Elementos importantes:
- miscRouter
- upload (multer en memoria, límite 50 MB)
- sniffOk(buffer, mime): comprueba la firma binaria del archivo

Dependencias:
- express
- multer
- @rush/shared
- integrations/storage.ts
- integrations/mp4.ts
- realtime/socket.ts (engine)
- services/invitations, topics, sessions, translation, vocabulary, permissions

Flujo de datos:
Recibe JSON o archivos multipart; devuelve JSON, o un archivo CSV/JSON en la exportación de
vocabulario.

Aspectos técnicos importantes:
- La subida comprueba que el contenido coincida con el tipo declarado (por ejemplo, que un PNG
  empiece por la firma PNG).
- Límites: imagen 5 MB, audio 10 MB, video 50 MB.
- La exportación de vocabulario sigue existiendo en el backend aunque la versión de presentación no
  muestre el botón.

Lugar en la arquitectura:
Capa de controladores. Reúne varias funciones transversales, incluida la subida de imágenes usada en
la presentación.
*/
