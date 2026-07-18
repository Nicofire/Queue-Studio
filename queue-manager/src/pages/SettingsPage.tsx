import { useEffect, useState } from 'react';

import { Automatic1111ConnectionSection } from './SettingsPageComponents/Automatic1111ConnectionSection';
import { PromptPresetsSection } from './SettingsPageComponents/PromptPresetsSection';
import {
  fetchJson,
  fromPersistedGenerationSettings,
  readStoredJson,
} from './SettingsPageComponents/settingsApi';
import {
  DEFAULT_GENERATION_SETTINGS,
  DEFAULT_NEGATIVE_PRESETS,
  DEFAULT_POSITIVE_PRESETS,
  REMOTE_JSON_PATHS,
  STORAGE_KEYS,
} from './SettingsPageComponents/settingsConfig';
import type { GenerationSettings, PromptPresetGroup } from './SettingsPageComponents/settingsTypes';

function getInitialGenerationSettings() {
  const rootTheme = document.documentElement.dataset.theme;
  const fallback: GenerationSettings = {
    ...DEFAULT_GENERATION_SETTINGS,
    theme:
      rootTheme === 'dark' || rootTheme === 'light' ? rootTheme : DEFAULT_GENERATION_SETTINGS.theme,
  };

  const stored = readStoredJson<unknown>(STORAGE_KEYS.generationSettings);
  return fromPersistedGenerationSettings(stored, fallback);
}

export function SettingsPage() {
  const [positivePresetGroup, setPositivePresetGroup] =
    useState<PromptPresetGroup>(DEFAULT_POSITIVE_PRESETS);
  const [negativePresetGroup, setNegativePresetGroup] =
    useState<PromptPresetGroup>(DEFAULT_NEGATIVE_PRESETS);
  const [generationSettings, setGenerationSettings] = useState<GenerationSettings>(
    getInitialGenerationSettings
  );
  const [saveResult, setSaveResult] = useState<string | null>(null);
  const [saveError, setSaveError] = useState(false);
  const [hasHydratedSettings, setHasHydratedSettings] = useState(false);

  useEffect(() => {
    void (async () => {
      const [storedPositivePresets, storedNegativePresets, storedGenerationSettings] = [
        readStoredJson<PromptPresetGroup>(STORAGE_KEYS.positivePresets),
        readStoredJson<PromptPresetGroup>(STORAGE_KEYS.negativePresets),
        readStoredJson<unknown>(STORAGE_KEYS.generationSettings),
      ];

      const [remotePositivePresets, remoteNegativePresets, remoteGenerationSettingsRaw] =
        await Promise.all([
          fetchJson<PromptPresetGroup>(REMOTE_JSON_PATHS.positivePresets, DEFAULT_POSITIVE_PRESETS),
          fetchJson<PromptPresetGroup>(REMOTE_JSON_PATHS.negativePresets, DEFAULT_NEGATIVE_PRESETS),
          fetchJson<unknown>(REMOTE_JSON_PATHS.generationSettings, null),
        ]);

      const remoteGenerationSettings = fromPersistedGenerationSettings(
        remoteGenerationSettingsRaw,
        DEFAULT_GENERATION_SETTINGS
      );

      const nextPositivePresets =
        remotePositivePresets ?? storedPositivePresets ?? DEFAULT_POSITIVE_PRESETS;
      const nextNegativePresets =
        remoteNegativePresets ?? storedNegativePresets ?? DEFAULT_NEGATIVE_PRESETS;
      const nextGenerationSettings =
        remoteGenerationSettings ??
        fromPersistedGenerationSettings(storedGenerationSettings, DEFAULT_GENERATION_SETTINGS);

      setPositivePresetGroup(nextPositivePresets);
      setNegativePresetGroup(nextNegativePresets);
      setGenerationSettings(nextGenerationSettings);
      setHasHydratedSettings(true);
    })();
  }, []);

  useEffect(() => {
    if (!hasHydratedSettings) {
      return;
    }

    localStorage.setItem(STORAGE_KEYS.positivePresets, JSON.stringify(positivePresetGroup));
  }, [hasHydratedSettings, positivePresetGroup]);

  useEffect(() => {
    if (!hasHydratedSettings) {
      return;
    }

    localStorage.setItem(STORAGE_KEYS.negativePresets, JSON.stringify(negativePresetGroup));
  }, [hasHydratedSettings, negativePresetGroup]);

  useEffect(() => {
    if (!hasHydratedSettings) {
      return;
    }

    localStorage.setItem(STORAGE_KEYS.generationSettings, JSON.stringify(generationSettings));
  }, [hasHydratedSettings, generationSettings]);

  useEffect(() => {
    if (document.documentElement.dataset.theme !== generationSettings.theme) {
      document.documentElement.dataset.theme = generationSettings.theme;
    }
  }, [generationSettings.theme]);

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
