import { useState } from 'react';
import { useAuth } from '../../hooks/useAuth';
import type { TaskPriority } from '../../types/task';
import { TASK_PRIORITIES } from '../../types/task';
import type { NoteTemplateDefaults, TaskTemplateDefaults, Template, TemplateInput, TemplateKind } from '../../types/template';
import { ApiError, templatesApi } from '../../utils/api';
import { findByName } from '../../utils/labels';
import { PRIORITY_LABELS } from '../../utils/priority';
import { PLACEHOLDERS } from '../../utils/templates';
import MarkdownEditor from '../editor/MarkdownEditor';
import TagInput from '../notes/TagInput';
import { LabelChip } from '../tasks/LabelChip';
import Button from '../ui/Button';
import Dialog from '../ui/Dialog';
import { fieldClass, labelClass } from '../ui/styles';
import type { Label } from '../../types/task';

/** What the project offers to pick from for task templates (all by name). */
export interface TemplateBoardContext {
  labels: Label[];
  columns: string[];
  lanes: string[];
  tags: string[];
}

export const EMPTY_TASK_DEFAULTS: TaskTemplateDefaults = { priority: null, labels: [], column: null, lane: null, dueInDays: null };

interface TemplateDialogProps {
  projectId: number;
  /** An existing template to edit, or the start values of a new one (e.g. from "Als Vorlage speichern"). */
  template: Template | TemplateInput;
  board: TemplateBoardContext;
  onSaved: (template: Template) => void;
  onClose: () => void;
}

const isSaved = (template: Template | TemplateInput): template is Template => 'id' in template;

const ERRORS: Record<string, string> = {
  name_taken: 'Es gibt schon eine Vorlage mit diesem Namen (für dieses Projekt bzw. für alle Projekte).',
  limit_reached: 'Es können höchstens 50 Vorlagen sein.',
};

/** Create or edit a note or task template. */
export default function TemplateDialog({ projectId, template, board, onSaved, onClose }: TemplateDialogProps) {
  const kind: TemplateKind = template.kind;
  const [name, setName] = useState(template.name);
  const [scope, setScope] = useState(template.scope);
  // Templates for all projects belong to everyone, so only administrators make them (US-21).
  const isAdmin = useAuth().session?.user?.systemRole === 'admin';
  const [title, setTitle] = useState(template.title);
  const [content, setContent] = useState(template.content);
  const [noteDefaults, setNoteDefaults] = useState<NoteTemplateDefaults>(kind === 'note' ? (template.defaults as NoteTemplateDefaults) : { tags: [] });
  const [taskDefaults, setTaskDefaults] = useState<TaskTemplateDefaults>(
    kind === 'task' ? (template.defaults as TaskTemplateDefaults) : EMPTY_TASK_DEFAULTS,
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    if (!name.trim()) return;
    setSaving(true);
    setError(null);
    const fields = { name: name.trim(), scope, title, content };
    try {
      const saved = isSaved(template)
        ? await templatesApi.update(projectId, template.id, { ...fields, defaults: kind === 'note' ? noteDefaults : taskDefaults })
        : await templatesApi.create(
            projectId,
            kind === 'note' ? { kind: 'note', ...fields, defaults: noteDefaults } : { kind: 'task', ...fields, defaults: taskDefaults },
          );
      onSaved(saved);
    } catch (e) {
      setError((e instanceof ApiError && ERRORS[e.code]) || 'Die Vorlage konnte nicht gespeichert werden.');
      setSaving(false);
    }
  }

  const setTask = (patch: Partial<TaskTemplateDefaults>) => setTaskDefaults((current) => ({ ...current, ...patch }));
  const toggleLabel = (labelName: string) =>
    setTask({
      labels: taskDefaults.labels.some((l) => l.toLocaleLowerCase('de') === labelName.toLocaleLowerCase('de'))
        ? taskDefaults.labels.filter((l) => l.toLocaleLowerCase('de') !== labelName.toLocaleLowerCase('de'))
        : [...taskDefaults.labels, labelName],
    });
  // Labels a template names that this project does not have (e.g. a template for all projects).
  const foreignLabels = taskDefaults.labels.filter((l) => !findByName(board.labels, l));

  return (
    <Dialog onClose={onClose} labelledBy="template-title" dismissible={!saving} className="flex max-h-[90vh] max-w-2xl flex-col p-0">
      <div className="border-b border-line px-6 py-4">
        <h2 id="template-title" className="text-base font-semibold text-fg">
          {isSaved(template) ? 'Vorlage bearbeiten' : kind === 'note' ? 'Neue Notizvorlage' : 'Neue Taskvorlage'}
        </h2>
      </div>

      <form
        id="template-form"
        className="min-h-0 flex-1 space-y-4 overflow-y-auto px-6 py-5"
        onSubmit={(event) => {
          event.preventDefault();
          void save();
        }}
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="template-name" className={labelClass}>
              Name der Vorlage
            </label>
            <input
              id="template-name"
              data-autofocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={60}
              required
              placeholder={kind === 'note' ? 'z. B. Meeting-Protokoll' : 'z. B. Bug-Report'}
              className={`mt-1 ${fieldClass}`}
            />
          </div>
          <div>
            <label htmlFor="template-scope" className={labelClass}>
              Gilt für
            </label>
            <select id="template-scope" value={scope} onChange={(e) => setScope(e.target.value as 'project' | 'global')} className={`mt-1 ${fieldClass}`}>
              <option value="project">Nur dieses Projekt</option>
              <option value="global" disabled={!isAdmin}>
                {isAdmin ? 'Alle Projekte' : 'Alle Projekte (nur für Administratoren)'}
              </option>
            </select>
          </div>
        </div>

        <div>
          <label htmlFor="template-title-field" className={labelClass}>
            Titel {kind === 'note' ? 'der Notiz' : 'des Tasks'}
          </label>
          <input
            id="template-title-field"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={200}
            placeholder={kind === 'note' ? 'z. B. Meeting {{datum}}' : 'z. B. Bug: '}
            className={`mt-1 ${fieldClass}`}
          />
          <p className="mt-1 text-xs text-fg-subtle">
            Platzhalter: {PLACEHOLDERS.map((p) => `${p.key} (${p.example})`).join(' · ')}. Sie gelten auch im Text.
          </p>
        </div>

        <div>
          <span className={labelClass}>{kind === 'note' ? 'Inhalt' : 'Beschreibung'}</span>
          <div className="mt-1 rounded-md border border-line px-3 pb-3">
            <MarkdownEditor value={content} onChange={setContent} label={kind === 'note' ? 'Inhalt' : 'Beschreibung'} minHeightClass="min-h-40" />
          </div>
        </div>

        {kind === 'note' ? (
          <div>
            <span className={labelClass}>Tags der neuen Notiz</span>
            <div className="mt-1">
              <TagInput tags={noteDefaults.tags} suggestions={board.tags} onChange={(tags) => setNoteDefaults({ tags })} />
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="template-priority" className={labelClass}>
                  Priorität
                </label>
                <select
                  id="template-priority"
                  value={taskDefaults.priority ?? ''}
                  onChange={(e) => setTask({ priority: (e.target.value || null) as TaskPriority | null })}
                  className={`mt-1 ${fieldClass}`}
                >
                  <option value="">Keine</option>
                  {TASK_PRIORITIES.map((p) => (
                    <option key={p} value={p}>
                      {PRIORITY_LABELS[p]}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="template-due" className={labelClass}>
                  Fällig
                </label>
                <div className="mt-1 flex items-center gap-2">
                  <select
                    id="template-due"
                    value={taskDefaults.dueInDays === null ? 'none' : 'days'}
                    onChange={(e) => setTask({ dueInDays: e.target.value === 'none' ? null : 7 })}
                    className={fieldClass}
                  >
                    <option value="none">Kein Termin</option>
                    <option value="days">Nach Tagen</option>
                  </select>
                  {taskDefaults.dueInDays !== null && (
                    <label className="flex shrink-0 items-center gap-1 text-sm text-fg-muted">
                      +
                      <input
                        type="number"
                        min={0}
                        max={365}
                        value={taskDefaults.dueInDays}
                        onChange={(e) => setTask({ dueInDays: Math.max(0, Math.min(365, Number(e.target.value) || 0)) })}
                        aria-label="Fällig nach Tagen"
                        className={`!w-20 ${fieldClass}`}
                      />
                      Tage
                    </label>
                  )}
                </div>
              </div>
              <div>
                <label htmlFor="template-column" className={labelClass}>
                  Spalte
                </label>
                <select
                  id="template-column"
                  value={taskDefaults.column ?? ''}
                  onChange={(e) => setTask({ column: e.target.value || null })}
                  className={`mt-1 ${fieldClass}`}
                >
                  <option value="">Erste Spalte</option>
                  {[...new Set([...board.columns, ...(taskDefaults.column ? [taskDefaults.column] : [])])].map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="template-lane" className={labelClass}>
                  Swimlane
                </label>
                <select
                  id="template-lane"
                  value={taskDefaults.lane ?? ''}
                  onChange={(e) => setTask({ lane: e.target.value || null })}
                  className={`mt-1 ${fieldClass}`}
                >
                  <option value="">Wo der Task angelegt wird</option>
                  {[...new Set([...board.lanes, ...(taskDefaults.lane ? [taskDefaults.lane] : [])])].map((l) => (
                    <option key={l} value={l}>
                      {l}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div>
              <span className={labelClass}>Labels</span>
              <div className="mt-1 flex flex-wrap gap-1.5">
                {board.labels.map((label) => {
                  const on = taskDefaults.labels.some((l) => l.toLocaleLowerCase('de') === label.name.toLocaleLowerCase('de'));
                  return (
                    <button
                      key={label.id}
                      type="button"
                      aria-pressed={on}
                      onClick={() => toggleLabel(label.name)}
                      className={`rounded focus-visible:outline-2 focus-visible:outline-accent ${on ? '' : 'opacity-45 hover:opacity-80'}`}
                    >
                      <LabelChip label={label} />
                    </button>
                  );
                })}
                {foreignLabels.map((labelName) => (
                  <button
                    key={labelName}
                    type="button"
                    onClick={() => toggleLabel(labelName)}
                    title="Dieses Projekt hat kein Label mit diesem Namen; in anderen Projekten wird es zugewiesen. Klicken entfernt es."
                    className="rounded border border-dashed border-line-strong px-1.5 py-px text-[11px] text-fg-subtle"
                  >
                    {labelName} ×
                  </button>
                ))}
                {board.labels.length === 0 && foreignLabels.length === 0 && <span className="text-sm text-fg-subtle">Dieses Projekt hat keine Labels.</span>}
              </div>
              {scope === 'global' && (
                <p className="mt-1 text-xs text-fg-subtle">
                  Labels, Spalte und Swimlane werden in jedem Projekt nach ihrem Namen gesucht; fehlt eines, bleibt es weg.
                </p>
              )}
            </div>
          </div>
        )}

        {error && (
          <p role="alert" className="rounded-lg bg-danger-muted px-3 py-2 text-sm text-danger-text">
            {error}
          </p>
        )}
      </form>

      <div className="flex justify-end gap-2 border-t border-line px-6 py-3">
        <Button variant="ghost" onClick={onClose} disabled={saving}>
          Abbrechen
        </Button>
        <Button type="submit" form="template-form" variant="primary" disabled={saving || !name.trim()}>
          Speichern
        </Button>
      </div>
    </Dialog>
  );
}
