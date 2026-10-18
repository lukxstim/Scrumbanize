import { Router, type RequestHandler, type Response } from 'express';
import type { Access } from '../auth/access.js';
import { userOf } from '../auth/middleware.js';
import { HttpError, notFound } from '../errors.js';
import type { ActivityRepository } from '../repositories/activityRepository.js';
import type { AnalyticsRepository } from '../repositories/analyticsRepository.js';
import type { BoardRepository } from '../repositories/boardRepository.js';
import type { FoldersRepository } from '../repositories/foldersRepository.js';
import type { GraphRepository } from '../repositories/graphRepository.js';
import type { LabelsRepository } from '../repositories/labelsRepository.js';
import type { NotesRepository } from '../repositories/notesRepository.js';
import type { ProjectsRepository } from '../repositories/projectsRepository.js';
import type { TasksRepository } from '../repositories/tasksRepository.js';
import type { TemplatesRepository } from '../repositories/templatesRepository.js';
import {
  activityQuerySchema,
  analyticsQuerySchema,
  columnInputSchema,
  columnWidthsSchema,
  folderInputSchema,
  idParamSchema,
  labelInputSchema,
  laneInputSchema,
  newNoteFolderSchema,
  noteInputSchema,
  noteListQuerySchema,
  taskInputSchema,
  templateInputSchema,
  templatePatchSchema,
  templateQuerySchema,
} from '../validation.js';
import { unwrapBoard } from './board.js';
import { unwrapFolder } from './folders.js';
import { unwrapLabel, unwrapTemplate } from './labels.js';

interface Repositories {
  access: Access;
  activities: ActivityRepository;
  analytics: AnalyticsRepository;
  graph: GraphRepository;
  labels: LabelsRepository;
  templates: TemplatesRepository;
  projects: ProjectsRepository;
  notes: NotesRepository;
  tasks: TasksRepository;
  board: BoardRepository;
  folders: FoldersRepository;
}

const projectIdOf = (res: Response) => res.locals.projectId as number;

/**
 * Lists and creation inside one project, mounted at /api/projects/:projectId. Reading needs a role in the project
 * (viewer); notes, tasks and labels: member; columns, swimlanes and column widths: owner; templates for all
 * projects: a system administrator (US-21).
 */
export function projectScopedRouter({ access, activities, analytics, graph, labels, templates, projects, notes, tasks, board, folders }: Repositories): Router {
  const router = Router({ mergeParams: true });
  const member = access.atLeast('member');
  const owner = access.atLeast('owner');

  router.use(access.requireRole('viewer', (req) => {
    const projectId = idParamSchema.parse((req.params as { projectId?: string }).projectId);
    return projects.exists(projectId) ? projectId : undefined;
  }));
  router.use((_req, res, next) => {
    res.locals.projectKind = projects.kindOf(projectIdOf(res));
    next();
  });
  // A notebook (US-22) has notes, but no board: no tasks, columns, swimlanes, labels or statistics.
  const boardOnly: RequestHandler = (_req, res, next) => {
    if (res.locals.projectKind === 'notebook') throw new HttpError(409, 'notebook', 'Notebooks have no board');
    next();
  };

  /** Templates for all projects belong to everyone, so only administrators change them. */
  function checkTemplateScope(res: Response, global: boolean) {
    if (global && userOf(res)?.systemRole !== 'admin') {
      throw new HttpError(403, 'forbidden', 'Only administrators may change templates for all projects');
    }
  }

  router.get('/notes', (req, res) => {
    const { q, tag } = noteListQuerySchema.parse(req.query);
    res.json(notes.list(projectIdOf(res), { q, tags: tag }));
  });

  router.post('/notes', member, (req, res) => {
    const projectId = projectIdOf(res);
    const folderId = newNoteFolderSchema.parse(req.body).folderId ?? null;
    if (folderId !== null && !folders.inProject(folderId, projectId)) {
      throw new HttpError(400, 'invalid_folder', 'The folder must belong to this project');
    }
    res.status(201).json(notes.create(projectId, noteInputSchema.parse(req.body), folderId));
  });

  /** Folders of notes (US-22), in projects and notebooks alike. */
  router.get('/folders', (_req, res) => {
    res.json(folders.list(projectIdOf(res)));
  });

  router.post('/folders', member, (req, res) => {
    res.status(201).json(unwrapFolder(folders.create(projectIdOf(res), folderInputSchema.parse(req.body))));
  });

  router.get('/activities', (req, res) => {
    const { type, before, limit } = activityQuerySchema.parse(req.query);
    res.json(activities.list(projectIdOf(res), { type, before, limit }));
  });

  router.get('/analytics', boardOnly, (req, res) => {
    const { from, to, granularity, tz } = analyticsQuerySchema.parse(req.query);
    res.json(analytics.report(projectIdOf(res), { from, to, granularity, timeZone: tz }));
  });

  router.get('/graph', (_req, res) => {
    res.json(graph.get(projectIdOf(res)));
  });

  router.get('/tags', (_req, res) => {
    res.json(notes.listTags(projectIdOf(res)));
  });

  // A task converted from a note always lands in that note's project; a given lane must be one of the project's.
  router.post('/tasks', boardOnly, member, (req, res) => {
    const input = taskInputSchema.parse(req.body);
    if (input.sourceNoteId !== undefined) {
      const noteProjectId = tasks.noteProjectId(input.sourceNoteId);
      if (noteProjectId === undefined) throw notFound('Source note not found');
      if (noteProjectId !== projectIdOf(res)) {
        throw new HttpError(400, 'invalid_input', 'The source note belongs to another project');
      }
    }
    if (input.laneId !== undefined && board.laneProjectId(input.laneId) !== projectIdOf(res)) {
      throw new HttpError(400, 'invalid_input', 'The lane belongs to another project');
    }
    if (input.columnId !== undefined && board.columnProjectId(input.columnId) !== projectIdOf(res)) {
      throw new HttpError(400, 'invalid_input', 'The column belongs to another project');
    }
    if (input.labelIds && !labels.allInProject(projectIdOf(res), input.labelIds)) {
      throw new HttpError(400, 'invalid_input', 'A label belongs to another project');
    }
    res.status(201).json(tasks.create(projectIdOf(res), input));
  });

  router.get('/board', boardOnly, (_req, res) => {
    const projectId = projectIdOf(res);
    res.json({
      columns: board.listColumns(projectId),
      lanes: board.listLanes(projectId),
      labels: labels.list(projectId),
      tasks: tasks.list(projectId),
    });
  });

  router.post('/columns', boardOnly, owner, (req, res) => {
    res.status(201).json(unwrapBoard(board.createColumn(projectIdOf(res), columnInputSchema.parse(req.body)), 'Column'));
  });

  router.put('/column-widths', boardOnly, owner, (req, res) => {
    const { widths } = columnWidthsSchema.parse(req.body);
    const result = board.setColumnWidths(projectIdOf(res), widths);
    if (!result.ok) throw new HttpError(400, 'invalid_target', 'Every column must belong to this project');
    res.json(result.value);
  });

  router.post('/lanes', boardOnly, owner, (req, res) => {
    const { name } = laneInputSchema.parse(req.body);
    res.status(201).json(unwrapBoard(board.createLane(projectIdOf(res), name), 'Lane'));
  });

  router.get('/labels', (_req, res) => {
    res.json(labels.list(projectIdOf(res)));
  });

  router.post('/labels', boardOnly, member, (req, res) => {
    res.status(201).json(unwrapLabel(labels.create(projectIdOf(res), labelInputSchema.parse(req.body))));
  });

  // Templates: the project's own and those for all projects. Changes go through a project, which is where they are logged.
  router.get('/templates', (req, res) => {
    const { kind } = templateQuerySchema.parse(req.query);
    res.json(templates.list(projectIdOf(res), kind));
  });

  router.post('/templates', member, (req, res) => {
    const input = templateInputSchema.parse(req.body);
    checkTemplateScope(res, input.scope === 'global');
    res.status(201).json(unwrapTemplate(templates.create(projectIdOf(res), input)));
  });

  router.patch('/templates/:id', member, (req, res) => {
    const id = idParamSchema.parse(req.params.id);
    const patch = templatePatchSchema.parse(req.body);
    checkTemplateScope(res, access.templateProject(id) === null || patch.scope === 'global');
    res.json(unwrapTemplate(templates.update(projectIdOf(res), id, patch)));
  });

  router.delete('/templates/:id', member, (req, res) => {
    const id = idParamSchema.parse(req.params.id);
    checkTemplateScope(res, access.templateProject(id) === null);
    if (!templates.remove(projectIdOf(res), id)) throw notFound('Template not found');
    res.status(204).end();
  });

  return router;
}
