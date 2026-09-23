import { useState, type Dispatch, type SetStateAction } from 'react';

import { Automatic1111ConnectionSection } from './SettingsPageComponents/Automatic1111ConnectionSection';
import { EffectivePromptSection } from './SettingsPageComponents/EffectivePromptSection';
import { PromptPresetsSection } from './SettingsPageComponents/PromptPresetsSection';
import type { GenerationSettings, PromptPresetGroup } from './SettingsPageComponents/settingsTypes';

type SettingsPageProps = {
  positivePresetGroup: PromptPresetGroup;
  negativePresetGroup: PromptPresetGroup;
  setPositivePresetGroup: Dispatch<SetStateAction<PromptPresetGroup>>;
  setNegativePresetGroup: Dispatch<SetStateAction<PromptPresetGroup>>;
  generationSettings: GenerationSettings;
  setGenerationSettings: Dispatch<SetStateAction<GenerationSettings>>;
};

export function SettingsPage({
  positivePresetGroup,
  negativePresetGroup,
  setPositivePresetGroup,
  setNegativePresetGroup,
  generationSettings,
  setGenerationSettings,
}: SettingsPageProps) {
  const [saveResult, setSaveResult] = useState<string | null>(null);
  const [saveError, setSaveError] = useState(false);

  return (
    <div className="settings-page">
      <PromptPresetsSection
        positivePresetGroup={positivePresetGroup}
        negativePresetGroup={negativePresetGroup}
        setPositivePresetGroup={setPositivePresetGroup}
        setNegativePresetGroup={setNegativePresetGroup}
        setSaveResult={setSaveResult}
        setSaveError={setSaveError}
      />

      <EffectivePromptSection
        positivePresetGroup={positivePresetGroup}
        negativePresetGroup={negativePresetGroup}
      />

      <Automatic1111ConnectionSection
        generationSettings={generationSettings}
        setGenerationSettings={setGenerationSettings}
        saveResult={saveResult}
        saveError={saveError}
        setSaveResult={setSaveResult}
        setSaveError={setSaveError}
      />
    </div>
  );
}
