import { Router, type Response } from 'express';
import { HttpError, notFound } from '../errors.js';
import type { ActivityRepository } from '../repositories/activityRepository.js';
import type { AnalyticsRepository } from '../repositories/analyticsRepository.js';
import type { BoardRepository } from '../repositories/boardRepository.js';
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
  idParamSchema,
  labelInputSchema,
  laneInputSchema,
  noteInputSchema,
  noteListQuerySchema,
  taskInputSchema,
  templateInputSchema,
  templatePatchSchema,
  templateQuerySchema,
} from '../validation.js';
import { unwrapBoard } from './board.js';
import { unwrapLabel, unwrapTemplate } from './labels.js';

interface Repositories {
  activities: ActivityRepository;
  analytics: AnalyticsRepository;
  graph: GraphRepository;
  labels: LabelsRepository;
  templates: TemplatesRepository;
  projects: ProjectsRepository;
  notes: NotesRepository;
  tasks: TasksRepository;
  board: BoardRepository;
}

const projectIdOf = (res: Response) => res.locals.projectId as number;

/** Lists and creation inside one project, mounted at /api/projects/:projectId. */
export function projectScopedRouter({ activities, analytics, graph, labels, templates, projects, notes, tasks, board }: Repositories): Router {
  const router = Router({ mergeParams: true });

  router.use((req, res, next) => {
    const projectId = idParamSchema.parse((req.params as { projectId?: string }).projectId);
    if (!projects.exists(projectId)) throw notFound('Project not found');
    res.locals.projectId = projectId;
    next();
  });

  router.get('/notes', (req, res) => {
    const { q, tag } = noteListQuerySchema.parse(req.query);
    res.json(notes.list(projectIdOf(res), { q, tags: tag }));
  });

  router.post('/notes', (req, res) => {
    res.status(201).json(notes.create(projectIdOf(res), noteInputSchema.parse(req.body)));
  });

  router.get('/activities', (req, res) => {
    const { type, before, limit } = activityQuerySchema.parse(req.query);
    res.json(activities.list(projectIdOf(res), { type, before, limit }));
  });

  router.get('/analytics', (req, res) => {
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
  router.post('/tasks', (req, res) => {
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

  router.get('/board', (_req, res) => {
    const projectId = projectIdOf(res);
    res.json({
      columns: board.listColumns(projectId),
      lanes: board.listLanes(projectId),
      labels: labels.list(projectId),
      tasks: tasks.list(projectId),
    });
  });

  router.post('/columns', (req, res) => {
    res.status(201).json(unwrapBoard(board.createColumn(projectIdOf(res), columnInputSchema.parse(req.body)), 'Column'));
  });

  router.put('/column-widths', (req, res) => {
    const { widths } = columnWidthsSchema.parse(req.body);
    const result = board.setColumnWidths(projectIdOf(res), widths);
    if (!result.ok) throw new HttpError(400, 'invalid_target', 'Every column must belong to this project');
    res.json(result.value);
  });

  router.post('/lanes', (req, res) => {
    const { name } = laneInputSchema.parse(req.body);
    res.status(201).json(unwrapBoard(board.createLane(projectIdOf(res), name), 'Lane'));
  });

  router.get('/labels', (_req, res) => {
    res.json(labels.list(projectIdOf(res)));
  });

  router.post('/labels', (req, res) => {
    res.status(201).json(unwrapLabel(labels.create(projectIdOf(res), labelInputSchema.parse(req.body))));
  });

  // Templates: the project's own and those for all projects. Changes go through a project, which is where they are logged.
  router.get('/templates', (req, res) => {
    const { kind } = templateQuerySchema.parse(req.query);
    res.json(templates.list(projectIdOf(res), kind));
  });

  router.post('/templates', (req, res) => {
    res.status(201).json(unwrapTemplate(templates.create(projectIdOf(res), templateInputSchema.parse(req.body))));
  });

  router.patch('/templates/:id', (req, res) => {
    const id = idParamSchema.parse(req.params.id);
    res.json(unwrapTemplate(templates.update(projectIdOf(res), id, templatePatchSchema.parse(req.body))));
  });

  router.delete('/templates/:id', (req, res) => {
    if (!templates.remove(projectIdOf(res), idParamSchema.parse(req.params.id))) throw notFound('Template not found');
    res.status(204).end();
  });

  return router;
}
