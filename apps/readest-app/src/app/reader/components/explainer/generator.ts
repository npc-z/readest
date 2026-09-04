import type { AISettings } from '@/services/ai/types';
import type { AppService } from '@/types/system';
import { ExplainerDb, type ExplanationEntry } from '@/services/explainer/ExplainerDb';
import { createExplainerService } from '@/services/explainer/ExplainerService';
import type { ExplainerOpenRequest } from '@/store/explainerStore';

/**
 * The panel-side generation seam. The real {@link ExplainerService} satisfies
 * this; tests inject a fake so the panel's three state renders (loading/error/
 * not-configured) can be exercised without AI or storage.
 */
export interface ExplainerGenerator {
  getOrGenerate(request: ExplainerOpenRequest): Promise<ExplanationEntry>;
  regenerate(request: ExplainerOpenRequest): Promise<ExplanationEntry>;
  deleteExplanation(id: string): Promise<void>;
}

/**
 * Build the real generator from the app service + AI settings. Returns null
 * before the app service is ready (the panel then falls back to the
 * not-configured/empty state).
 */
export const createExplainerGenerator = (
  appService: AppService | null | undefined,
  aiSettings: AISettings,
): ExplainerGenerator | null => {
  if (!appService) return null;
  return createExplainerService({ store: ExplainerDb.open(appService), settings: aiSettings });
};
