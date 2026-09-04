import { createGateway, generateText } from 'ai';
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';

import { validateUserAndToken } from '@/utils/access';
import { GATEWAY_MODELS } from '@/services/ai/constants';
import {
  EXPLAINER_DEFAULT_BASE_URL,
  EXPLAINER_GENERATION_PARAMS,
  EXPLAINER_THINKING_LEVELS,
  explainerMaxOutputTokens,
  explainerTimeoutMs,
  type ExplainerThinkingLevel,
} from '@/services/explainer/constants';
import {
  buildExplainerInputPrompt,
  buildExplainerSystemPrompt,
  containsInputCloseTag,
} from '@/services/explainer/prompts';
import { isMeaninglessText, truncateToUnitLimit } from '@/services/explainer/text';
import { buildProviderOptions } from '@/services/explainer/thinking';

// Covers the longest generation budget (thinking='high' → 240s) plus headroom.
export const maxDuration = 240;

interface ExplainRequestBody {
  text?: unknown;
  sourceLang?: unknown;
  nativeLang?: unknown;
  thinking?: unknown;
  apiKey?: unknown;
  model?: unknown;
  /** Settings.provider, restricted to 'openrouter' | 'ai-gateway'. */
  provider?: unknown;
  /** OpenAI-compatible base URL (openrouterBaseUrl). Ignored for ai-gateway. */
  baseURL?: unknown;
}

const errorResponse = (code: string, status: number): Response =>
  Response.json({ error: { code } }, { status });

/** Providers the route will dispatch to. Anything else is rejected outright so
 *  a typo / 'ollama' can't silently fall into the arbitrary-base-URL path. */
const EXPLAINER_PROVIDERS = ['openrouter', 'ai-gateway'] as const;

/**
 * Reject client-supplied base URLs that could turn the route into an SSRF
 * vector against loopback, cloud-metadata or private endpoints. We allow only
 * https to a public hostname: no IP literals (covers 169.254.x, 127.x, 10.x,
 * 192.168.x, ::1 …), no embedded credentials, and no obvious internal TLDs.
 * DNS-rebinding to an internal IP is not fully closed here (would need a
 * server-side resolve), but the common direct SSRF payloads are blocked.
 */
const isSafeExternalBaseURL = (baseURL: string): boolean => {
  let url: URL;
  try {
    url = new URL(baseURL);
  } catch {
    return false;
  }
  if (url.protocol !== 'https:') return false;
  if (url.username || url.password) return false;
  // A trailing dot makes a root FQDN (e.g. `localhost.`, `10.0.0.1.`); the URL
  // parser preserves it for hostnames (though not for IP literals), so strip one
  // before doing any literal/hostname comparison, otherwise it bypasses the guard.
  const host = url.hostname
    .replace(/^\[|\]$/g, '')
    .toLowerCase()
    .replace(/\.$/, '');
  if (!host) return false;
  if (
    host === 'localhost' ||
    host.endsWith('.local') ||
    host.endsWith('.internal') ||
    host.endsWith('.lan') ||
    host.endsWith('.home') ||
    host.endsWith('.localdomain')
  ) {
    return false;
  }
  // Any IP literal — IPv4 or IPv6 — is rejected outright.
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host) || host.includes(':')) return false;
  return true;
};

/**
 * Best-effort per-IP rate limit guarding the BYOK path (a client-supplied key
 * skips the session check). In-memory, so it holds on a single node / self-hosted
 * deployment but is not a hard limit across stateless serverless replicas (there
 * an external limiter is required). Generous enough that normal usage — one
 * explanation per paragraph selection — never trips it.
 */
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX = 60;
/** Bound the in-memory map so a spoofed `x-forwarded-for` flood can't grow it forever. */
const RATE_LIMIT_IP_CAP = 10_000;
const ipHits = new Map<string, { count: number; resetAt: number }>();

const clientIp = (req: Request): string => {
  const fwd = req.headers.get('x-forwarded-for');
  if (fwd) {
    const first = fwd.split(',')[0]?.trim();
    if (first) return first;
  }
  return req.headers.get('x-real-ip') ?? req.headers.get('cf-connecting-ip') ?? 'unknown';
};

const withinRateLimit = (ip: string): boolean => {
  const now = Date.now();
  const entry = ipHits.get(ip);
  if (!entry || entry.resetAt <= now) {
    if (!entry) {
      if (ipHits.size >= RATE_LIMIT_IP_CAP) {
        const cutoff = now - RATE_LIMIT_WINDOW_MS;
        for (const [key, value] of ipHits) {
          if (value.resetAt <= cutoff) ipHits.delete(key);
        }
        // Still saturated (all entries active) — drop the whole map rather than
        // grow without bound; the next request rebuilds each bucket fresh.
        if (ipHits.size >= RATE_LIMIT_IP_CAP) ipHits.clear();
      }
      ipHits.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    } else {
      entry.count = 1;
      entry.resetAt = now + RATE_LIMIT_WINDOW_MS;
    }
    return true;
  }
  entry.count += 1;
  return entry.count <= RATE_LIMIT_MAX;
};

/**
 * Explainer generation for the Web build. The system prompt is built
 * server-side from the shared, versioned constants — the client never sends a
 * system prompt (unlike /api/ai/chat), so a prompt/payload version change is
 * shipped here without a client rollout. apiKey/model ride in the body.
 */
export async function POST(req: Request): Promise<Response> {
  try {
    const body = (await req.json()) as ExplainRequestBody;
    const text = typeof body.text === 'string' ? body.text : '';
    const sourceLang = typeof body.sourceLang === 'string' ? body.sourceLang : '';
    const nativeLang = typeof body.nativeLang === 'string' ? body.nativeLang : '';
    const thinking = EXPLAINER_THINKING_LEVELS.includes(body.thinking as ExplainerThinkingLevel)
      ? (body.thinking as ExplainerThinkingLevel)
      : 'off';

    if (!text || !sourceLang || !nativeLang) {
      return errorResponse('invalid-input', 400);
    }
    if (isMeaninglessText(text) || containsInputCloseTag(text)) {
      return errorResponse('invalid-input', 400);
    }

    const clientApiKey = typeof body.apiKey === 'string' && body.apiKey ? body.apiKey : '';
    const apiKey = clientApiKey || process.env['AI_GATEWAY_API_KEY'];
    if (!apiKey) {
      return errorResponse('ai-not-configured', 401);
    }
    // Rate-limit only the BYOK path (client-supplied key) — the anonymous
    // surface. The env-key fallback is session-gated below instead, so a
    // legitimate session user isn't throttled by a shared per-IP bucket.
    if (clientApiKey && !withinRateLimit(clientIp(req))) {
      return errorResponse('rate-limited', 429);
    }

    // A self-supplied client key (the normal web path) is its own credential and
    // needs no Readest session. Only the server-key fallback (env) is gated by a
    // user token so an unauthenticated caller can't burn the hosted key.
    if (!clientApiKey) {
      const { user, token } = await validateUserAndToken(req.headers.get('authorization'));
      if (!user || !token) {
        return Response.json({ error: 'Not authenticated' }, { status: 403 });
      }
    }

    const model =
      typeof body.model === 'string' && body.model ? body.model : GATEWAY_MODELS.GEMINI_FLASH_LITE;
    const provider = typeof body.provider === 'string' ? body.provider : 'ai-gateway';
    if (!EXPLAINER_PROVIDERS.includes(provider as (typeof EXPLAINER_PROVIDERS)[number])) {
      return errorResponse('invalid-input', 400);
    }
    const baseURL =
      typeof body.baseURL === 'string' && body.baseURL ? body.baseURL : EXPLAINER_DEFAULT_BASE_URL;
    // Only the OpenAI-compatible path accepts a client base URL; the gateway is
    // a fixed Vercel endpoint. A malformed/private URL here is invalid input.
    if (provider === 'openrouter' && !isSafeExternalBaseURL(baseURL)) {
      return errorResponse('invalid-input', 400);
    }
    const languageModel =
      provider === 'ai-gateway'
        ? createGateway({ apiKey })(model)
        : createOpenAICompatible({
            name: 'openrouter',
            baseURL,
            apiKey,
          }).chatModel(model);
    // Server-side cap as a defense in depth: the web client truncates too, but a
    // direct/scripted body must not push an unbounded passage into a billable call.
    const { text: generationText } = truncateToUnitLimit(text);
    const providerNamespace = (languageModel as { provider?: string }).provider;
    // The gateway ignores any client base URL; pass it only for the OpenAI-
    // compatible path so a rogue `provider:'ai-gateway'+baseURL:deepseek` can't
    // leak a DeepSeek `off` signal into the gateway namespace.
    const mapperBaseURL = provider === 'ai-gateway' ? undefined : baseURL;

    const result = await generateText({
      model: languageModel,
      system: buildExplainerSystemPrompt({ sourceLang, nativeLang }),
      prompt: buildExplainerInputPrompt(generationText),
      temperature: EXPLAINER_GENERATION_PARAMS.temperature,
      maxOutputTokens: explainerMaxOutputTokens(thinking),
      maxRetries: EXPLAINER_GENERATION_PARAMS.maxRetries,
      abortSignal: AbortSignal.timeout(explainerTimeoutMs(thinking)),
      providerOptions: buildProviderOptions(thinking, providerNamespace, mapperBaseURL),
    });

    return Response.json({ text: result.text ?? '' });
  } catch (error) {
    const e = error instanceof Error ? error : new Error(String(error));
    if (e.name === 'AbortError' || e.name === 'TimeoutError' || /timeout/i.test(e.message)) {
      return errorResponse('timeout', 504);
    }
    return errorResponse('provider-error', 502);
  }
}
