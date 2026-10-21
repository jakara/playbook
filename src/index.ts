import type { Locator, Page } from '@playwright/test';

export interface PlaybookContext { page: Page }

export interface PlaybookStep<C extends PlaybookContext> {
  id: string;
  title: string;
  explain: string;
  target?: (context: C) => Locator;
  presentation?: {
    chapter?: string;
    side?: 'top' | 'right' | 'bottom' | 'left';
    holdMs?: number;
    afterMs?: number;
  };
  run: (context: C) => Promise<void>;
  verify: (context: C) => Promise<void>;
}

export interface Playbook<C extends PlaybookContext> {
  schemaVersion: 1;
  id: string;
  title: string;
  summary: string;
  presentation?: {
    spotlightRadius?: number;
    overlayOpacity?: number;
    cursorMoveMs?: number;
    defaultHoldMs?: number;
    openingMs?: number;
  };
  source?: { testFile: string; testTitle: string; revision?: string };
  requirements: {
    dataMode: 'real' | 'fixture' | 'mock';
    effects: 'read-only' | 'writes';
    replay: 'safe' | 'reset-required' | 'single-run';
    roles: readonly string[];
  };
  steps: readonly PlaybookStep<C>[];
}

// This contract is deliberately native TypeScript: Playwright keeps its own API.
export function definePlaybook<C extends PlaybookContext>(book: Playbook<C>): Playbook<C> {
  if (book.schemaVersion !== 1 || !book.id.trim() || !book.title.trim() || !book.steps.length) {
    throw new Error('Invalid Playbook identity, version or empty steps');
  }
  const ids = new Set<string>();
  for (const step of book.steps) {
    if (!step.id.trim() || ids.has(step.id) || !step.title.trim() || !step.explain.trim()
      || typeof step.run !== 'function' || typeof step.verify !== 'function') {
      throw new Error(`Invalid or duplicate Playbook step: ${step.id}`);
    }
    ids.add(step.id);
  }
  const bounds: Record<string, [number, number]> = { spotlightRadius: [40, 300], overlayOpacity: [0, .9], cursorMoveMs: [150, 5000], defaultHoldMs: [0, 60000], openingMs: [0, 30000], holdMs: [0, 60000], afterMs: [0, 60000] };
  for (const values of [book.presentation, ...book.steps.map(step => step.presentation)]) {
    for (const [key, value] of Object.entries(values || {})) {
      const range = bounds[key];
      if (range && (typeof value !== 'number' || !Number.isFinite(value) || value < range[0] || value > range[1])) throw new Error(`Invalid presentation value: ${key}`);
    }
  }
  return book;
}

export interface PlaybookProfile<C extends PlaybookContext> {
  schemaVersion: 1;
  id: string;
  title: string;
  dataMode: 'real' | 'fixture' | 'mock';
  roles: readonly string[];
  resetBeforeRun?: boolean;
  prepare: (options: { page: Page; workspaceDir: string; parameters: Record<string, unknown> }) => Promise<{ context: C; release?: () => Promise<void> }>;
}

export function defineProfile<C extends PlaybookContext>(profile: PlaybookProfile<C>): PlaybookProfile<C> {
  if (profile.schemaVersion !== 1 || !profile.id || !profile.title || !['real', 'fixture', 'mock'].includes(profile.dataMode)
    || !Array.isArray(profile.roles) || typeof profile.prepare !== 'function') throw new Error('Invalid Playbook profile');
  return profile;
}

export interface RunHooks<C extends PlaybookContext> {
  beforeStep?: (step: PlaybookStep<C>, context: C) => Promise<void>;
  afterStep?: (step: PlaybookStep<C>, context: C) => Promise<void>;
  aroundStep?: (step: PlaybookStep<C>, execute: () => Promise<void>) => Promise<void>;
}

/** Test/reference executor; the desktop runner supplies interactive presentation.
 * Setup/authentication and teardown remain in the caller's fixtures/profile.
 */
export async function runPlaybook<C extends PlaybookContext>(
  book: Playbook<C>, context: C, hooks: RunHooks<C> = {},
): Promise<void> {
  for (const step of book.steps) {
    const execute = async () => {
      await hooks.beforeStep?.(step, context);
      await step.run(context);
      await step.verify(context);
      await hooks.afterStep?.(step, context);
    };
    if (hooks.aroundStep) await hooks.aroundStep(step, execute);
    else await execute();
  }
}
