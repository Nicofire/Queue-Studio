type PromptPresetEditorProps = {
  title: string;
  presetNames: string[];
  selectedPreset: string;
  value: string;
  onPresetChange: (presetName: string) => void;
  onValueChange: (value: string) => void;
  onSave: () => void;
};

export function PromptPresetEditor({
  title,
  presetNames,
  selectedPreset,
  value,
  onPresetChange,
  onValueChange,
  onSave,
}: PromptPresetEditorProps) {
  return (
    <div className="preset-card">
      <h3>{title}</h3>
      <label className="field-group">
        <span className="field-label">Preset</span>
        <select
          className="text-input"
          value={selectedPreset}
          onChange={(event) => onPresetChange(event.target.value)}
        >
          {presetNames.map((presetName) => (
            <option key={presetName} value={presetName}>
              {presetName}
            </option>
          ))}
        </select>
      </label>

      <label className="field-group">
        <span className="field-label">Prompt preset text</span>
        <textarea
          className="text-area"
          value={value}
          onChange={(event) => onValueChange(event.target.value)}
          rows={8}
        />
      </label>

      <div className="card-actions">
        <button type="button" className="primary-button" onClick={onSave}>
          Save preset
        </button>
        <p className="field-hint">Speichert Presets im Projektordner.</p>
      </div>
    </div>
  );
}
