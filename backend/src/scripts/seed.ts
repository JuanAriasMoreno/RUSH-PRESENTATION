/**
 * npm run db:seed — adds demo data for local development (only when the users do not exist yet).
 * Accounts (password for all: rush-demo-1234):
 *   admin  (SUPERADMIN)   ana (room owner)   ben (room admin)   cho (member)
 */
import { closeDb, db } from '../db';
import { createQuestion } from '../services/questions';
import { createQuiz, setQuizStatus } from '../services/quizzes';
import { addQuizToRoom, createRoom, setMemberRole } from '../services/rooms';
import { createPredefinedTopic } from '../services/topics';
import { register } from '../services/users';
import { transaction } from '../db';
import { addMemberLocked } from '../services/rooms';

const PASSWORD = '12345678';

async function main() {
  const existing = await db.selectFrom('user').select('user_id').where('username', 'in', ['admin', 'ana', 'ben', 'cho']).execute();
  if (existing.length > 0) {
    console.log('Demo users already exist — nothing was changed.');
    return;
  }
  const ids: Record<string, number> = {};
  for (const [username, fullName] of [['admin', 'Platform Admin'], ['ana', 'Ana Kim'], ['ben', 'Ben Lee'], ['cho', 'Cho Park']] as const) {
    ids[username] = await register({ username, fullName, email: `${username}@rush.local`, password: PASSWORD });
  }
  await db.updateTable('user').set({ account_role: 'SUPERADMIN' }).where('user_id', '=', ids.admin!).execute();
  await db.updateTable('user').set({ learning_language: 'KOREAN' }).where('user_id', 'in', [ids.ana!, ids.ben!]).execute();

  const topicIds: number[] = [];
  for (const name of ['Grammar', 'Vocabulary', 'Pronunciation', 'K-pop', 'Travel']) {
    const existingTopic = await db.selectFrom('topic').select('topic_id').where('topic_type', '=', 'PREDEFINED').where('name', '=', name).executeTakeFirst();
    topicIds.push(existingTopic?.topic_id ?? (await createPredefinedTopic(name)).topicId);
  }

  const roomId = await createRoom(ids.ana!, {
    name: 'Korean 101',
    description: 'Weekly beginner Korean practice with friends.',
    coverImageUrl: null,
    topicIds: topicIds.slice(0, 2),
  });
  for (const u of ['ben', 'cho']) await transaction((tx) => addMemberLocked(tx, roomId, ids[u]!));
  await setMemberRole(roomId, ids.ana!, ids.ben!, 'ADMIN');

  const quizId = await createQuiz(ids.ana!, { title: 'Everyday greetings', description: 'Basic Korean greetings and expressions.', totalTimeLimitSeconds: 180 });
  const questions = [
    { questionType: 'MULTIPLE_CHOICE' as const, questionText: 'How do you say "hello" in Korean?', pointValue: 100, media: null,
      options: [{ text: '안녕하세요', isCorrect: true }, { text: '감사합니다', isCorrect: false }, { text: '죄송합니다', isCorrect: false }, { text: '안녕히 가세요', isCorrect: false }] },
    { questionType: 'TRUE_FALSE' as const, questionText: '"감사합니다" means "thank you".', pointValue: 100, media: null, correctAnswer: true },
    { questionType: 'OPEN_ANSWER' as const, questionText: 'Write the Korean word for "water".', pointValue: 150, media: null, correctTextAnswer: '물' },
    { questionType: 'FILL_IN_THE_BLANK' as const, questionText: 'I ___ a student.', pointValue: 100, media: null, correctTextAnswer: 'am' },
    { questionType: 'MATCHING' as const, questionText: 'Match the words with their meaning.', pointValue: 200, media: null,
      pairs: [{ left: '고양이', right: 'cat' }, { left: '개', right: 'dog' }, { left: '새', right: 'bird' }] },
  ];
  for (const q of questions) await createQuestion(quizId, ids.ana!, q);
  await setQuizStatus(quizId, ids.ana!, 'PUBLISHED');
  await addQuizToRoom(roomId, ids.ana!, quizId);

  console.log(`Seeded demo data. Log in as admin, ana, ben or cho with password "${PASSWORD}".`);
}

main()
  .catch((err) => {
    console.error('Seeding failed:', err);
    process.exitCode = 1;
  })
  .finally(() => closeDb());

/*
=========================================================
EXPLICACIÓN DEL ARCHIVO
=========================================================

Propósito: Inserta datos de demostración (npm run db:seed): cuatro usuarios, temas predefinidos, una
sala y un cuestionario publicado.

Responsabilidades principales:
- Crear admin (SUPERADMIN), ana, ben y cho usando los mismos servicios que la aplicación.
- Crear cinco temas predefinidos, la sala "Korean 101" y nombrar administrador a ben.
- Crear el cuestionario "Everyday greetings" con una pregunta de cada uno de los cinco tipos y
  publicarlo.

Elementos importantes:
- main()
- PASSWORD (contraseña de demostración documentada)

Dependencias:
- services/users, rooms, quizzes, questions, topics
- db/index.ts

Flujo de datos:
Escribe en DB_NAME solo si los usuarios de demostración no existen.

Aspectos técnicos importantes:
- El cuestionario de demostración contiene tipos de pregunta que la versión de presentación no
  permite crear (se conservan y se pueden jugar).

Lugar en la arquitectura:
Herramienta de desarrollo. Facilita disponer de datos para probar o demostrar la aplicación.
*/
