import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { useAuth } from '../../hooks/useAuth';
import { useProjects } from '../../hooks/useProjects';
import { requestNewProject } from '../../utils/appEvents';
import { notesApi } from '../../utils/api';
import { allNotesPath, paths } from '../../utils/paths';
import { ROLE_LABELS } from '../../utils/permissions';
import { countLabel, ofKind } from '../../utils/projects';
import { NoteIcon, PlusIcon } from '../icons';
import NotebookSymbol from '../projects/NotebookSymbol';
import { ProjectsLoading } from '../projects/RedirectToProject';
import Button, { buttonClass } from '../ui/Button';

/**
 * /wissen (US-22): all notebooks – knowledge that belongs to no project, like recipes, course notes or ideas. They are
 * personal until shared through their members. Above them the way to "Alle Notizen", below them the tags of all notes
 * the user can see, in projects too.
 */
export default function KnowledgePage() {
  const { projects, status, reload } = useProjects();
  const withMembers = useAuth().session?.mode === 'required';
  const notebooks = ofKind(projects, 'notebook');
  const [tags, setTags] = useState<{ name: string; noteCount: number }[]>([]);

  // Current note counts and tags.
  useEffect(() => {
    void reload();
    notesApi.allTags().then(setTags, () => {
      // Without tags, the overview still shows the notebooks.
    });
  }, [reload]);

  if (status !== 'ready') return <ProjectsLoading />;

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-0 flex-1">
            <h1 className="text-xl font-semibold tracking-tight text-fg">Wissen</h1>
            <p className="mt-1 text-sm text-fg-subtle">Notizbücher für alles, was zu keinem Projekt gehört.</p>
          </div>
          <Link to={allNotesPath()} className={buttonClass('secondary')}>
            <NoteIcon className="size-4" />
            Alle Notizen
          </Link>
          {notebooks.length > 0 && (
            <Button variant="primary" onClick={() => requestNewProject('notebook')}>
              <PlusIcon className="size-4" />
              Neues Notizbuch
            </Button>
          )}
        </div>

        {notebooks.length === 0 ? (
          <div className="mt-16 flex justify-center">
            <div className="max-w-sm text-center">
              <span className="mx-auto grid size-12 place-items-center rounded-xl bg-surface-muted text-fg-subtle ring-1 ring-line [&_svg]:size-6">
                <NoteIcon />
              </span>
              <h2 className="mt-4 text-base font-semibold text-fg">Noch keine Notizbücher</h2>
              <p className="mt-1 text-sm text-fg-subtle">
                Ein Notizbuch hat Notizen und Ordner, aber kein Board – etwa für Rezepte, Mitschriften oder Ideen.
              </p>
              <Button variant="primary" className="mt-5" onClick={() => requestNewProject('notebook')}>
                Neues Notizbuch
              </Button>
            </div>
          </div>
        ) : (
          <ul className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {notebooks.map((notebook) => (
              <li key={notebook.id}>
                <Link
                  to={paths.notes(notebook.id)}
                  className="flex items-start gap-3 rounded-xl border border-line bg-surface p-4 shadow-card transition-[border-color,box-shadow] duration-150 hover:border-line-strong hover:shadow-card-hover focus-visible:outline-2 focus-visible:outline-accent"
                >
                  <NotebookSymbol icon={notebook.icon} color={notebook.color} size="lg" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-fg">{notebook.name}</span>
                    <span className="mt-0.5 block text-xs text-fg-subtle">
                      {countLabel(notebook.noteCount, 'Notiz', 'Notizen')}
                    </span>
                    {withMembers && notebook.role !== 'owner' && (
                      <span className="mt-1.5 inline-block rounded bg-surface-muted px-1.5 py-0.5 text-[11px] font-medium text-fg-subtle">
                        Geteilt · {ROLE_LABELS[notebook.role]}
                      </span>
                    )}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}

        {tags.length > 0 && (
          <section aria-labelledby="knowledge-tags" className="mt-10">
            <h2 id="knowledge-tags" className="text-sm font-semibold text-fg">
              Tags
            </h2>
            <p className="mt-0.5 text-sm text-fg-subtle">Aus allen Projekten und Notizbüchern. Ein Tag zeigt alle Notizen damit.</p>
            <ul className="mt-3 flex flex-wrap gap-1.5">
              {tags.map((tag) => (
                <li key={tag.name}>
                  <Link
                    to={allNotesPath(undefined, [tag.name])}
                    className="block rounded-full border border-line bg-surface px-2.5 py-1 text-xs text-fg-muted transition-colors duration-150 hover:border-accent-line hover:text-fg focus-visible:outline-2 focus-visible:outline-accent"
                  >
                    {tag.name} <span className="text-fg-subtle tabular-nums">{tag.noteCount}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </div>
  );
}
