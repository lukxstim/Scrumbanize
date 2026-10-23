import { useState } from 'react';
import type { TaskTemplate } from '../../types/template';
import { PlusIcon } from '../icons';
import { fieldClass } from '../ui/styles';

interface NewTaskFormProps {
  onCreate: (title: string) => Promise<unknown>;
  /** Task templates to start from; the chosen one fills in description, labels, priority and more. */
  templates?: TaskTemplate[];
  /** `title` is what was typed (may be empty: the template's title is used then). */
  onCreateFromTemplate?: (template: TaskTemplate, title: string) => Promise<unknown>;
  /** Starts with the field open, e.g. for "Neuer Task" from the command palette. */
  defaultOpen?: boolean;
}

const selectClass = `!w-full !py-0.5 !pl-1.5 !text-[11px] ${fieldClass}`;

/** "+ Task" in the first column of each lane: Enter creates the task and keeps the field open for the next one. */
export default function NewTaskForm({ onCreate, templates = [], onCreateFromTemplate, defaultOpen = false }: NewTaskFormProps) {
  const [open, setOpen] = useState(defaultOpen);
  const [title, setTitle] = useState('');
  const [templateId, setTemplateId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState(false);
  const template = templates.find((t) => t.id === templateId);

  async function submit() {
    // With a template, the title may stay empty: the template has one.
    if (!title.trim() && !template) return;
    setSaving(true);
    setFailed(false);
    try {
      if (template && onCreateFromTemplate) await onCreateFromTemplate(template, title.trim());
      else await onCreate(title.trim());
      setTitle('');
    } catch {
      setFailed(true);
    } finally {
      setSaving(false);
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex w-full items-center gap-1.5 rounded-lg px-2 py-1.5 text-left text-sm font-medium text-fg-subtle transition-colors duration-150 hover:bg-surface-strong hover:text-fg"
      >
        <PlusIcon />
        Task
      </button>
    );
  }

  const close = () => {
    setOpen(false);
    setTitle('');
    setTemplateId(null);
  };
  return (
    <form
      className="animate-pop-in"
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
      onBlur={(event) => {
        // Closes when focus leaves the whole form (not when moving from the field to the template choice).
        if (!title.trim() && !template && !event.currentTarget.contains(event.relatedTarget as Node | null)) setOpen(false);
      }}
      onKeyDown={(event) => {
        if (event.key === 'Escape') close();
      }}
    >
      <input
        autoComplete="off"
        enterKeyHint="done"
        value={title}
        onChange={(event) => setTitle(event.target.value)}
        disabled={saving}
        autoFocus
        maxLength={200}
        placeholder={template ? `${template.title.trim() || template.name} …` : 'Titel des Tasks …'}
        aria-label="Titel des neuen Tasks"
        className={`px-2 ${fieldClass}`}
      />
      {templates.length > 0 && onCreateFromTemplate && (
        <select
          value={templateId ?? ''}
          onChange={(event) => setTemplateId(event.target.value ? Number(event.target.value) : null)}
          aria-label="Vorlage für den neuen Task"
          className={`mt-1 ${selectClass}`}
        >
          <option value="">Ohne Vorlage</option>
          {templates.map((t) => (
            <option key={t.id} value={t.id}>
              Vorlage: {t.name}
            </option>
          ))}
        </select>
      )}
      <p className="mt-1 text-[11px] text-fg-subtle">{template ? 'Enter legt den Task an und öffnet ihn' : 'Enter zum Anlegen, Esc zum Abbrechen'}</p>
      {failed && (
        <p role="alert" className="mt-1 text-xs text-danger-text">
          Der Task konnte nicht angelegt werden.
        </p>
      )}
    </form>
  );
}
