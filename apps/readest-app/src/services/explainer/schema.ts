import { z } from 'zod';

/**
 * Zod payload schema matching prompt-framework.md §7 output format plus the
 * grammar tier revision. Fields are permissive (optional/nullable where a
 * missing tier is a legitimate degradation, and no array length caps) so
 * over-answering models can be salvaged: the salvage path slices notes/
 * grammar down to EXPLAINER_INPUT_LIMITS before persisting instead of having
 * the schema reject an otherwise usable payload.
 */

export const explainerPayloadSchema = z.object({
  simple: z.string(),
  notes: z
    .array(
      z.object({
        kind: z.enum(['word', 'phrase', 'idiom']),
        original: z.string(),
        meaningL: z.string(),
        example: z.string().nullable().optional(),
        meaningM: z.string().nullable().optional(),
      }),
    )
    .optional(),
  grammar: z
    .array(
      z.object({
        structure: z.string(),
        noteL: z.string(),
        noteM: z.string().nullable().optional(),
      }),
    )
    .optional(),
  translationM: z.string().nullable().optional(),
  metadata: z.object({
    sourceLang: z.string(),
    nativeLang: z.string(),
    promptVersion: z.number(),
    /** 'text' marks the pure-text fallback so the panel can render flat. */
    format: z.enum(['json', 'text']).optional(),
  }),
});

export type ExplainerPayload = z.infer<typeof explainerPayloadSchema>;
