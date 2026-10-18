import { useState } from 'react';
import { useToast } from '../../hooks/useToast';
import { useAuth } from '../../hooks/useAuth';
import { useCan } from '../../hooks/useProjectRole';
import { useTemplates } from '../../hooks/useTemplates';
import type { Template, TemplateInput, TemplateKind } from '../../types/template';
import { boardApi, notesApi, templatesApi } from '../../utils/api';
import { PRIORITY_LABELS } from '../../utils/priority';
import { dueInDaysLabel } from '../../utils/templates';
import ConfirmDialog from '../ConfirmDialog';
import { NoteIcon, PencilIcon, TaskIcon, TrashIcon } from '../icons';
import TemplateDialog, { EMPTY_TASK_DEFAULTS, type TemplateBoardContext } from '../templates/TemplateDialog';
import Button from '../ui/Button';
import { iconButtonClass } from '../ui/styles';

const EMPTY: Record<TemplateKind, TemplateInput> = {
  note: { kind: 'note', scope: 'project', name: '', title: '', content: '', defaults: { tags: [] } },
  task: { kind: 'task', scope: 'project', name: '', title: '', content: '', defaults: EMPTY_TASK_DEFAULTS },
};

/** What a template sets besides its text, in a few words. */
function summary(template: Template): string {
  if (template.kind === 'note') return template.defaults.tags.length ? template.defaults.tags.map((t) => `#${t}`).join(' ') : '';
  const d = template.defaults;
  return [
    d.priority && `Priorität ${PRIORITY_LABELS[d.priority]}`,
    d.labels.length > 0 && `Labels: ${d.labels.join(', ')}`,
    d.column && `Spalte „${d.column}“`,
    d.lane && `Swimlane „${d.lane}“`,
    d.dueInDays !== null && `Fällig ${dueInDaysLabel(d.dueInDays)}`,
  ]
    .filter(Boolean)
    .join(' · ');
}

/** The templates this project can use: create, edit, delete. Changes are logged in this project. */
export default function TemplatesSection({ projectId, projectName }: { projectId: number; projectName: string }) {
  const toast = useToast();
  const { templates, reload } = useTemplates(projectId);
  const [editing, setEditing] = useState<{ template: Template | TemplateInput; board: TemplateBoardContext } | null>(null);
  const [deleting, setDeleting] = useState<Template | null>(null);
  // Project templates: members; templates for all projects: administrators (US-21).
  const canEdit = useCan('edit');
  const isAdmin = useAuth().session?.user?.systemRole === 'admin';
  const mayChange = (template: Template) => canEdit && (template.scope === 'project' || isAdmin);

  /** The editor offers this project's labels, columns, lanes and tags. */
  async function edit(template: Template | TemplateInput) {
    try {
      const [board, tags] = await Promise.all([boardApi.get(projectId), notesApi.tags(projectId)]);
      setEditing({
        template,
        board: { labels: board.labels, columns: board.columns.map((c) => c.name), lanes: board.lanes.map((l) => l.name), tags: tags.map((t) => t.name) },
      });
    } catch {
      toast({ message: 'Die Vorlage konnte nicht geöffnet werden.', tone: 'error' });
    }
  }

  async function remove(template: Template) {
    setDeleting(null);
    try {
      await templatesApi.remove(projectId, template.id);
      await reload();
      toast({ message: `Vorlage „${template.name}“ gelöscht.` });
    } catch {
      toast({ message: 'Die Vorlage konnte nicht gelöscht werden.', tone: 'error' });
    }
  }

  return (
    <section aria-label="Vorlagen" className="rounded-xl border border-line bg-surface p-5 shadow-card">
      <h2 className="text-sm font-semibold text-fg">Vorlagen</h2>
      <p className="mt-0.5 mb-4 text-sm text-fg-subtle">
        Vorlagen für neue Notizen und Tasks, für „{projectName}“ oder für alle Projekte. Platzhalter wie {'{{datum}}'} werden beim Anlegen ausgefüllt.
      </p>

      <ul className="divide-y divide-line rounded-lg border border-line">
        {templates.map((template) => (
          <li key={template.id} className="flex items-start gap-3 px-3 py-2.5">
            <span className="mt-0.5 text-fg-subtle" title={template.kind === 'note' ? 'Notizvorlage' : 'Taskvorlage'}>
              {template.kind === 'note' ? <NoteIcon /> : <TaskIcon />}
            </span>
            <div className="min-w-0 flex-1">
              <p className="flex flex-wrap items-center gap-2 text-sm font-medium text-fg">
                {template.name}
                <span className="rounded bg-surface-muted px-1.5 py-px text-[11px] font-normal text-fg-subtle ring-1 ring-line ring-inset">
                  {template.scope === 'global' ? 'Alle Projekte' : 'Dieses Projekt'}
                </span>
              </p>
              <p className="mt-0.5 truncate text-xs text-fg-subtle">
                {[template.title && `Titel: ${template.title}`, summary(template)].filter(Boolean).join(' · ') || 'Nur Text'}
              </p>
            </div>
            {mayChange(template) && (
              <>
                <button type="button" onClick={() => void edit(template)} aria-label={`„${template.name}“ bearbeiten`} className={iconButtonClass}>
                  <PencilIcon className="size-4" />
                </button>
                <button
                  type="button"
                  onClick={() => setDeleting(template)}
                  aria-label={`„${template.name}“ löschen`}
                  className={`${iconButtonClass} hover:text-danger-text`}
                >
                  <TrashIcon className="size-4" />
                </button>
              </>
            )}
          </li>
        ))}
        {templates.length === 0 && <li className="px-3 py-3 text-sm text-fg-subtle">Noch keine Vorlagen.</li>}
      </ul>

      {canEdit && (
        <div className="mt-3 flex flex-wrap gap-2">
          <Button size="sm" onClick={() => void edit(EMPTY.note)}>
            <NoteIcon className="size-3.5" />
            Neue Notizvorlage
          </Button>
          <Button size="sm" onClick={() => void edit(EMPTY.task)}>
            <TaskIcon className="size-3.5" />
            Neue Taskvorlage
          </Button>
        </div>
      )}

      {editing && (
        <TemplateDialog
          projectId={projectId}
          template={editing.template}
          board={editing.board}
          onSaved={(template) => {
            setEditing(null);
            void reload();
            toast({ message: `Vorlage „${template.name}“ gespeichert.` });
          }}
          onClose={() => setEditing(null)}
        />
      )}

      <ConfirmDialog
        open={deleting !== null}
        title="Vorlage löschen?"
        message={
          deleting
            ? `„${deleting.name}“ wird gelöscht${deleting.scope === 'global' ? ' – in allen Projekten' : ''}. Notizen und Tasks, die damit angelegt wurden, bleiben, wie sie sind.`
            : ''
        }
        confirmLabel="Löschen"
        onConfirm={() => deleting && void remove(deleting)}
        onCancel={() => setDeleting(null)}
      />
    </section>
  );
}
