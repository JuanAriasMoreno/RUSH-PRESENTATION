import type { Language } from '@rush/shared';
import { env } from '../config/env';

/**
 * External translation services.
 * - Google Cloud Translation API, Basic edition (v2): POST https://translation.googleapis.com/language/translate/v2
 *   https://cloud.google.com/translate/docs/reference/rest/v2/translate
 * - OpenAI Chat Completions: POST https://api.openai.com/v1/chat/completions
 *   https://platform.openai.com/docs/api-reference/chat/create
 * API keys are read from the environment on the server only.
 */

export class ProviderError extends Error {
  constructor(
    public kind: 'not_configured' | 'timeout' | 'rate_limited' | 'unavailable' | 'bad_response',
    message: string,
  ) {
    super(message);
  }
}

const ISO: Record<Language, string> = { ENGLISH: 'en', KOREAN: 'ko' };

async function fetchJson(url: string, init: RequestInit): Promise<unknown> {
  let res: Response;
  try {
    res = await fetch(url, { ...init, signal: AbortSignal.timeout(env.EXTERNAL_API_TIMEOUT_MS) });
  } catch (err) {
    const name = err instanceof Error ? err.name : '';
    if (name === 'TimeoutError' || name === 'AbortError') throw new ProviderError('timeout', 'The service did not respond in time');
    throw new ProviderError('unavailable', 'The service could not be reached');
  }
  if (res.status === 429) throw new ProviderError('rate_limited', 'The service rate limit was reached');
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    console.error(`[translation] ${new URL(url).host} responded ${res.status}: ${body.slice(0, 300)}`);
    throw new ProviderError('unavailable', `The service responded with status ${res.status}`);
  }
  try {
    return await res.json();
  } catch {
    throw new ProviderError('bad_response', 'Invalid response from the service');
  }
}

export interface Translator {
  name: string;
  translate(word: string, source: Language, target: Language): Promise<string>;
}

export const googleTranslator: Translator = {
  name: 'google',
  async translate(word, source, target) {
    if (!env.GOOGLE_TRANSLATE_API_KEY) throw new ProviderError('not_configured', 'Google Translate is not configured');
    // Documented as query parameters of POST .../language/translate/v2
    const params = new URLSearchParams({ key: env.GOOGLE_TRANSLATE_API_KEY, q: word, source: ISO[source], target: ISO[target], format: 'text' });
    const url = `https://translation.googleapis.com/language/translate/v2?${params.toString()}`;
    const data = (await fetchJson(url, { method: 'POST' })) as { data?: { translations?: { translatedText?: string }[] } };
    const text = data?.data?.translations?.[0]?.translatedText?.trim();
    if (!text) throw new ProviderError('bad_response', 'Empty translation');
    return text.slice(0, 255);
  },
};

/** Development fallback (TRANSLATION_PROVIDER=mock): clearly marked, never mistaken for a real translation. */
export const mockTranslator: Translator = {
  name: 'mock',
  async translate(word, _source, target) {
    return `[mock ${ISO[target]}] ${word}`;
  },
};

export function activeTranslator(): Translator | null {
  if (env.TRANSLATION_PROVIDER === 'mock') return mockTranslator;
  if (env.TRANSLATION_PROVIDER === 'google' && env.GOOGLE_TRANSLATE_API_KEY) return googleTranslator;
  return null;
}

export interface Explainer {
  explain(word: string, translated: string, source: Language, target: Language): Promise<string>;
}

export const openAiExplainer: Explainer = {
  async explain(word, translated, source, target) {
    if (!env.OPENAI_API_KEY) throw new ProviderError('not_configured', 'OpenAI is not configured');
    const outLang = target === 'KOREAN' ? 'Korean' : 'English';
    const srcLang = source === 'KOREAN' ? 'Korean' : 'English';
    const data = (await fetchJson('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${env.OPENAI_API_KEY}` },
      body: JSON.stringify({
        model: env.OPENAI_MODEL,
        max_completion_tokens: 300,
        messages: [
          {
            role: 'system',
            content:
              'You help language learners. Explain a single word briefly (max 80 words): its meaning, ' +
              'common usage context or nuance, and one short example sentence with its translation. Plain text only.',
          },
          {
            role: 'user',
            content: `${srcLang} word: "${word}" (translated as "${translated}"). Write the explanation in ${outLang}.`,
          },
        ],
      }),
    })) as { choices?: { message?: { content?: string } }[] };
    const text = data?.choices?.[0]?.message?.content?.trim();
    if (!text) throw new ProviderError('bad_response', 'Empty explanation');
    return text.slice(0, 4000);
  },
};

export const mockExplainer: Explainer = {
  async explain(word) {
    return `[mock explanation] "${word}" — configure OPENAI_API_KEY for real contextual explanations.`;
  },
};

export function activeExplainer(): Explainer | null {
  if (env.OPENAI_API_KEY && env.TRANSLATION_PROVIDER !== 'mock') return openAiExplainer;
  if (env.TRANSLATION_PROVIDER === 'mock') return mockExplainer;
  return null;
}

/*
=========================================================
EXPLICACIÓN DEL ARCHIVO
=========================================================

Propósito: Conecta con Google Cloud Translation (v2) para traducir palabras y con OpenAI (Chat
Completions) para generar explicaciones contextuales; incluye proveedores simulados (mock) para
desarrollo.

Responsabilidades principales:
- fetchJson: llamar a una API con tiempo límite (EXTERNAL_API_TIMEOUT_MS) y clasificar los fallos.
- googleTranslator: POST a translation.googleapis.com/language/translate/v2 con los parámetros q,
  source, target y format.
- openAiExplainer: POST a api.openai.com/v1/chat/completions con el modelo OPENAI_MODEL.
- mockTranslator y mockExplainer: respuestas marcadas como [mock] cuando TRANSLATION_PROVIDER=mock.
- activeTranslator y activeExplainer: elegir el proveedor según la configuración.

Elementos importantes:
- class ProviderError (tipos not_configured, timeout, rate_limited, unavailable, bad_response)
- interfaces Translator y Explainer
- googleTranslator, mockTranslator, openAiExplainer, mockExplainer
- activeTranslator(), activeExplainer()

Dependencias:
- fetch nativo de Node.js
- config/env.ts
- @rush/shared (tipo Language)

Flujo de datos:
Recibe una palabra y los idiomas origen/destino; devuelve el texto traducido o la explicación.

Aspectos técnicos importantes:
- Las claves de API solo se leen en el servidor; nunca llegan al navegador.
- Un estado 429 se convierte en rate_limited; un tiempo agotado en timeout.

Lugar en la arquitectura:
Capa de integraciones externas; la usa services/translation.ts. Aísla las APIs externas del resto
del código y permite trabajar sin claves gracias al modo mock.
*/
