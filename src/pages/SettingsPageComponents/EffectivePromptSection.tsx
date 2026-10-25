import { useMemo } from 'react';

import {
  composeGenerationPrompt,
  resolveSelectedPresetText,
} from '../../features/generation/promptComposition';
import type { PromptPresetGroup } from './settingsTypes';

const ENTRY_POSITIVE_PLACEHOLDER = '[entry positive prompts]';
const ENTRY_NEGATIVE_PLACEHOLDER = '[entry negative prompts]';
const ENTRY_LORAS_PLACEHOLDER = '[entry loras]';

type EffectivePromptSectionProps = {
  positivePresetGroup: PromptPresetGroup;
  negativePresetGroup: PromptPresetGroup;
};

export function EffectivePromptSection({
  positivePresetGroup,
  negativePresetGroup,
}: EffectivePromptSectionProps) {
  // Built with the same composer the queue uses, so this preview cannot drift from reality.
  const composed = useMemo(
    () =>
      composeGenerationPrompt(
        [
          {
            positive_prompt: ENTRY_POSITIVE_PLACEHOLDER,
            negative_prompt: ENTRY_NEGATIVE_PLACEHOLDER,
            loras: ENTRY_LORAS_PLACEHOLDER,
          },
        ],
        {
          positive: resolveSelectedPresetText(positivePresetGroup),
          negative: resolveSelectedPresetText(negativePresetGroup),
        }
      ),
    [positivePresetGroup, negativePresetGroup]
  );

  return (
    <section className="settings-section">
      <div className="settings-header">
        <p className="panel-label">Generation</p>
        <h2>Effective prompt</h2>
      </div>
      <p className="subtitle">
        Every queued job is assembled in this order. The selected presets above are placed first,
        then the prompts of the entries you picked in the list and tile views, then their LoRAs.
      </p>

      <div className="settings-grid two-columns">
        <div className="preset-card">
          <h3>Positive</h3>
          <p className="effective-prompt-preview">{composed.prompt}</p>
        </div>

        <div className="preset-card">
          <h3>Negative</h3>
          <p className="effective-prompt-preview">
            {composed.negativePrompt || 'No negative prompt.'}
          </p>
        </div>
      </div>
    </section>
  );
}
