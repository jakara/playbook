import type { Locator, Page } from '@playwright/test';

export interface PlaybookContext { page: Page }

export interface NarrationClip { text?: string; audio?: string }
export interface PlaybookNarration {
  enabled?: boolean;
  voice?: string;
  rate?: number;
  opening?: false | NarrationClip;
}
export interface PlaybookRedaction {
  selector: string;
  mode?: 'cover' | 'blur';
  label?: string;
  blurPx?: number;
  padding?: number;
}

export interface PlaybookStep<C extends PlaybookContext> {
  id: string;
  title: string;
  explain: string;
  target?: (context: C) => Locator;
  narration?: false | NarrationClip;
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
    spotlightFeather?: number;
    overlayOpacity?: number;
    cursorMoveMs?: number;
    defaultHoldMs?: number;
    openingMs?: number;
  };
  narration?: PlaybookNarration;
  redactions?: readonly PlaybookRedaction[];
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
  validatePlaybookPresentation(book);
  return book;
}

/** Shared with static workspace discovery; never inspects or invokes business callbacks. */
export function validatePlaybookPresentation(book: {
  presentation?: unknown;
  narration?: unknown;
  redactions?: unknown;
  steps: readonly { presentation?: unknown; narration?: unknown }[];
}): void {
  const record = (value: unknown): value is Record<string, unknown> =>
    typeof value === 'object' && value !== null && !Array.isArray(value);
  const has = (value: object, key: string) => Object.hasOwn(value, key);
  const number = (value: unknown, min: number, max: number, field: string) => {
    if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) {
      throw new Error(`Invalid presentation value: ${field}`);
    }
  };
  const text = (value: unknown, field: string) => {
    if (typeof value !== 'string' || !value.trim()) throw new Error(`Invalid presentation value: ${field}`);
  };
  const clip = (value: unknown, field: string) => {
    if (value === false) return;
    if (!record(value) || Object.keys(value).some(key => !['text', 'audio'].includes(key))
      || (has(value, 'text') && has(value, 'audio'))) throw new Error(`Invalid narration clip: ${field}`);
    if (has(value, 'text')) text(value.text, `${field}.text`);
    if (has(value, 'audio')) {
      text(value.audio, `${field}.audio`);
      const audio = value.audio as string;
      if (/^(?:[a-z]+:|[/\\])/i.test(audio) || audio.includes('\\')
        || audio.split('/').includes('..') || !/\.(?:wav|mp3|m4a|ogg)$/i.test(audio)) {
        throw new Error(`Invalid narration audio path: ${field}.audio; use a workspace-relative WAV, MP3, M4A or OGG file`);
      }
    }
  };
  const flowBounds: Record<string, [number, number]> = {
    spotlightRadius: [40, 300], spotlightFeather: [0, 100], overlayOpacity: [0, .9],
    cursorMoveMs: [150, 5000], defaultHoldMs: [0, 60000], openingMs: [0, 30000], holdMs: [0, 60000], afterMs: [0, 60000],
  };
  const presentation = (value: unknown, bounds: Record<string, [number, number]>) => {
    if (value === undefined) return;
    if (!record(value)) throw new Error('Invalid presentation options');
    for (const [key, option] of Object.entries(value)) {
      const range = bounds[key];
      if (range) number(option, range[0], range[1], key);
    }
  };
  presentation(book.presentation, flowBounds);
  if (has(book, 'narration')) {
    const value = book.narration;
    if (!record(value) || Object.keys(value).some(key => !['enabled', 'voice', 'rate', 'opening'].includes(key))) {
      throw new Error('Invalid flow narration options');
    }
    if (has(value, 'enabled') && typeof value.enabled !== 'boolean') throw new Error('Invalid narration enabled flag');
    if (has(value, 'voice')) text(value.voice, 'narration.voice');
    if (has(value, 'rate')) {
      number(value.rate, 80, 400, 'narration.rate');
      if (!Number.isInteger(value.rate)) throw new Error('Invalid narration rate; use integer words per minute');
    }
    if (has(value, 'opening')) clip(value.opening, 'narration.opening');
  }
  if (has(book, 'redactions')) {
    if (!Array.isArray(book.redactions)) throw new Error('Invalid redactions list');
    for (const value of book.redactions) {
      if (!record(value) || Object.keys(value).some(key => !['selector', 'mode', 'label', 'blurPx', 'padding'].includes(key))) {
        throw new Error('Invalid redaction options');
      }
      text(value.selector, 'redactions.selector');
      if (has(value, 'mode') && !['cover', 'blur'].includes(value.mode as string)) throw new Error('Invalid redaction mode');
      if (has(value, 'label') && typeof value.label !== 'string') throw new Error('Invalid redaction label');
      if (has(value, 'blurPx')) number(value.blurPx, 1, 40, 'redactions.blurPx');
      if (has(value, 'padding')) number(value.padding, 0, 40, 'redactions.padding');
    }
  }
  for (const step of book.steps) {
    presentation(step.presentation, flowBounds);
    if (record(step.presentation)) {
      const value = step.presentation;
      if (has(value, 'spotlightFeather')) throw new Error('spotlightFeather belongs to flow presentation');
    }
    if (has(step, 'redactions')) throw new Error('redactions belong to the flow');
    if (has(step, 'narration')) clip(step.narration, 'step.narration');
  }
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
