import { createGateway, generateText } from 'ai';

import { validateUserAndToken } from '@/utils/access';
import { GATEWAY_MODELS } from '@/services/ai/constants';
import {
  EXPLAINER_GENERATION_PARAMS,
  EXPLAINER_THINKING_LEVELS,
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
}

const errorResponse = (code: string, status: number): Response =>
  Response.json({ error: { code } }, { status });

/**
 * Explainer generation for the Web build. The system prompt is built
 * server-side from the shared, versioned constants — the client never sends a
 * system prompt (unlike /api/ai/chat), so a prompt/payload version change is
 * shipped here without a client rollout. apiKey/model ride in the body.
 */
export async function POST(req: Request): Promise<Response> {
  try {
    const { user, token } = await validateUserAndToken(req.headers.get('authorization'));
    if (!user || !token) {
      return Response.json({ error: 'Not authenticated' }, { status: 403 });
    }

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

    const apiKey =
      typeof body.apiKey === 'string' && body.apiKey
        ? body.apiKey
        : process.env['AI_GATEWAY_API_KEY'];
    if (!apiKey) {
      return errorResponse('ai-not-configured', 401);
    }

    const model =
      typeof body.model === 'string' && body.model ? body.model : GATEWAY_MODELS.GEMINI_FLASH_LITE;
    const gateway = createGateway({ apiKey });
    const languageModel = gateway(model);
    // Server-side cap as a defense in depth: the web client truncates too, but a
    // direct/scripted body must not push an unbounded passage into a billable call.
    const { text: generationText } = truncateToUnitLimit(text);
    const providerNamespace = (languageModel as { provider?: string }).provider;

    const result = await generateText({
      model: languageModel,
      system: buildExplainerSystemPrompt({ sourceLang, nativeLang }),
      prompt: buildExplainerInputPrompt(generationText),
      temperature: EXPLAINER_GENERATION_PARAMS.temperature,
      maxOutputTokens: EXPLAINER_GENERATION_PARAMS.maxOutputTokens,
      maxRetries: EXPLAINER_GENERATION_PARAMS.maxRetries,
      abortSignal: AbortSignal.timeout(explainerTimeoutMs(thinking)),
      providerOptions: buildProviderOptions(thinking, providerNamespace),
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
