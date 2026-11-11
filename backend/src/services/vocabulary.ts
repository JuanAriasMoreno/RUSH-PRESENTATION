import type { SavedWordDto } from '@rush/shared';
import type { updateSavedWordSchema } from '@rush/shared';
import type { z } from 'zod';
import { db, mysqlErrorCode } from '../db';
import { conflict, notFound } from '../http/errors';

function baseQuery(userId: number) {
  return db
    .selectFrom('saved_word as s')
    .innerJoin('translation_cache as t', 't.translation_id', 's.translation_id')
    .select([
      's.saved_word_id', 's.translation_id', 's.personal_note', 's.is_favorite', 's.saved_at', 's.last_looked_up_at',
      't.source_word', 't.source_language', 't.target_language', 't.translated_word', 't.contextual_explanation',
    ])
    .where('s.user_id', '=', userId);
}
type Row = Awaited<ReturnType<ReturnType<typeof baseQuery>['executeTakeFirstOrThrow']>>;

const toDto = (r: Row): SavedWordDto => ({
  savedWordId: r.saved_word_id,
  translationId: r.translation_id,
  sourceWord: r.source_word,
  sourceLanguage: r.source_language,
  targetLanguage: r.target_language,
  translatedWord: r.translated_word,
  contextualExplanation: r.contextual_explanation,
  personalNote: r.personal_note,
  isFavorite: r.is_favorite,
  savedAt: r.saved_at.toISOString(),
  lastLookedUpAt: r.last_looked_up_at.toISOString(),
});

const escapeLike = (s: string) => s.replace(/[\\%_]/g, (c) => `\\${c}`);

export async function listSavedWords(userId: number, opts: { q?: string; favorites?: boolean } = {}): Promise<SavedWordDto[]> {
  let query = baseQuery(userId);
  if (opts.q && opts.q.trim()) {
    const like = `%${escapeLike(opts.q.trim().slice(0, 100))}%`;
    query = query.where((eb) =>
      eb.or([eb('t.source_word', 'like', like), eb('t.translated_word', 'like', like), eb('s.personal_note', 'like', like)]),
    );
  }
  if (opts.favorites) query = query.where('s.is_favorite', '=', true);
  const rows = await query.orderBy('s.last_looked_up_at', 'desc').limit(1000).execute();
  return rows.map(toDto);
}

export async function saveWord(userId: number, translationId: number, personalNote?: string): Promise<SavedWordDto> {
  const t = await db.selectFrom('translation_cache').select('translation_id').where('translation_id', '=', translationId).executeTakeFirst();
  if (!t) throw notFound('Translation');
  try {
    const res = await db.insertInto('saved_word')
      .values({ user_id: userId, translation_id: translationId, personal_note: personalNote || null })
      .executeTakeFirstOrThrow();
    return toDto(await baseQuery(userId).where('s.saved_word_id', '=', Number(res.insertId)).executeTakeFirstOrThrow());
  } catch (err) {
    if (mysqlErrorCode(err) === 'ER_DUP_ENTRY') throw conflict('already_saved', 'This word is already in your vocabulary');
    throw err;
  }
}

export async function updateSavedWord(userId: number, savedWordId: number, input: z.infer<typeof updateSavedWordSchema>): Promise<SavedWordDto> {
  const values = {
    ...(input.personalNote !== undefined && { personal_note: input.personalNote }),
    ...(input.isFavorite !== undefined && { is_favorite: input.isFavorite }),
  };
  const existing = await baseQuery(userId).where('s.saved_word_id', '=', savedWordId).executeTakeFirst();
  if (!existing) throw notFound('Saved word');
  if (Object.keys(values).length > 0) {
    await db.updateTable('saved_word').set(values).where('saved_word_id', '=', savedWordId).where('user_id', '=', userId).execute();
  }
  return toDto(await baseQuery(userId).where('s.saved_word_id', '=', savedWordId).executeTakeFirstOrThrow());
}

export async function deleteSavedWord(userId: number, savedWordId: number): Promise<void> {
  const res = await db.deleteFrom('saved_word').where('saved_word_id', '=', savedWordId).where('user_id', '=', userId).executeTakeFirst();
  if (Number(res.numDeletedRows) === 0) throw notFound('Saved word');
}

/** CSV cell: quoted, and spreadsheet formula prefixes neutralised. */
function csvCell(value: string | boolean | null): string {
  let s = value === null ? '' : String(value);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return `"${s.replace(/"/g, '""')}"`;
}

export async function exportSavedWords(userId: number, format: 'csv' | 'json'): Promise<{ body: string; contentType: string; filename: string }> {
  const words = await listSavedWords(userId);
  if (format === 'json') {
    return { body: JSON.stringify(words, null, 2), contentType: 'application/json; charset=utf-8', filename: 'rush-vocabulary.json' };
  }
  const header = ['word', 'source_language', 'translation', 'target_language', 'explanation', 'note', 'favorite', 'saved_at'];
  const lines = words.map((w) =>
    [w.sourceWord, w.sourceLanguage, w.translatedWord, w.targetLanguage, w.contextualExplanation, w.personalNote, w.isFavorite, w.savedAt]
      .map(csvCell)
      .join(','),
  );
  // BOM so spreadsheet apps detect UTF-8 (Korean text)
  return { body: `﻿${header.join(',')}\r\n${lines.join('\r\n')}\r\n`, contentType: 'text/csv; charset=utf-8', filename: 'rush-vocabulary.csv' };
}

/*
=========================================================
EXPLICACIÓN DEL ARCHIVO
=========================================================

Propósito: Gestiona el vocabulario personal: palabras guardadas, notas, favoritos, búsqueda,
exportación y borrado.

Responsabilidades principales:
- listSavedWords: búsqueda con LIKE en palabra, traducción y nota, y filtro de favoritos.
- saveWord, updateSavedWord y deleteSavedWord (solo sobre filas del propio usuario).
- exportSavedWords: genera CSV (con BOM UTF-8 y protección contra fórmulas de hoja de cálculo) o
  JSON.

Elementos importantes:
- listSavedWords
- saveWord
- updateSavedWord
- deleteSavedWord
- exportSavedWords
- csvCell, escapeLike (internas)

Dependencias:
- db/index.ts
- http/errors.ts
- @rush/shared

Flujo de datos:
Lee y escribe saved_word unida con translation_cache.

Aspectos técnicos importantes:
- Los comodines % y _ de la búsqueda se escapan para que se busquen literalmente.

Lugar en la arquitectura:
Capa de servicios. Implementa el vocabulario personal (la exportación existe en el backend aunque la
presentación oculte el botón).
*/
