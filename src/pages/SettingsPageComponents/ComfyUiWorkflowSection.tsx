import { Pencil, Save, Trash2, Upload, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { IconButton } from '../../components/IconButton';
import { Modal } from '../../components/Modal';
import {
  inferWorkflowBindings,
  parseWorkflowPreset,
  WORKFLOW_FIELDS,
  type WorkflowPreset,
} from '../../features/generation/comfyWorkflow';
import { asRecord } from '../../features/settings/generationSettings';
import { requestGenerationJson } from './settingsApi';

type Props = {
  workflowId: string;
  onSelect: (id: string) => void;
  onWorkflowChange: (workflow: WorkflowPreset | null) => void;
};
const FIELD_LABELS = {
  positivePrompt: 'Positive prompt',
  negativePrompt: 'Negative prompt',
  model: 'Checkpoint / model',
  seed: 'Seed',
  steps: 'Steps',
  width: 'Width',
  height: 'Height',
  batchSize: 'Batch size',
};

export function ComfyUiWorkflowSection({ workflowId, onSelect, onWorkflowChange }: Props) {
  const [workflows, setWorkflows] = useState<WorkflowPreset[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<WorkflowPreset | null>(null);
  const [deleting, setDeleting] = useState<WorkflowPreset | null>(null);
  const [pending, setPending] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const controller = new AbortController();
    void requestGenerationJson<WorkflowPreset[]>('/api/generation/workflows', {
      signal: controller.signal,
    })
      .then((result) => {
        if (!controller.signal.aborted) {
          setWorkflows(result);
          onWorkflowChange(result.find((workflow) => workflow.id === workflowId) ?? null);
        }
      })
      .catch((cause) => {
        if (!controller.signal.aborted)
          setError(cause instanceof Error ? cause.message : 'Could not load workflows.');
      });
    return () => controller.abort();
  }, [workflowId, onWorkflowChange]);

  async function importFile(file: File) {
    setError(null);
    try {
      if (file.size > 2 * 1024 * 1024)
        throw new Error('Workflow files must be smaller than 2 MiB.');
      const source = asRecord(JSON.parse(await file.text()));
      const graph = asRecord(source.graph ?? source);
      const outputNodeIds = Object.entries(graph)
        .filter(([, node]) =>
          ['PreviewImage', 'SaveImage'].includes(String(asRecord(node).class_type))
        )
        .map(([id]) => id);
      const specifiedOutputs = source.graph ? source.outputNodeIds : undefined;
      if (
        specifiedOutputs !== undefined &&
        (!Array.isArray(specifiedOutputs) || specifiedOutputs.some((id) => typeof id !== 'string'))
      ) {
        throw new Error('Workflow outputNodeIds must be an array of node IDs.');
      }
      const envelope = {
        name: typeof source.name === 'string' ? source.name : file.name.replace(/\.json$/i, ''),
        graph,
        bindings: source.graph ? (source.bindings ?? {}) : {},
        outputNodeIds: Array.isArray(specifiedOutputs)
          ? specifiedOutputs.map(String)
          : outputNodeIds,
      };
      const checked = parseWorkflowPreset(
        {
          ...envelope,
          outputNodeIds: envelope.outputNodeIds.length
            ? envelope.outputNodeIds
            : [Object.keys(graph)[0]],
        },
        ''
      );
      setDraft({
        ...checked,
        bindings: source.graph ? checked.bindings : inferWorkflowBindings(checked.graph),
        outputNodeIds: envelope.outputNodeIds,
      });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not import workflow.');
    }
  }

  async function saveDraft() {
    if (!draft || pending) return;
    setPending(true);
    setError(null);
    try {
      const payload = parseWorkflowPreset(draft, draft.id);
      const saved = await requestGenerationJson<WorkflowPreset>(
        `/api/generation/workflows${draft.id ? `/${encodeURIComponent(draft.id)}` : ''}`,
        {
          method: draft.id ? 'PUT' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        }
      );
      setWorkflows((current) => [...current.filter((workflow) => workflow.id !== saved.id), saved]);
      if (saved.id === workflowId) onWorkflowChange(saved);
      onSelect(saved.id);
      setDraft(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not save workflow.');
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="field-group">
      <label className="field-label" htmlFor="comfy-workflow">
        Workflow
      </label>
      <select
        id="comfy-workflow"
        className="text-input"
        value={workflowId}
        onChange={(event) => {
          onSelect(event.target.value);
          onWorkflowChange(
            workflows.find((workflow) => workflow.id === event.target.value) ?? null
          );
        }}
      >
        {!workflows.some((workflow) => workflow.id === workflowId) ? (
          <option value={workflowId}>
            {workflowId === 'builtin-txt2img' ? 'Standard txt2img (SD 1.5 / SDXL)' : workflowId}
          </option>
        ) : null}
        {workflows.map((workflow) => (
          <option key={workflow.id} value={workflow.id}>
            {workflow.name}
          </option>
        ))}
      </select>
      <input
        ref={fileInput}
        type="file"
        accept="application/json,.json"
        hidden
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) void importFile(file);
          event.target.value = '';
        }}
      />
      <div className="inline-actions">
        <button
          type="button"
          className="secondary-button"
          disabled={pending}
          onClick={() => fileInput.current?.click()}
        >
          <Upload size={16} />
          Import API workflow
        </button>
      </div>
      <details>
        <summary>Workflow presets</summary>
        <ul className="workflow-list">
          {workflows.map((workflow) => (
            <li key={workflow.id}>
              <span>{workflow.name}</span>
              <div className="inline-actions">
                <IconButton
                  label={`Edit ${workflow.name}`}
                  disabled={workflow.builtin || pending}
                  onClick={() => {
                    setError(null);
                    setDraft(structuredClone(workflow));
                  }}
                >
                  <Pencil size={16} />
                </IconButton>
                <IconButton
                  label={`Delete ${workflow.name}`}
                  disabled={workflow.builtin || workflow.id === workflowId || pending}
                  onClick={() => setDeleting(workflow)}
                >
                  <Trash2 size={16} />
                </IconButton>
              </div>
            </li>
          ))}
        </ul>
      </details>
      {deleting ? (
        <div role="alert" className="field-group">
          <span>Delete workflow "{deleting.name}"?</span>
          <div className="inline-actions">
            <button
              type="button"
              className="secondary-button"
              disabled={pending}
              onClick={() => setDeleting(null)}
            >
              Cancel
            </button>
            <button
              type="button"
              className="danger-button"
              disabled={pending}
              onClick={async () => {
                setPending(true);
                setError(null);
                try {
                  await requestGenerationJson(
                    `/api/generation/workflows/${encodeURIComponent(deleting.id)}`,
                    { method: 'DELETE' }
                  );
                  setWorkflows((current) =>
                    current.filter((workflow) => workflow.id !== deleting.id)
                  );
                  setDeleting(null);
                } catch (cause) {
                  setError(cause instanceof Error ? cause.message : 'Could not delete workflow.');
                } finally {
                  setPending(false);
                }
              }}
            >
              <Trash2 size={16} />
              Delete workflow
            </button>
          </div>
        </div>
      ) : null}
      {error && !draft ? (
        <p role="alert" className="field-hint is-error">
          {error}
        </p>
      ) : null}
      {draft ? (
        <Modal
          titleId="workflow-title"
          className="entry-modal workflow-modal"
          onRequestClose={() => {
            if (!pending) setDraft(null);
          }}
        >
          <header className="modal-header">
            <h2 id="workflow-title">{draft.id ? 'Edit workflow' : 'Import API workflow'}</h2>
            <IconButton
              label="Close workflow editor"
              disabled={pending}
              onClick={() => setDraft(null)}
            >
              <X size={18} />
            </IconButton>
          </header>
          <div className="modal-body">
            <div className="field-group">
              <label className="field-group">
                <span className="field-label">Workflow name</span>
                <input
                  className="text-input"
                  value={draft.name}
                  maxLength={120}
                  disabled={pending}
                  onChange={(event) => setDraft({ ...draft, name: event.target.value })}
                />
              </label>
              <div className="workflow-bindings">
                {WORKFLOW_FIELDS.map((field) => (
                  <label className="field-group" key={field}>
                    <span className="field-label">{FIELD_LABELS[field]}</span>
                    <select
                      className="text-input"
                      aria-label={FIELD_LABELS[field]}
                      multiple
                      size={3}
                      disabled={pending}
                      value={(draft.bindings[field] ?? []).map(
                        (binding) => `${binding.nodeId}:${binding.input}`
                      )}
                      onChange={(event) => {
                        const targets = Array.from(event.target.selectedOptions, (option) => {
                          const separator = option.value.indexOf(':');
                          return {
                            nodeId: option.value.slice(0, separator),
                            input: option.value.slice(separator + 1),
                          };
                        });
                        setDraft({
                          ...draft,
                          bindings: { ...draft.bindings, [field]: targets },
                        });
                      }}
                    >
                      {Object.entries(draft.graph).flatMap(([nodeId, node]) =>
                        Object.entries(node.inputs)
                          .filter(
                            ([, value]) =>
                              typeof value ===
                              (['positivePrompt', 'negativePrompt', 'model'].includes(field)
                                ? 'string'
                                : 'number')
                          )
                          .map(([input]) => (
                            <option key={`${nodeId}:${input}`} value={`${nodeId}:${input}`}>
                              {nodeId} / {node.class_type} / {input}
                            </option>
                          ))
                      )}
                    </select>
                    <span className="field-hint">
                      {draft.bindings[field]?.length
                        ? draft.bindings[field]!.map(
                            (binding) => `${binding.nodeId} / ${binding.input}`
                          ).join(', ')
                        : 'Workflow-controlled'}
                    </span>
                  </label>
                ))}
              </div>
              <label className="field-group">
                <span className="field-label">Image output nodes</span>
                <select
                  className="text-input"
                  multiple
                  size={4}
                  disabled={pending}
                  value={draft.outputNodeIds}
                  onChange={(event) =>
                    setDraft({
                      ...draft,
                      outputNodeIds: Array.from(
                        event.target.selectedOptions,
                        (option) => option.value
                      ),
                    })
                  }
                >
                  {Object.entries(draft.graph).map(([id, node]) => (
                    <option key={id} value={id}>
                      {id} / {node.class_type}
                    </option>
                  ))}
                </select>
              </label>
              {error ? (
                <p role="alert" className="field-hint is-error">
                  {error}
                </p>
              ) : null}
            </div>
          </div>
          <footer className="modal-footer">
            <button
              type="button"
              className="secondary-button"
              disabled={pending}
              onClick={() => setDraft(null)}
            >
              Cancel
            </button>
            <button
              type="button"
              className="primary-button"
              disabled={pending}
              onClick={() => void saveDraft()}
            >
              <Save size={16} />
              {pending ? 'Saving...' : 'Save workflow'}
            </button>
          </footer>
        </Modal>
      ) : null}
    </div>
  );
}
