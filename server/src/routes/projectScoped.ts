import { Router, type Response } from 'express';
import { HttpError, notFound } from '../errors.js';
import type { ActivityRepository } from '../repositories/activityRepository.js';
import type { AnalyticsRepository } from '../repositories/analyticsRepository.js';
import type { BoardRepository } from '../repositories/boardRepository.js';
import type { NotesRepository } from '../repositories/notesRepository.js';
import type { ProjectsRepository } from '../repositories/projectsRepository.js';
import type { TasksRepository } from '../repositories/tasksRepository.js';
import {
  activityQuerySchema,
  analyticsQuerySchema,
  columnInputSchema,
  idParamSchema,
  laneInputSchema,
  noteInputSchema,
  noteListQuerySchema,
  taskInputSchema,
} from '../validation.js';
import { unwrapBoard } from './board.js';

interface Repositories {
  activities: ActivityRepository;
  analytics: AnalyticsRepository;
  projects: ProjectsRepository;
  notes: NotesRepository;
  tasks: TasksRepository;
  board: BoardRepository;
}

const projectIdOf = (res: Response) => res.locals.projectId as number;

/** Lists and creation inside one project, mounted at /api/projects/:projectId. */
export function projectScopedRouter({ activities, analytics, projects, notes, tasks, board }: Repositories): Router {
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
    res.status(201).json(tasks.create(projectIdOf(res), input));
  });

  router.get('/board', (_req, res) => {
    const projectId = projectIdOf(res);
    res.json({ columns: board.listColumns(projectId), lanes: board.listLanes(projectId), tasks: tasks.list(projectId) });
  });

  router.post('/columns', (req, res) => {
    res.status(201).json(unwrapBoard(board.createColumn(projectIdOf(res), columnInputSchema.parse(req.body)), 'Column'));
  });

  router.post('/lanes', (req, res) => {
    const { name } = laneInputSchema.parse(req.body);
    res.status(201).json(unwrapBoard(board.createLane(projectIdOf(res), name), 'Lane'));
  });

  return router;
}
