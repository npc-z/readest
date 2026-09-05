import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { SystemSettings } from '@/types/settings';

const h = vi.hoisted(() => ({
  stored: {} as unknown,
  safeSaveJSON: vi.fn(async (..._args: unknown[]) => {}),
}));

vi.mock('@/services/persistence', () => ({
  safeLoadJSON: vi.fn(async () => h.stored),
  safeSaveJSON: (...args: unknown[]) => h.safeSaveJSON(...args),
}));

import { DEFAULT_SYSTEM_SETTINGS } from '@/services/constants';
import { DEFAULT_EXPLAINER_SETTINGS } from '@/services/explainer/constants';
import { loadSettings } from '@/services/settingsService';
import type { Context } from '@/services/settingsService';

const ctx: Context = {
  fs: {
    getPrefix: vi.fn(async () => 'Books'),
  } as unknown as Context['fs'],
  isMobile: false,
  isEink: false,
  isAppDataSandbox: false,
};

beforeEach(() => {
  h.safeSaveJSON.mockReset();
});

describe('explainerSettings backfill', () => {
  it('defaults thinking to off in DEFAULT_SYSTEM_SETTINGS', () => {
    expect(DEFAULT_SYSTEM_SETTINGS.explainerSettings).toEqual({
      thinking: 'off',
    });
  });

  it('backfills the default thinking onto a partial stored explainerSettings', async () => {
    h.stored = { explainerSettings: { sourceLang: 'en' } };

    const settings = await loadSettings(ctx);

    expect(settings.explainerSettings).toEqual({ sourceLang: 'en', thinking: 'off' });
    // Explainer settings are never cloud-synced: they must not be in the
    // settings sync whitelist.
    expect((settings as SystemSettings).explainerSettings).toBeDefined();
  });

  it('keeps a user-set thinking instead of the default', async () => {
    h.stored = { explainerSettings: { sourceLang: 'fr', thinking: 'high' as const } };

    const settings = await loadSettings(ctx);

    expect(settings.explainerSettings).toEqual({ sourceLang: 'fr', thinking: 'high' });
  });

  it('defaults the whole object when none is stored', async () => {
    h.stored = {};

    const settings = await loadSettings(ctx);

    expect(settings.explainerSettings).toEqual({ ...DEFAULT_EXPLAINER_SETTINGS });
  });
});
