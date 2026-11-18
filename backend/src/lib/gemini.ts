import { env } from '../env';
import { HttpError } from '../http';

// Thin client for the Gemini REST API (generateContent). No SDK needed:
// set GEMINI_API_KEY in backend/.env and every AI feature switches on.

export interface Part {
  text?: string;
  thought?: boolean;
  functionCall?: { name: string; args?: Record<string, unknown>; id?: string };
  functionResponse?: { name: string; response: Record<string, unknown>; id?: string };
  [k: string]: unknown;
}
export interface Content { role: 'user' | 'model'; parts: Part[] }

export interface ToolDef {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  run: (args: Record<string, any>) => Promise<unknown>;
}

interface GenOptions {
  system: string;
  contents: Content[];
  tools?: ToolDef[];
  json?: boolean;
  temperature?: number;
  maxTokens?: number;
}

/** The model actually in use: GEMINI_MODEL, or a replacement found when Google says that one does not exist. */
let activeModel = env.geminiModel;
export const currentModel = () => activeModel;

/**
 * Asks Google which models this key can use and picks the newest general "flash" model
 * (not "lite", not preview/experimental when a stable one exists). Returns null if none.
 */
export async function pickAvailableModel(): Promise<string | null> {
  const res = await fetch(`${env.geminiBaseUrl}/models?pageSize=200`, { headers: { 'x-goog-api-key': env.geminiKey }, signal: AbortSignal.timeout(20_000) });
  if (!res.ok) return null;
  const data: any = await res.json().catch(() => ({}));
  const usable = (data.models || [])
    .filter((m: any) => (m.supportedGenerationMethods || []).includes('generateContent'))
    .map((m: any) => String(m.name).replace(/^models\//, ''))
    .filter((n: string) => /^gemini-[\d.]+-flash/.test(n) && !/lite|image|tts|audio|live|thinking/.test(n));
  const version = (n: string) => parseFloat(n.match(/^gemini-([\d.]+)/)![1]);
  const unstable = (n: string) => /preview|exp/.test(n) ? 1 : 0;
  usable.sort((a: string, b: string) => unstable(a) - unstable(b) || version(b) - version(a) || a.length - b.length);
  return usable[0] || null;
}

async function call(opts: GenOptions, retried = false): Promise<Content> {
  if (!env.geminiKey) throw new HttpError(503, 'ai_not_configured');
  const body: Record<string, unknown> = {
    systemInstruction: { parts: [{ text: opts.system }] },
    contents: opts.contents,
    generationConfig: {
      temperature: opts.temperature ?? 0.3,
      maxOutputTokens: opts.maxTokens ?? 4096,
      ...(opts.json ? { responseMimeType: 'application/json' } : {}),
    },
  };
  if (opts.tools?.length) {
    body.tools = [{ functionDeclarations: opts.tools.map(({ name, description, parameters }) => ({ name, description, parameters })) }];
  }
  let res: Response;
  try {
    res = await fetch(`${env.geminiBaseUrl}/models/${encodeURIComponent(activeModel)}:generateContent`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-goog-api-key': env.geminiKey },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(60_000),
    });
  } catch (e: any) {
    console.error('Gemini request failed:', e?.message || e);
    throw new HttpError(502, 'ai_unreachable');
  }
  const data: any = await res.json().catch(() => ({}));
  if (!res.ok) {
    const message: string = data?.error?.message || `HTTP ${res.status}`;
    console.error('Gemini error:', message);
    if (res.status === 429) throw new HttpError(429, 'ai_busy');
    if (res.status === 400 && /API key/i.test(message)) throw new HttpError(502, 'ai_bad_key');
    if (res.status === 401 || res.status === 403) throw new HttpError(502, 'ai_bad_key');
    if (res.status === 404) {
      // The configured model does not exist (renamed or retired): switch to the newest available one once.
      const replacement = retried ? null : await pickAvailableModel().catch(() => null);
      if (replacement && replacement !== activeModel) {
        console.warn(`Gemini: el modelo "${activeModel}" no existe; usando "${replacement}". Cambia GEMINI_MODEL en backend/.env para fijarlo.`);
        activeModel = replacement;
        return call(opts, true);
      }
      throw new HttpError(502, 'ai_bad_model', activeModel);
    }
    throw new HttpError(502, 'ai_failed');
  }
  const content = data?.candidates?.[0]?.content as Content | undefined;
  if (!content?.parts?.length) throw new HttpError(502, 'ai_empty');
  return content;
}

const textOf = (c: Content) => c.parts.filter((p) => p.text && !p.thought).map((p) => p.text).join('').trim();

/** One-shot text generation. */
export async function generate(opts: Omit<GenOptions, 'tools'>): Promise<string> {
  return textOf(await call(opts));
}

/** One-shot generation that must return JSON. */
export async function generateJson<T>(opts: Omit<GenOptions, 'tools' | 'json'>): Promise<T> {
  const raw = textOf(await call({ ...opts, json: true }));
  try {
    return JSON.parse(raw.replace(/^```(?:json)?\s*|\s*```$/g, '')) as T;
  } catch {
    throw new HttpError(502, 'ai_failed');
  }
}

/** Conversation where the model may call our tools (database look-ups) before answering. */
export async function converse(opts: GenOptions & { tools: ToolDef[] }): Promise<string> {
  const contents = [...opts.contents];
  for (let round = 0; round < 8; round++) {
    const reply = await call({ ...opts, contents });
    const calls = reply.parts.filter((p) => p.functionCall);
    if (!calls.length) return textOf(reply);
    // The model's turn goes back verbatim so any thought signatures it attached are preserved.
    contents.push({ role: 'model', parts: reply.parts });
    const responses: Part[] = [];
    for (const p of calls) {
      const fc = p.functionCall!;
      const tool = opts.tools.find((t) => t.name === fc.name);
      let response: Record<string, unknown>;
      try {
        response = tool ? { result: await tool.run(fc.args || {}) } : { error: `Unknown tool ${fc.name}` };
      } catch (e: any) {
        response = { error: String(e?.message || e).slice(0, 300) };
      }
      responses.push({ functionResponse: { name: fc.name, response, ...(fc.id ? { id: fc.id } : {}) } });
    }
    contents.push({ role: 'user', parts: responses });
  }
  throw new HttpError(502, 'ai_failed');
}
