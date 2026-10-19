import { Command } from 'cmdk';
import { useEffect, useState, type ReactNode } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { useProjects } from '../hooks/useProjects';
import { useTemplates } from '../hooks/useTemplates';
import { useStoredState } from '../hooks/useStoredState';
import { useTheme, type ThemeSetting } from '../hooks/useTheme';
import type { Project } from '../types/project';
import { notesApi, searchApi, type SearchResults } from '../utils/api';
import { requestNewProject, requestTourStart, type CreateRequest } from '../utils/appEvents';
import { matchesQuery } from '../utils/matchQuery';
import { allNotesPath, KNOWLEDGE_PATH, paths, withActivityDrawer } from '../utils/paths';
import { colorDot, ofKind } from '../utils/projects';
import { NotebookGlyph } from './projects/NotebookSymbol';
import { ProjectMark } from './projects/ProjectSwitcher';
import { UNTITLED_NOTE } from '../utils/taskFromNote';
import {
  BoardIcon,
  CalendarIcon,
  ChartIcon,
  GraphIcon,
  SettingsIcon,
  TrashIcon,
  CheckIcon,
  HistoryIcon,
  InfoIcon,
  CompactIcon,
  FolderIcon,
  MonitorIcon,
  MoonIcon,
  NoteIcon,
  PlusIcon,
  SearchIcon,
  SunIcon,
} from './icons';
import { THEME_LABELS } from './ThemeSwitcher';
import Dialog from './ui/Dialog';
import Kbd from './ui/Kbd';
import { can } from '../utils/permissions';

interface CommandPaletteProps {
  open: boolean;
  onClose: () => void;
  /** The project in the URL, if any; its results come first and "new" actions create in it. */
  activeProject?: Project;
}

interface Item {
  id: string;
  label: ReactNode;
  /** Text for matching the query (besides a plain-string label). */
  keywords: string;
  icon: ReactNode;
  hint?: ReactNode;
  run: () => void;
}

const SEARCH_DELAY_MS = 150;
/** At most this many tags ("Tag „rezept“") among the results. */
const MAX_TAG_ITEMS = 6;
/** Views a notebook does not have (US-22). */
const BOARD_VIEWS = ['go-board', 'go-calendar', 'go-analytics'];
const isBoolean = (value: unknown): value is boolean => typeof value === 'boolean';

/** ⌘K / Ctrl+K: jump to projects, notes, tasks and views, and run actions. */
export default function CommandPalette({ open, onClose, activeProject }: CommandPaletteProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const { projects } = useProjects();
  const { templates } = useTemplates(open ? activeProject?.id : undefined);
  const { setting: themeSetting, setTheme } = useTheme();
  const [compact, setCompact] = useStoredState('scrumbanize.boardCompact', false, isBoolean);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResults | null>(null);
  // The tags of all notes the user can see (US-22), fresh every time the palette opens.
  const [tags, setTags] = useState<{ name: string; noteCount: number }[]>([]);
  useEffect(() => {
    if (!open) return;
    let current = true;
    notesApi.allTags().then(
      (all) => current && setTags(all),
      () => {
        // Without tags, everything else still works.
      },
    );
    return () => {
      current = false;
    };
  }, [open]);

  // Clear on close (not on open), so the palette is already empty when it reopens and keys typed
  // right after ⌘K are not appended to the previous query.
  useEffect(() => {
    if (!open) {
      setQuery('');
      setResults(null);
    }
  }, [open]);

  // Search notes and tasks of all projects shortly after typing stops.
  const trimmed = query.trim();
  useEffect(() => {
    if (trimmed.length < 2) {
      setResults(null);
      return;
    }
    const controller = new AbortController();
    const timer = setTimeout(() => {
      searchApi
        .search(trimmed, activeProject?.id, controller.signal)
        .then(setResults)
        .catch(() => {
          // Aborted or failed: the commands still work.
        });
    }, SEARCH_DELAY_MS);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [trimmed, activeProject?.id]);

  function run(action: () => void) {
    onClose();
    action();
  }

  const projectName = (id: number) => projects.find((p) => p.id === id);

  /** Notes and tasks of other projects show which project they belong to. */
  function projectTag(projectId: number) {
    const project = projectName(projectId);
    if (!project || projectId === activeProject?.id) return undefined;
    return (
      <span className="flex items-center gap-1.5 text-xs text-fg-subtle">
        {project.kind === 'notebook' ? (
          <NotebookGlyph icon={project.icon ?? 'book'} className="size-3" />
        ) : (
          <span className={`size-2 rounded-full ${colorDot(project.color)}`} aria-hidden="true" />
        )}
        {project.name}
      </span>
    );
  }

  const groups: { heading: string; items: Item[] }[] = [];
  // Without a query the create actions come first; with one they come last, after everything that matches,
  // so e.g. "privat" + Enter switches to that project instead of creating a note called "privat".
  let createGroup: { heading: string; items: Item[] } | undefined;

  if (activeProject) {
    // Viewers cannot create anything in the project (US-21), so they get no "Neue Notiz", "Neuer Task" or templates.
    const mayCreate = can(activeProject.role, 'edit');
    // Notebooks (US-22) have no board: no tasks, calendar or statistics.
    const withBoard = activeProject.kind === 'project';
    const create = (state: CreateRequest) => () =>
      navigate(state.create === 'note' ? paths.notes(activeProject.id) : paths.board(activeProject.id), { state });
    const actions: Item[] = (trimmed
      ? [
          {
            id: 'create-note-titled',
            label: <>Notiz „{trimmed}“ anlegen</>,
            keywords: '',
            icon: <NoteIcon />,
            run: create({ create: 'note', title: trimmed }),
          },
          {
            id: 'create-task-titled',
            label: <>Task „{trimmed}“ anlegen</>,
            keywords: '',
            icon: <BoardIcon />,
            run: create({ create: 'task', title: trimmed }),
          },
        ]
      : [
          { id: 'create-note', label: 'Neue Notiz', keywords: 'notiz anlegen erstellen', icon: <PlusIcon />, run: create({ create: 'note', title: '' }) },
          { id: 'create-task', label: 'Neuer Task', keywords: 'task anlegen erstellen', icon: <PlusIcon />, run: create({ create: 'task', title: '' }) },
        ]).filter((item) => withBoard || !item.id.startsWith('create-task'));
    if (mayCreate) createGroup = { heading: trimmed ? 'Neu anlegen' : 'Aktionen', items: actions };

    // "Notiz aus Vorlage …" and "Task aus Vorlage …", found by the template's name.
    const fromTemplates: Item[] = templates
      .filter((template) => withBoard || template.kind === 'note')
      .map((template) => ({
        id: `template-${template.id}`,
        label: `${template.kind === 'note' ? 'Notiz' : 'Task'} aus Vorlage „${template.name}“`,
        keywords: `vorlage template neu anlegen ${template.kind === 'note' ? 'notiz' : 'task aufgabe'}`,
        icon: template.kind === 'note' ? <NoteIcon /> : <BoardIcon />,
        run: create({ create: template.kind, title: '', templateId: template.id }),
      }))
      .filter((item) => matchesQuery(trimmed, item.label, item.keywords));
    if (mayCreate && fromTemplates.length > 0) groups.push({ heading: 'Vorlagen', items: fromTemplates });
    if (!trimmed && createGroup) groups.push(createGroup);

    groups.push({
      heading: 'Navigation',
      items: [
        {
          id: 'go-notes',
          label: `Notizen von „${activeProject.name}“`,
          keywords: 'notizen öffnen gehe zu',
          icon: <NoteIcon />,
          run: () => navigate(paths.notes(activeProject.id)),
        },
        {
          id: 'go-graph',
          label: `Graph von „${activeProject.name}“`,
          keywords: 'graph netzwerk knoten verbindungen verknüpfungen zusammenhänge obsidian gehe zu',
          icon: <GraphIcon />,
          run: () => navigate(paths.graph(activeProject.id)),
        },
        {
          id: 'go-board',
          label: `Board von „${activeProject.name}“`,
          keywords: 'board öffnen gehe zu',
          icon: <BoardIcon />,
          run: () => navigate(paths.board(activeProject.id)),
        },
        {
          id: 'go-calendar',
          label: `Kalender von „${activeProject.name}“`,
          keywords: 'kalender termine fällig deadlines monat woche gehe zu',
          icon: <CalendarIcon />,
          run: () => navigate(paths.calendar(activeProject.id)),
        },
        {
          id: 'go-analytics',
          label: `Statistiken von „${activeProject.name}“`,
          keywords: 'statistiken analytics reporting velocity durchlaufzeit lead cycle time wip auswertung gehe zu',
          icon: <ChartIcon />,
          run: () => navigate(paths.analytics(activeProject.id)),
        },
        {
          id: 'go-activity',
          label: `Aktivität von „${activeProject.name}“`,
          keywords: 'aktivität verlauf history protokoll log gehe zu',
          icon: <HistoryIcon />,
          run: () => navigate(withActivityDrawer(location.pathname, location.search)),
        },
        {
          id: 'go-settings',
          label: 'Einstellungen: Backup, Wiederherstellung, Import, Export',
          keywords: 'einstellungen settings backup sicherung wiederherstellen restore import export obsidian notion csv markdown zip',
          icon: <SettingsIcon />,
          run: () => navigate(paths.settings(activeProject.id)),
        },
        {
          id: 'go-trash',
          label: `Papierkorb von „${activeProject.name}“`,
          keywords: 'papierkorb gelöscht wiederherstellen trash mülleimer gehe zu',
          icon: <TrashIcon />,
          run: () => navigate(paths.trash(activeProject.id)),
        },
      ]
        .filter((item) => withBoard || !BOARD_VIEWS.includes(item.id))
        .filter((item) => matchesQuery(trimmed, item.label, item.keywords)),
    });
  }

  const switchTo = (p: Project): Item & { label: string } => ({
    id: `project-${p.id}`,
    label: `Zu „${p.name}“ wechseln`,
    keywords: `${p.kind === 'notebook' ? 'notizbuch wissen' : 'projekt'} wechseln ${p.name}`,
    icon: p.kind === 'notebook' ? <ProjectMark project={p} /> : <span className={`m-1 size-2 rounded-full ${colorDot(p.color)}`} aria-hidden="true" />,
    run: () => navigate(paths.notes(p.id)),
  });
  const others = projects.filter((p) => p.id !== activeProject?.id);
  groups.push({
    heading: 'Projekte',
    items: [
      ...ofKind(others, 'project').map(switchTo),
      { id: 'new-project', label: 'Neues Projekt …', keywords: 'projekt anlegen erstellen', icon: <FolderIcon />, run: () => requestNewProject('project') },
    ].filter((item) => matchesQuery(trimmed, item.label, item.keywords)),
  });
  // Notebooks (US-22): knowledge outside the projects.
  // A new note right in another notebook, e.g. "rezepte" or "notiz" → "Neue Notiz in „Rezepte“".
  const newNoteIn = (p: Project): Item & { label: string } => ({
    id: `create-note-in-${p.id}`,
    label: `Neue Notiz in „${p.name}“`,
    keywords: 'neue notiz anlegen erstellen notizbuch',
    icon: <PlusIcon />,
    run: () => navigate(paths.notes(p.id), { state: { create: 'note', title: '' } }),
  });
  groups.push({
    heading: 'Wissen',
    items: [
      {
        id: 'go-knowledge',
        label: 'Wissen: Alle Notizen',
        keywords: 'wissen alle notizen notizbücher notizbuch tags schlagworte übersicht gehe zu',
        icon: <NotebookGlyph icon="book" />,
        run: () => navigate(KNOWLEDGE_PATH),
      },
      ...ofKind(others, 'notebook').map(switchTo),
      // Only with a query (matched below), so the list without one stays short. Not for viewers (US-21).
      ...(trimmed ? ofKind(others, 'notebook').filter((p) => can(p.role, 'edit')).map(newNoteIn) : []),
      {
        id: 'new-notebook',
        label: 'Neues Notizbuch …',
        keywords: 'notizbuch wissen anlegen erstellen',
        icon: <PlusIcon />,
        run: () => requestNewProject('notebook'),
      },
    ].filter((item) => matchesQuery(trimmed, item.label, item.keywords)),
  });

  const themeIcons: Record<ThemeSetting, ReactNode> = { light: <SunIcon />, dark: <MoonIcon />, system: <MonitorIcon /> };
  groups.push({
    heading: 'Einstellungen',
    items: [
      {
        id: 'tour',
        label: 'Einführung erneut starten',
        keywords: 'einführung tour hilfe onboarding rundgang erklärung',
        icon: <InfoIcon />,
        run: requestTourStart,
      },
      ...(['light', 'dark', 'system'] as const).map((value) => ({
        id: `theme-${value}`,
        label: `Farbschema: ${THEME_LABELS[value]}`,
        keywords: `theme farbe ${value} ${value === 'dark' ? 'dark mode nacht' : value === 'light' ? 'light mode tag' : 'automatisch'}`,
        icon: themeIcons[value],
        hint: themeSetting === value ? <CheckIcon className="size-4 text-accent-text" /> : undefined,
        run: () => setTheme(value),
      })),
      {
        id: 'toggle-compact',
        label: compact ? 'Kompaktansicht ausschalten' : 'Kompaktansicht einschalten',
        keywords: 'kompakt board dichte',
        icon: <CompactIcon />,
        run: () => setCompact(!compact),
      },
    ].filter((item) => matchesQuery(trimmed, item.label, item.keywords)),
  });

  // Tags of Wissen (US-22): "#rezept" or "rezept" opens "Alle Notizen" with that tag.
  const tagQuery = trimmed.replace(/^#/, '');
  if (tagQuery) {
    groups.push({
      heading: 'Tags',
      items: tags
        .filter((tag) => matchesQuery(tagQuery, tag.name))
        .slice(0, MAX_TAG_ITEMS)
        .map((tag) => ({
          id: `tag-${tag.name}`,
          label: (
            <>
              Tag „{tag.name}“ <span className="text-xs text-fg-subtle">· {tag.noteCount === 1 ? '1 Notiz' : `${tag.noteCount} Notizen`}</span>
            </>
          ),
          keywords: '',
          icon: <span className="grid size-4 place-items-center text-sm font-semibold text-fg-subtle" aria-hidden="true">#</span>,
          run: () => navigate(allNotesPath(undefined, [tag.name])),
        })),
    });
  }

  if (results) {
    groups.push({
      heading: 'Notizen',
      items: results.notes.map((note) => ({
        id: `note-${note.id}`,
        label: (
          <span className="flex min-w-0 flex-col">
            <span className="truncate">{note.title || UNTITLED_NOTE}</span>
            {note.snippet && <span className="truncate text-xs text-fg-subtle">{note.snippet}</span>}
          </span>
        ),
        keywords: '',
        icon: <NoteIcon />,
        hint: projectTag(note.projectId),
        run: () => navigate(paths.notes(note.projectId, note.id)),
      })),
    });
    groups.push({
      heading: 'Tasks',
      items: results.tasks.map((task) => ({
        id: `task-${task.id}`,
        label: (
          <span className="flex min-w-0 items-baseline gap-2">
            <span className="shrink-0 font-mono text-xs text-fg-subtle">#{task.id}</span>
            <span className="truncate">{task.title}</span>
            <span className="shrink-0 text-xs text-fg-subtle">· {task.columnName}</span>
          </span>
        ),
        keywords: '',
        icon: <BoardIcon />,
        hint: projectTag(task.projectId),
        run: () => navigate(paths.task(task.projectId, task.id)),
      })),
    });
  }

  if (createGroup && trimmed) groups.push(createGroup);

  // cmdk does not reselect when its items change (filtering is ours), so the first item is selected
  // whenever the visible items change; otherwise Enter would run an item that is no longer shown.
  const visibleIds = groups.flatMap((group) => group.items.map((item) => item.id));
  const firstId = visibleIds[0] ?? '';
  const visibleKey = visibleIds.join('|');
  const [selected, setSelected] = useState('');
  useEffect(() => {
    setSelected(firstId);
  }, [visibleKey, firstId]);

  return (
    <Dialog
      open={open}
      onClose={onClose}
      labelledBy="command-palette-label"
      closeOnBackdrop
      className="mt-[12vh] mb-auto max-w-xl overflow-hidden"
    >
      <Command label="Befehlspalette" shouldFilter={false} loop value={selected} onValueChange={setSelected}>
        <span id="command-palette-label" className="sr-only">
          Befehlspalette
        </span>
        <div className="flex items-center gap-3 border-b border-line px-4">
          <SearchIcon className="size-4 text-fg-subtle" />
          <Command.Input
            value={query}
            onValueChange={setQuery}
            data-autofocus
            placeholder="Suchen oder Befehl eingeben …"
            className="h-12 flex-1 bg-transparent text-sm text-fg placeholder:text-fg-faint focus:outline-none"
          />
          <Kbd>Esc</Kbd>
        </div>
        <Command.List className="max-h-[min(60vh,28rem)] overflow-y-auto overscroll-contain p-2">
          <Command.Empty className="px-3 py-8 text-center text-sm text-fg-subtle">
            Keine Treffer für „{trimmed}“.
          </Command.Empty>
          {groups
            .filter((group) => group.items.length > 0)
            .map((group) => (
              <Command.Group
                key={group.heading}
                heading={group.heading}
                className="[&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:pb-1 [&_[cmdk-group-heading]]:pt-2 [&_[cmdk-group-heading]]:text-[11px] [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wide [&_[cmdk-group-heading]]:text-fg-subtle"
              >
                {group.items.map((item) => (
                  <Command.Item
                    key={item.id}
                    value={item.id}
                    onSelect={() => run(item.run)}
                    className="flex cursor-pointer items-center gap-3 rounded-md px-3 py-2 text-sm text-fg-muted transition-colors duration-75 data-[selected=true]:bg-surface-hover data-[selected=true]:text-fg [&_svg]:size-4 [&_svg]:shrink-0 [&_svg]:text-fg-subtle"
                  >
                    {item.icon}
                    <span className="min-w-0 flex-1">{item.label}</span>
                    {item.hint}
                  </Command.Item>
                ))}
              </Command.Group>
            ))}
        </Command.List>
        <div className="flex items-center gap-4 border-t border-line bg-surface-muted px-4 py-2 text-xs text-fg-subtle">
          <span className="flex items-center gap-1">
            <Kbd>↑</Kbd>
            <Kbd>↓</Kbd> auswählen
          </span>
          <span className="flex items-center gap-1">
            <Kbd>↵</Kbd> ausführen
          </span>
          <span className="ml-auto">Durchsucht alle Projekte und Notizbücher</span>
        </div>
      </Command>
    </Dialog>
  );
}
