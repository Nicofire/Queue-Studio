import { useEffect, useState } from 'react';

import {
  fetchJson,
  fromPersistedGenerationSettings,
  readStoredJson,
} from '../../pages/SettingsPageComponents/settingsApi';
import {
  DEFAULT_GENERATION_SETTINGS,
  DEFAULT_NEGATIVE_PRESETS,
  DEFAULT_POSITIVE_PRESETS,
  REMOTE_JSON_PATHS,
  STORAGE_KEYS,
} from '../../pages/SettingsPageComponents/settingsConfig';
import type {
  GenerationSettings,
  PromptPresetGroup,
} from '../../pages/SettingsPageComponents/settingsTypes';

function getInitialGenerationSettings() {
  const rootTheme = document.documentElement.dataset.theme;
  const fallback: GenerationSettings = {
    ...DEFAULT_GENERATION_SETTINGS,
    theme:
      rootTheme === 'dark' || rootTheme === 'light' ? rootTheme : DEFAULT_GENERATION_SETTINGS.theme,
  };

  const stored = readStoredJson<unknown>(STORAGE_KEYS.generationSettings);
  try {
    return fromPersistedGenerationSettings(stored, fallback);
  } catch {
    return fallback;
  }
}

/**
 * Owns presets and connection settings at app level so the settings page and the
 * generation queue read the same state.
 */
export function useProjectSettings() {
  const [positivePresetGroup, setPositivePresetGroup] =
    useState<PromptPresetGroup>(DEFAULT_POSITIVE_PRESETS);
  const [negativePresetGroup, setNegativePresetGroup] =
    useState<PromptPresetGroup>(DEFAULT_NEGATIVE_PRESETS);
  const [generationSettings, setGenerationSettings] = useState<GenerationSettings>(
    getInitialGenerationSettings
  );
  const [hasHydratedSettings, setHasHydratedSettings] = useState(false);
  const [settingsError, setSettingsError] = useState<string | null>(null);

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

      setPositivePresetGroup(
        remotePositivePresets ?? storedPositivePresets ?? DEFAULT_POSITIVE_PRESETS
      );
      setNegativePresetGroup(
        remoteNegativePresets ?? storedNegativePresets ?? DEFAULT_NEGATIVE_PRESETS
      );
      try {
        setGenerationSettings(
          fromPersistedGenerationSettings(
            remoteGenerationSettingsRaw ?? storedGenerationSettings,
            DEFAULT_GENERATION_SETTINGS
          )
        );
        setSettingsError(null);
      } catch (error) {
        setSettingsError(
          error instanceof Error ? error.message : 'Could not load generation settings.'
        );
      }
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
    if (!hasHydratedSettings || settingsError) {
      return;
    }

    localStorage.setItem(STORAGE_KEYS.generationSettings, JSON.stringify(generationSettings));
  }, [hasHydratedSettings, generationSettings, settingsError]);

  useEffect(() => {
    if (document.documentElement.dataset.theme !== generationSettings.theme) {
      document.documentElement.dataset.theme = generationSettings.theme;
    }
  }, [generationSettings.theme]);

  return {
    positivePresetGroup,
    setPositivePresetGroup,
    negativePresetGroup,
    setNegativePresetGroup,
    generationSettings,
    setGenerationSettings,
    hasHydratedSettings,
    settingsError,
  };
}
