import { Router } from 'express';
import {
  collaboratorSchema,
  moveQuestionSchema,
  questionInputSchema,
  quizInputSchema,
  quizStatusSchema,
  quizUpdateSchema,
} from '@rush/shared';
import { parse, parseId } from '../http/errors';
import { ah, currentUser, requireAuth } from '../http/middleware';
import * as questions from '../services/questions';
import * as quizzes from '../services/quizzes';

export const quizzesRouter = Router();
quizzesRouter.use(requireAuth);

quizzesRouter.get('/quizzes', ah(async (req, res) => {
  res.json(await quizzes.listLibrary(currentUser(req).userId));
}));

quizzesRouter.get('/quizzes/editable', ah(async (req, res) => {
  res.json(await quizzes.listEditableQuizzes(currentUser(req).userId));
}));

quizzesRouter.post('/quizzes', ah(async (req, res) => {
  const userId = currentUser(req).userId;
  const quizId = await quizzes.createQuiz(userId, parse(quizInputSchema, req.body));
  res.status(201).json(await quizzes.getQuizDetail(quizId, userId));
}));

quizzesRouter.get('/quizzes/:quizId', ah(async (req, res) => {
  res.json(await quizzes.getQuizDetail(parseId(req.params.quizId), currentUser(req).userId));
}));

quizzesRouter.patch('/quizzes/:quizId', ah(async (req, res) => {
  const quizId = parseId(req.params.quizId);
  const userId = currentUser(req).userId;
  await quizzes.updateQuiz(quizId, userId, parse(quizUpdateSchema, req.body));
  res.json(await quizzes.getQuizDetail(quizId, userId));
}));

quizzesRouter.post('/quizzes/:quizId/status', ah(async (req, res) => {
  const quizId = parseId(req.params.quizId);
  const userId = currentUser(req).userId;
  await quizzes.setQuizStatus(quizId, userId, parse(quizStatusSchema, req.body).status);
  res.json(await quizzes.getQuizDetail(quizId, userId));
}));

quizzesRouter.delete('/quizzes/:quizId', ah(async (req, res) => {
  await quizzes.deleteQuiz(parseId(req.params.quizId), currentUser(req).userId);
  res.status(204).end();
}));

quizzesRouter.post('/quizzes/:quizId/collaborators', ah(async (req, res) => {
  const quizId = parseId(req.params.quizId);
  const userId = currentUser(req).userId;
  await quizzes.addCollaborator(quizId, userId, parse(collaboratorSchema, req.body).username);
  res.status(201).json(await quizzes.getQuizDetail(quizId, userId));
}));

quizzesRouter.delete('/quizzes/:quizId/collaborators/:userId', ah(async (req, res) => {
  await quizzes.removeCollaborator(parseId(req.params.quizId), currentUser(req).userId, parseId(req.params.userId));
  res.status(204).end();
}));

quizzesRouter.post('/quizzes/:quizId/questions', ah(async (req, res) => {
  const input = parse(questionInputSchema, req.body);
  const questionId = await questions.createQuestion(parseId(req.params.quizId), currentUser(req).userId, input);
  res.status(201).json({ questionId });
}));

quizzesRouter.put('/questions/:questionId', ah(async (req, res) => {
  const input = parse(questionInputSchema, req.body);
  await questions.updateQuestion(parseId(req.params.questionId), currentUser(req).userId, input);
  res.status(204).end();
}));

quizzesRouter.delete('/questions/:questionId', ah(async (req, res) => {
  await questions.deleteQuestion(parseId(req.params.questionId), currentUser(req).userId);
  res.status(204).end();
}));

quizzesRouter.post('/questions/:questionId/move', ah(async (req, res) => {
  const { displayOrder } = parse(moveQuestionSchema, req.body);
  await questions.moveQuestion(parseId(req.params.questionId), currentUser(req).userId, displayOrder);
  res.status(204).end();
}));

/*
=========================================================
EXPLICACIÓN DEL ARCHIVO
=========================================================

Propósito: Define las rutas de cuestionarios y preguntas.

Responsabilidades principales:
- GET /api/quizzes (biblioteca), GET /api/quizzes/editable, POST /api/quizzes.
- GET/PATCH/DELETE /api/quizzes/:quizId y POST /api/quizzes/:quizId/status (publicar o volver a
  borrador).
- POST /api/quizzes/:quizId/collaborators y DELETE /api/quizzes/:quizId/collaborators/:userId.
- POST /api/quizzes/:quizId/questions, PUT/DELETE /api/questions/:questionId y POST
  /api/questions/:questionId/move.

Elementos importantes:
- quizzesRouter

Dependencias:
- express
- @rush/shared (questionInputSchema, quizInputSchema, etc.)
- services/quizzes.ts
- services/questions.ts
- http/middleware.ts
- http/errors.ts

Flujo de datos:
Recibe el contenido de cuestionarios y preguntas desde quizzesApi y lo valida con los mismos
esquemas compartidos que usa el frontend.

Aspectos técnicos importantes:
- El backend acepta los cinco tipos de pregunta del esquema; la restricción a opción múltiple y
  verdadero/falso de la versión de presentación está solo en la interfaz.

Lugar en la arquitectura:
Capa de controladores. Expone la creación y edición de cuestionarios.
*/
