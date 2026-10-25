/**
 * Single source of truth for how an Automatic1111 prompt is assembled.
 * Shared by the queue dock (browser) and the dev-server preview endpoint (node),
 * so queued jobs and entry previews can never drift apart.
 */

export type PromptSourceEntry = {
  positive_prompt?: string;
  negative_prompt?: string;
  loras?: string;
  model?: string;
};

export type GlobalPromptDefaults = {
  positive?: string;
  negative?: string;
};

export type ComposedPrompt = {
  prompt: string;
  negativePrompt: string;
  model: string;
  modelCandidates: string[];
};

/** Structural shape of `positive-presets.json` / `negative-presets.json`. */
export type PromptPresetSource = {
  selectedPreset?: string;
  presets?: Record<string, string>;
};

const joinPromptParts = (parts: Array<string | undefined>) =>
  parts
    .map((part) => (part ?? '').trim())
    .filter(Boolean)
    .join(', ')
    .trim();

export const resolveSelectedPresetText = (group: PromptPresetSource | null | undefined) => {
  const selected = group?.selectedPreset ?? '';
  if (!selected) {
    return '';
  }

  return (group?.presets?.[selected] ?? '').trim();
};

export function composeGenerationPrompt(
  entries: PromptSourceEntry[],
  globals: GlobalPromptDefaults = {}
): ComposedPrompt {
  const positiveParts: string[] = [];
  const negativeParts: string[] = [];
  const loraParts: string[] = [];
  const modelCandidates: string[] = [];

  for (const entry of entries) {
    const positive = (entry.positive_prompt ?? '').trim();
    const negative = (entry.negative_prompt ?? '').trim();
    const loras = (entry.loras ?? '').trim();
    const model = (entry.model ?? '').trim();

    if (positive) {
      positiveParts.push(positive);
    }
    if (negative) {
      negativeParts.push(negative);
    }
    if (loras) {
      loraParts.push(loras);
    }
    if (model && !modelCandidates.includes(model)) {
      modelCandidates.push(model);
    }
  }

  return {
    prompt: joinPromptParts([globals.positive, ...positiveParts, ...loraParts]),
    negativePrompt: joinPromptParts([globals.negative, ...negativeParts]),
    // Last entry wins; `modelCandidates` exposes conflicts to the caller.
    model: modelCandidates[modelCandidates.length - 1] ?? '',
    modelCandidates,
  };
}
