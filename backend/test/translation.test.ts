import { afterEach, describe, expect, it } from 'vitest';
import { db } from '../src/db';
import { ProviderError, type Explainer, type Translator } from '../src/integrations/translationProviders';
import { providers } from '../src/services/translation';
import { as, registerUser } from './helpers';

const original = { ...providers };
afterEach(() => {
  providers.translator = original.translator;
  providers.explainer = original.explainer;
});

function countingTranslator(result = 'translated'): Translator & { calls: string[] } {
  const calls: string[] = [];
  return { name: 'fake', calls, async translate(word) { calls.push(word); return `${result}:${word}`; } };
}

describe('translation', () => {
  it('translates once, then serves every user from the shared cache', async () => {
    const t = countingTranslator('안녕');
    providers.translator = () => t;
    const a = await registerUser();
    const b = await registerUser();
    const first = await as(a).post('/api/translate', { word: 'Hello' });
    expect(first.status).toBe(200);
    expect(first.body).toMatchObject({ sourceWord: 'hello', sourceLanguage: 'ENGLISH', targetLanguage: 'KOREAN', translatedWord: '안녕:hello', cached: false });
    const second = await as(b).post('/api/translate', { word: 'hello' });
    expect(second.body).toMatchObject({ translationId: first.body.translationId, cached: true });
    expect(t.calls).toEqual(['hello']);
    const { n } = await db.selectFrom('translation_cache').select((eb) => eb.fn.countAll<number>().as('n')).executeTakeFirstOrThrow();
    expect(Number(n)).toBe(1);
  });

  it('detects Korean and uses the other language as target', async () => {
    providers.translator = () => countingTranslator('love');
    const u = await registerUser(); // default target KOREAN
    const res = await as(u).post('/api/translate', { word: '사랑' });
    expect(res.body).toMatchObject({ sourceLanguage: 'KOREAN', targetLanguage: 'ENGLISH' });
  });

  it('respects the translation-target preference', async () => {
    providers.translator = () => countingTranslator();
    const u = await registerUser();
    await as(u).patch('/api/me/preferences', { translationTargetLanguage: 'ENGLISH' });
    expect((await as(u).post('/api/translate', { word: '물' })).body.targetLanguage).toBe('ENGLISH');
    // English source with target ENGLISH flips to KOREAN (direction must differ)
    expect((await as(u).post('/api/translate', { word: 'water' })).body.targetLanguage).toBe('KOREAN');
  });

  it('accepts only single words', async () => {
    const u = await registerUser();
    for (const word of ['two words', 'こんにちは', '123', '']) {
      expect((await as(u).post('/api/translate', { word })).status, word).toBe(400);
    }
  });

  it('maps provider failures to clear errors without caching', async () => {
    const u = await registerUser();
    const failing = (kind: ProviderError['kind']): Translator => ({ name: 'x', async translate() { throw new ProviderError(kind, kind); } });
    providers.translator = () => failing('timeout');
    expect((await as(u).post('/api/translate', { word: 'slow' })).status).toBe(504);
    providers.translator = () => failing('rate_limited');
    expect((await as(u).post('/api/translate', { word: 'busy' })).status).toBe(429);
    providers.translator = () => failing('unavailable');
    expect((await as(u).post('/api/translate', { word: 'down' })).status).toBe(502);
    providers.translator = () => null;
    const off = await as(u).post('/api/translate', { word: 'off' });
    expect(off.status).toBe(503);
    expect(off.body.error.code).toBe('translation_unavailable');
    expect(await db.selectFrom('translation_cache').select('translation_id').execute()).toHaveLength(0);
  });

  it('loads the contextual explanation separately and caches it', async () => {
    providers.translator = () => countingTranslator();
    let calls = 0;
    const explainer: Explainer = { async explain(word) { calls += 1; return `About ${word}`; } };
    providers.explainer = () => explainer;
    const u = await registerUser();
    const t = await as(u).post('/api/translate', { word: 'tree' });
    expect(t.body.contextualExplanation).toBeNull();
    const e1 = await as(u).get(`/api/translate/${t.body.translationId}/explanation`);
    expect(e1.body.contextualExplanation).toBe('About tree');
    await as(u).get(`/api/translate/${t.body.translationId}/explanation`);
    expect(calls).toBe(1);
    expect((await as(u).post('/api/translate', { word: 'tree' })).body.contextualExplanation).toBe('About tree');
  });

  it('explanation failures do not break the translation', async () => {
    providers.translator = () => countingTranslator();
    providers.explainer = () => ({ async explain() { throw new ProviderError('timeout', 't'); } });
    const u = await registerUser();
    const t = await as(u).post('/api/translate', { word: 'sky' });
    expect(t.status).toBe(200);
    expect((await as(u).get(`/api/translate/${t.body.translationId}/explanation`)).status).toBe(504);
  });
});

describe('vocabulary', () => {
  async function savedWord(u: Awaited<ReturnType<typeof registerUser>>, word: string, note?: string) {
    const t = await as(u).post('/api/translate', { word });
    const s = await as(u).post('/api/vocabulary', { translationId: t.body.translationId, personalNote: note });
    expect(s.status).toBe(201);
    return s.body;
  }

  it('saves, searches, favourites, annotates, exports and deletes words', async () => {
    providers.translator = () => countingTranslator('ko');
    const u = await registerUser();
    const other = await registerUser();
    const apple = await savedWord(u, 'apple', 'fruit');
    await savedWord(u, 'banana');
    expect((await as(u).post('/api/vocabulary', { translationId: apple.translationId })).status).toBe(409);

    expect((await as(u).get('/api/vocabulary')).body).toHaveLength(2);
    expect((await as(u).get('/api/vocabulary?q=app')).body.map((w: { sourceWord: string }) => w.sourceWord)).toEqual(['apple']);
    expect((await as(u).get('/api/vocabulary?q=fruit')).body).toHaveLength(1); // searches notes too
    expect((await as(u).get('/api/vocabulary?q=%25')).body).toHaveLength(0); // LIKE wildcards are escaped

    const fav = await as(u).patch(`/api/vocabulary/${apple.savedWordId}`, { isFavorite: true, personalNote: 'red fruit' });
    expect(fav.body).toMatchObject({ isFavorite: true, personalNote: 'red fruit' });
    expect((await as(u).get('/api/vocabulary?favorites=1')).body).toHaveLength(1);

    // other users cannot see or change it
    expect((await as(other).get('/api/vocabulary')).body).toHaveLength(0);
    expect((await as(other).patch(`/api/vocabulary/${apple.savedWordId}`, { isFavorite: false })).status).toBe(404);
    expect((await as(other).delete(`/api/vocabulary/${apple.savedWordId}`)).status).toBe(404);

    const csv = await as(u).get('/api/vocabulary/export?format=csv');
    expect(csv.headers['content-type']).toContain('text/csv');
    expect(csv.text).toContain('"apple"');
    expect(csv.text).toContain('"red fruit"');
    const json = await as(u).get('/api/vocabulary/export?format=json');
    expect(JSON.parse(json.text)).toHaveLength(2);

    expect((await as(u).delete(`/api/vocabulary/${apple.savedWordId}`)).status).toBe(204);
    expect((await as(u).get('/api/vocabulary')).body).toHaveLength(1);
    // the shared translation stays cached
    expect(await db.selectFrom('translation_cache').select('translation_id').where('translation_id', '=', apple.translationId).executeTakeFirst()).toBeDefined();
  });

  it('marks already-saved words on lookup and refreshes last_looked_up_at', async () => {
    providers.translator = () => countingTranslator();
    const u = await registerUser();
    const w = await savedWord(u, 'moon');
    await db.updateTable('saved_word').set({ last_looked_up_at: new Date('2020-01-01T00:00:00Z') }).where('saved_word_id', '=', w.savedWordId).execute();
    const again = await as(u).post('/api/translate', { word: 'moon' });
    expect(again.body.savedWordId).toBe(w.savedWordId);
    const row = await db.selectFrom('saved_word').select('last_looked_up_at').where('saved_word_id', '=', w.savedWordId).executeTakeFirstOrThrow();
    expect(row.last_looked_up_at.getUTCFullYear()).toBeGreaterThan(2020);
  });

  it('neutralises spreadsheet formulas in CSV export', async () => {
    providers.translator = () => ({ name: 'x', async translate() { return '=HYPERLINK("x")'; } });
    const u = await registerUser();
    await savedWord(u, 'evil');
    const csv = await as(u).get('/api/vocabulary/export?format=csv');
    expect(csv.text).toContain(`"'=HYPERLINK(""x"")"`);
  });
});

/*
=========================================================
EXPLICACIÓN DEL ARCHIVO
=========================================================

Propósito: Pruebas de traducción, caché y vocabulario.

Responsabilidades principales:
- La primera búsqueda llama al proveedor y las siguientes usan la caché compartida.
- Detección de coreano y preferencia de idioma destino.
- Errores del proveedor (504, 429, 502, 503) sin guardar en caché.
- Explicación en un segundo paso y cacheada.
- Vocabulario: guardar, buscar, favoritos, notas, exportar y borrar; protección de fórmulas en CSV.

Elementos importantes:
- 10 casos de prueba
- countingTranslator (proveedor falso que cuenta llamadas)

Dependencias:
- vitest
- test/helpers.ts
- src/services/translation.ts
- src/integrations/translationProviders.ts

Flujo de datos:
Sustituye los proveedores reales por proveedores falsos.

Aspectos técnicos importantes:
- No se llama a APIs externas durante las pruebas.

Lugar en la arquitectura:
Pruebas automatizadas. Valida la traducción y el vocabulario.
*/
