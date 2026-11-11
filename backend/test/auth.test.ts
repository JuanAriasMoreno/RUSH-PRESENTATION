import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { db } from '../src/db';
import { app, as, createRoom, login, PASSWORD, registerUser } from './helpers';

describe('registration and login', () => {
  it('registers a user, hashes the password and creates the preferences row', async () => {
    const u = await registerUser('alice');
    const row = await db.selectFrom('user').selectAll().where('user_id', '=', u.userId).executeTakeFirstOrThrow();
    expect(row.password_hash).not.toBe(PASSWORD);
    expect(row.password_hash).toMatch(/^\$2[aby]\$/);
    const prefs = await db.selectFrom('user_preferences').selectAll().where('user_id', '=', u.userId).executeTakeFirstOrThrow();
    expect(prefs.interface_language).toBe('ENGLISH');
    expect(prefs.translation_target_language).toBe('KOREAN');
  });

  it('never returns the password hash', async () => {
    const u = await registerUser();
    const me = await as(u).get('/api/auth/me');
    expect(me.status).toBe(200);
    expect(JSON.stringify(me.body)).not.toMatch(/password|hash/i);
  });

  it('rejects duplicate usernames and emails', async () => {
    await registerUser('bob');
    const dupName = await request(app).post('/api/auth/register').send({ fullName: 'B', username: 'bob', email: 'other@example.test', password: PASSWORD });
    expect(dupName.status).toBe(409);
    expect(dupName.body.error.code).toBe('username_taken');
    const dupEmail = await request(app).post('/api/auth/register').send({ fullName: 'B', username: 'bob2', email: 'BOB@example.test', password: PASSWORD });
    expect(dupEmail.status).toBe(409);
    expect(dupEmail.body.error.code).toBe('email_taken');
  });

  it('validates registration input', async () => {
    const res = await request(app).post('/api/auth/register').send({ fullName: '', username: 'a b', email: 'nope', password: 'short' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('validation_error');
  });

  it('logs in with username or email and rejects a wrong password', async () => {
    const u = await registerUser('carol');
    expect(await login('carol')).toContain('rush.sid=');
    expect(await login(u.email)).toContain('rush.sid=');
    const bad = await request(app).post('/api/auth/login').send({ identifier: 'carol', password: 'wrong-password' });
    expect(bad.status).toBe(401);
    expect(bad.body.error.code).toBe('invalid_credentials');
  });

  it('logs out', async () => {
    const u = await registerUser();
    expect((await as(u).post('/api/auth/logout')).status).toBe(204);
    expect((await as(u).get('/api/auth/me')).status).toBe(401);
  });
});

describe('authentication guard', () => {
  it('protects every authenticated endpoint', async () => {
    for (const url of ['/api/auth/me', '/api/rooms', '/api/quizzes', '/api/vocabulary', '/api/topics', '/api/sessions/mine']) {
      expect((await request(app).get(url)).status, url).toBe(401);
    }
    expect((await request(app).post('/api/rooms').send({ name: 'x' })).status).toBe(401);
  });

  it('blocks cross-origin state-changing requests', async () => {
    const u = await registerUser();
    const res = await request(app).post('/api/rooms').set('Cookie', u.cookie).set('Origin', 'https://evil.example').send({ name: 'x' });
    expect(res.status).toBe(403);
  });
});

describe('profile and settings', () => {
  it('updates profile fields and preferences', async () => {
    const u = await registerUser();
    const res = await as(u).patch('/api/me/profile', {
      fullName: 'New Name', description: 'I love Korean', profilePictureUrl: 'https://example.com/me.png', learningLanguage: 'KOREAN',
    });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ fullName: 'New Name', description: 'I love Korean', learningLanguage: 'KOREAN' });
    const prefs = await as(u).patch('/api/me/preferences', { interfaceLanguage: 'KOREAN', translationTargetLanguage: 'ENGLISH' });
    expect(prefs.body.preferences).toEqual({ interfaceLanguage: 'KOREAN', translationTargetLanguage: 'ENGLISH' });
  });

  it('does not allow changing the email address', async () => {
    const u = await registerUser();
    const res = await as(u).patch('/api/me/profile', { email: 'new@example.test' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('email_immutable');
    const me = await as(u).get('/api/auth/me');
    expect(me.body.email).toBe(u.email);
  });

  it('rejects taking another user\'s username', async () => {
    const a = await registerUser('taken');
    const b = await registerUser();
    expect((await as(b).patch('/api/me/profile', { username: a.username })).status).toBe(409);
  });

  it('changes the password and logs out other sessions', async () => {
    const u = await registerUser('dave');
    const otherDevice = { cookie: await login('dave') };
    const wrong = await as(u).post('/api/me/password', { currentPassword: 'nope-nope', newPassword: 'brand-new-pass' });
    expect(wrong.status).toBe(400);
    const res = await as(u).post('/api/me/password', { currentPassword: PASSWORD, newPassword: 'brand-new-pass' });
    expect(res.status).toBe(204);
    expect((await as(otherDevice).get('/api/auth/me')).status).toBe(401);
    expect(await login('dave', 'brand-new-pass')).toContain('rush.sid=');
  });

  it('deletes the account (with password) and its owned rooms', async () => {
    const u = await registerUser();
    const roomId = await createRoom(u);
    expect((await as(u).delete('/api/me', { password: 'wrong-pass' })).status).toBe(400);
    expect((await as(u).delete('/api/me', { password: PASSWORD })).status).toBe(204);
    expect(await db.selectFrom('user').select('user_id').where('user_id', '=', u.userId).executeTakeFirst()).toBeUndefined();
    expect(await db.selectFrom('room').select('room_id').where('room_id', '=', roomId).executeTakeFirst()).toBeUndefined();
    expect((await as(u).get('/api/auth/me')).status).toBe(401);
  });
});

describe('profiles visibility', () => {
  it('shows profiles only to users who share a room, never the email', async () => {
    const a = await registerUser();
    const b = await registerUser();
    expect((await as(a).get(`/api/users/${b.username}`)).status).toBe(404);
    const roomId = await createRoom(a);
    const inv = await as(a).post(`/api/rooms/${roomId}/invitations`, {});
    await as(b).post(`/api/invitations/${inv.body.token}/accept`);
    const res = await as(a).get(`/api/users/${b.username}`);
    expect(res.status).toBe(200);
    expect(res.body.username).toBe(b.username);
    expect(res.body.email).toBeUndefined();
  });
});

describe('superadmin', () => {
  it('only a SUPERADMIN can manage predefined topics', async () => {
    const user = await registerUser();
    expect((await as(user).post('/api/admin/topics', { name: 'Grammar' })).status).toBe(403);
    const admin = await registerUser();
    await db.updateTable('user').set({ account_role: 'SUPERADMIN' }).where('user_id', '=', admin.userId).execute();
    const created = await as(admin).post('/api/admin/topics', { name: 'Grammar' });
    expect(created.status).toBe(201);
    expect((await as(admin).post('/api/admin/topics', { name: 'grammar' })).status).toBe(409); // case-insensitive
    expect((await as(admin).patch(`/api/admin/topics/${created.body.topicId}`, { name: 'Grammar basics' })).status).toBe(204);
    const list = await as(user).get('/api/topics');
    expect(list.body.map((t: { name: string }) => t.name)).toContain('Grammar basics');
    expect((await as(admin).delete(`/api/admin/topics/${created.body.topicId}`)).status).toBe(204);
  });

  it('users manage their own custom topics', async () => {
    const a = await registerUser();
    const b = await registerUser();
    const t = await as(a).post('/api/topics', { name: 'K-drama' });
    expect(t.status).toBe(201);
    expect((await as(a).post('/api/topics', { name: 'K-drama' })).status).toBe(409);
    expect((await as(b).get('/api/topics')).body).toHaveLength(0); // not visible to others
    expect((await as(b).delete(`/api/topics/${t.body.topicId}`)).status).toBe(404);
    expect((await as(a).delete(`/api/topics/${t.body.topicId}`)).status).toBe(204);
  });
});

/*
=========================================================
EXPLICACIÓN DEL ARCHIVO
=========================================================

Propósito: Pruebas de integración de autenticación, perfil, visibilidad de perfiles y administración
de temas.

Responsabilidades principales:
- Registro con hash bcrypt y fila de preferencias; rechazo de duplicados y datos inválidos.
- Inicio de sesión con usuario o correo y cierre de sesión.
- Protección de rutas sin sesión y bloqueo de peticiones de otro origen.
- Perfil, preferencias, correo inmutable, cambio de contraseña (cierra otras sesiones) y borrado de
  cuenta.
- Solo SUPERADMIN gestiona temas predefinidos; cada usuario gestiona los suyos.

Elementos importantes:
- 16 casos de prueba en bloques describe

Dependencias:
- vitest
- supertest
- test/helpers.ts
- src/db/index.ts

Flujo de datos:
Ejecuta peticiones reales contra la aplicación y comprueba respuestas y filas en MySQL.

Aspectos técnicos importantes:
- Verifica que nunca se devuelve el hash de la contraseña.

Lugar en la arquitectura:
Pruebas automatizadas. Demuestra el funcionamiento de la autenticación y la autorización.
*/
