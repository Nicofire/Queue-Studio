import type { Dispatch, SetStateAction } from 'react';
import { useMemo } from 'react';

import { PromptPresetEditor } from './PromptPresetEditor';
import { downloadJsonFile, saveJsonToProject } from './settingsApi';
import { REMOTE_JSON_PATHS } from './settingsConfig';
import type { PromptPresetGroup, SaveStatusHandlers } from './settingsTypes';

type PromptPresetsSectionProps = SaveStatusHandlers & {
  positivePresetGroup: PromptPresetGroup;
  negativePresetGroup: PromptPresetGroup;
  setPositivePresetGroup: Dispatch<SetStateAction<PromptPresetGroup>>;
  setNegativePresetGroup: Dispatch<SetStateAction<PromptPresetGroup>>;
};

export function PromptPresetsSection({
  positivePresetGroup,
  negativePresetGroup,
  setPositivePresetGroup,
  setNegativePresetGroup,
  setSaveResult,
  setSaveError,
}: PromptPresetsSectionProps) {
  const positivePresetNames = useMemo(
    () => Object.keys(positivePresetGroup.presets),
    [positivePresetGroup.presets]
  );
  const negativePresetNames = useMemo(
    () => Object.keys(negativePresetGroup.presets),
    [negativePresetGroup.presets]
  );

  return (
    <section className="settings-section">
      <div className="settings-header">
        <p className="panel-label">Settings</p>
        <h2>Prompt presets</h2>
      </div>
      <div className="settings-grid two-columns">
        <PromptPresetEditor
          title="Positive prompt preset"
          presetNames={positivePresetNames}
          selectedPreset={positivePresetGroup.selectedPreset}
          value={positivePresetGroup.presets[positivePresetGroup.selectedPreset] ?? ''}
          onPresetChange={(presetName) =>
            setPositivePresetGroup((current) => ({
              ...current,
              selectedPreset: presetName,
            }))
          }
          onValueChange={(value) =>
            setPositivePresetGroup((current) => ({
              ...current,
              presets: {
                ...current.presets,
                [current.selectedPreset]: value,
              },
            }))
          }
          onSave={() => {
            void (async () => {
              try {
                await saveJsonToProject(REMOTE_JSON_PATHS.positivePresets, positivePresetGroup);
                setSaveResult('Positive presets saved.');
                setSaveError(false);
              } catch (error) {
                setSaveResult(
                  error instanceof Error
                    ? `Could not save positive presets: ${error.message}`
                    : 'Could not save positive presets.'
                );
                setSaveError(true);
                downloadJsonFile('positive-presets.json', positivePresetGroup);
              }
            })();
          }}
        />

        <PromptPresetEditor
          title="Negative prompt preset"
          presetNames={negativePresetNames}
          selectedPreset={negativePresetGroup.selectedPreset}
          value={negativePresetGroup.presets[negativePresetGroup.selectedPreset] ?? ''}
          onPresetChange={(presetName) =>
            setNegativePresetGroup((current) => ({
              ...current,
              selectedPreset: presetName,
            }))
          }
          onValueChange={(value) =>
            setNegativePresetGroup((current) => ({
              ...current,
              presets: {
                ...current.presets,
                [current.selectedPreset]: value,
              },
            }))
          }
          onSave={() => {
            void (async () => {
              try {
                await saveJsonToProject(REMOTE_JSON_PATHS.negativePresets, negativePresetGroup);
                setSaveResult('Negative presets saved.');
                setSaveError(false);
              } catch (error) {
                setSaveResult(
                  error instanceof Error
                    ? `Could not save negative presets: ${error.message}`
                    : 'Could not save negative presets.'
                );
                setSaveError(true);
                downloadJsonFile('negative-presets.json', negativePresetGroup);
              }
            })();
          }}
        />
      </div>
    </section>
  );
}
