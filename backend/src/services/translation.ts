import type { Language, TranslationDto } from '@rush/shared';
import { db, mysqlErrorCode } from '../db';
import { AppError, badRequest, notFound } from '../http/errors';
import {
  activeExplainer,
  activeTranslator,
  ProviderError,
  type Explainer,
  type Translator,
} from '../integrations/translationProviders';

const HANGUL = /[ᄀ-ᇿ㄰-㆏가-힯]/;
const LATIN_WORD = /^[A-Za-z]+(?:['’-][A-Za-z]+)*$/;
const HANGUL_WORD = /^[ᄀ-ᇿ㄰-㆏가-힯]+$/;

/** Detects EN/KO and normalises the word (trimmed; lowercase for English) as the cache key. */
export function normalizeWord(raw: string): { word: string; language: Language } {
  const w = raw.trim().normalize('NFC');
  if (HANGUL.test(w)) {
    if (!HANGUL_WORD.test(w)) throw badRequest('single_word_only', 'Select a single Korean word');
    return { word: w, language: 'KOREAN' };
  }
  if (!LATIN_WORD.test(w)) throw badRequest('unsupported_language', 'Only single English or Korean words can be translated');
  return { word: w.toLowerCase().replace(/’/g, "'"), language: 'ENGLISH' };
}

function providerToHttp(err: unknown, what: 'translation' | 'explanation'): never {
  if (err instanceof ProviderError) {
    const map = {
      not_configured: [503, `${what}_unavailable`, `The ${what} service is not configured`],
      timeout: [504, `${what}_timeout`, `The ${what} service took too long. Please try again.`],
      rate_limited: [429, `${what}_rate_limited`, `The ${what} service is busy. Please try again in a moment.`],
      unavailable: [502, `${what}_unavailable`, `The ${what} service is unavailable right now`],
      bad_response: [502, `${what}_unavailable`, `The ${what} service returned an invalid response`],
    } as const;
    const [status, code, message] = map[err.kind];
    throw new AppError(status, code, message);
  }
  throw err;
}

/** Overridable in tests. */
export const providers: { translator: () => Translator | null; explainer: () => Explainer | null } = {
  translator: activeTranslator,
  explainer: activeExplainer,
};

/** Step 1 (fast): translation from the shared cache, or Google Translate on a miss. */
export async function translateWord(userId: number, rawWord: string): Promise<TranslationDto> {
  const { word, language: source } = normalizeWord(rawWord);
  const prefs = await db.selectFrom('user_preferences').select('translation_target_language').where('user_id', '=', userId).executeTakeFirst();
  let target: Language = prefs?.translation_target_language ?? 'KOREAN';
  if (target === source) target = source === 'ENGLISH' ? 'KOREAN' : 'ENGLISH';

  const find = () =>
    db.selectFrom('translation_cache').selectAll()
      .where('source_word', '=', word).where('source_language', '=', source).where('target_language', '=', target)
      .executeTakeFirst();

  let row = await find();
  let cached = true;
  if (!row) {
    cached = false;
    const translator = providers.translator();
    if (!translator) throw new AppError(503, 'translation_unavailable', 'The translation service is not configured');
    let translated: string;
    try {
      translated = await translator.translate(word, source, target);
    } catch (err) {
      providerToHttp(err, 'translation');
    }
    try {
      await db.insertInto('translation_cache')
        .values({ source_word: word, source_language: source, target_language: target, translated_word: translated })
        .execute();
    } catch (err) {
      if (mysqlErrorCode(err) !== 'ER_DUP_ENTRY') throw err; // concurrent lookup inserted it first
    }
    row = await find();
    if (!row) throw new AppError(500, 'internal_error', 'Translation could not be stored');
  }

  const saved = await db.selectFrom('saved_word').select('saved_word_id')
    .where('user_id', '=', userId).where('translation_id', '=', row.translation_id).executeTakeFirst();
  if (saved) {
    await db.updateTable('saved_word').set({ last_looked_up_at: new Date() }).where('saved_word_id', '=', saved.saved_word_id).execute();
  }

  return {
    translationId: row.translation_id,
    sourceWord: row.source_word,
    sourceLanguage: row.source_language,
    targetLanguage: row.target_language,
    translatedWord: row.translated_word,
    contextualExplanation: row.contextual_explanation,
    cached,
    savedWordId: saved?.saved_word_id ?? null,
  };
}

/** Step 2 (slower): OpenAI contextual explanation, cached on the same translation row. */
export async function explainTranslation(translationId: number): Promise<{ translationId: number; contextualExplanation: string }> {
  const row = await db.selectFrom('translation_cache').selectAll().where('translation_id', '=', translationId).executeTakeFirst();
  if (!row) throw notFound('Translation');
  if (row.contextual_explanation) return { translationId, contextualExplanation: row.contextual_explanation };
  const explainer = providers.explainer();
  if (!explainer) throw new AppError(503, 'explanation_unavailable', 'Contextual explanations are not configured');
  let text: string;
  try {
    text = await explainer.explain(row.source_word, row.translated_word, row.source_language, row.target_language);
  } catch (err) {
    providerToHttp(err, 'explanation');
  }
  await db.updateTable('translation_cache').set({ contextual_explanation: text })
    .where('translation_id', '=', translationId).where('contextual_explanation', 'is', null).execute();
  return { translationId, contextualExplanation: text };
}

/*
=========================================================
EXPLICACIÓN DEL ARCHIVO
=========================================================

Propósito: Traduce palabras sueltas entre inglés y coreano usando una caché compartida y, en un
segundo paso, obtiene la explicación contextual.

Responsabilidades principales:
- normalizeWord: detecta coreano (caracteres Hangul) o inglés y normaliza la palabra (minúsculas en
  inglés).
- translateWord: busca en translation_cache; si no existe, llama al traductor y guarda el resultado;
  actualiza last_looked_up_at si el usuario ya la tenía guardada.
- explainTranslation: devuelve la explicación guardada o la pide al proveedor y la guarda.
- providerToHttp: convierte errores del proveedor en 503, 504, 429 o 502.

Elementos importantes:
- normalizeWord
- providers (sustituible en pruebas)
- translateWord
- explainTranslation

Dependencias:
- db/index.ts
- http/errors.ts
- integrations/translationProviders.ts
- @rush/shared

Flujo de datos:
Recibe la palabra desde POST /api/translate; lee y escribe translation_cache; consulta saved_word.

Aspectos técnicos importantes:
- El idioma destino es la preferencia translation_target_language; si coincide con el origen se usa
  el otro idioma.
- Los errores de traducción no se guardan en la caché.

Lugar en la arquitectura:
Capa de servicios. Implementa la traducción en dos pasos (primero rápida, luego explicación).
*/
