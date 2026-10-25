import { Cable, MessageSquareText, Palette } from 'lucide-react';
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
  const [section, setSection] = useState<'connection' | 'presets' | 'appearance'>('connection');

  return (
    <div className="settings-page">
      <nav className="settings-subnav" aria-label="Settings sections">
        {(
          [
            { id: 'connection', label: 'Connection & generation', icon: Cable },
            { id: 'presets', label: 'Prompt presets', icon: MessageSquareText },
            { id: 'appearance', label: 'Appearance', icon: Palette },
          ] as const
        ).map((item) => (
          <button
            key={item.id}
            type="button"
            className={section === item.id ? 'settings-nav-item is-active' : 'settings-nav-item'}
            aria-current={section === item.id ? 'page' : undefined}
            onClick={() => setSection(item.id)}
          >
            <item.icon size={16} />
            {item.label}
          </button>
        ))}
      </nav>
      <div className="settings-content" hidden={section !== 'presets'}>
        <PromptPresetsSection
          positivePresetGroup={positivePresetGroup}
          negativePresetGroup={negativePresetGroup}
          setPositivePresetGroup={setPositivePresetGroup}
          setNegativePresetGroup={setNegativePresetGroup}
          setSaveResult={setSaveResult}
          setSaveError={setSaveError}
        />

        <details className="effective-prompt-details">
          <summary>Effective prompt</summary>
          <EffectivePromptSection
            positivePresetGroup={positivePresetGroup}
            negativePresetGroup={negativePresetGroup}
          />
        </details>
        {saveResult ? (
          <p role="status" className={`field-hint ${saveError ? 'is-error' : 'is-success'}`}>
            {saveResult}
          </p>
        ) : null}
      </div>
      <div className="settings-content" hidden={section === 'presets'}>
        <Automatic1111ConnectionSection
          section={section === 'appearance' ? 'appearance' : 'connection'}
          generationSettings={generationSettings}
          setGenerationSettings={setGenerationSettings}
        />
      </div>
    </div>
  );
}
