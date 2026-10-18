import { Router } from 'express';
import type { Access } from '../auth/access.js';
import { HttpError, notFound } from '../errors.js';
import type { LinkResult, TasksRepository } from '../repositories/tasksRepository.js';
import { idParamSchema, moveTaskSchema, taskLinkInputSchema, taskPatchSchema } from '../validation.js';

function unwrapLink(result: LinkResult) {
  if (result.ok) return { task: result.task, target: result.target };
  switch (result.reason) {
    case 'not_found':
      throw notFound('Task or link not found');
    case 'target_not_found':
      throw notFound('Linked task not found');
    case 'self':
      throw new HttpError(400, 'invalid_link', 'A task cannot be linked to itself');
    case 'other_project':
      throw new HttpError(400, 'invalid_link', 'Linked tasks must belong to the same project');
    case 'exists':
      throw new HttpError(409, 'link_exists', 'These tasks are already linked');
  }
}

/** Single tasks by id; listing and creating are project-scoped (see projectScoped.ts). */
export function tasksRouter(tasks: TasksRepository, access: Access): Router {
  const router = Router();
  // Reading: viewer; changing, moving, linking, deleting: member (links stay inside the task's project, see the repository).
  const read = access.requireRole('viewer', access.of.task());
  const edit = access.requireRole('member', access.of.task());

  router.get('/:id', read, (req, res) => {
    const task = tasks.get(idParamSchema.parse(req.params.id));
    if (!task) throw notFound('Task not found');
    res.json(task);
  });

  router.patch('/:id', edit, (req, res) => {
    const result = tasks.update(idParamSchema.parse(req.params.id), taskPatchSchema.parse(req.body));
    if (result.ok) {
      res.json(result.task);
      return;
    }
    if (result.reason === 'not_found') throw notFound('Task not found');
    if (result.reason === 'invalid_labels') throw new HttpError(400, 'invalid_input', 'A label belongs to another project');
    throw new HttpError(400, 'invalid_schedule', result.message);
  });

  // Moves stay inside the task's own project.
  router.post('/:id/move', edit, (req, res) => {
    const { columnId, laneId, index } = moveTaskSchema.parse(req.body);
    const result = tasks.move(idParamSchema.parse(req.params.id), columnId, laneId, index);
    if (result.ok) {
      res.json(result.task);
      return;
    }
    if (result.reason === 'not_found') throw notFound('Task not found');
    throw new HttpError(400, 'invalid_target', "Column and lane must belong to the task's project");
  });

  // Changing a link changes both tasks, so both come back.
  router.post('/:id/links', edit, (req, res) => {
    const { targetId, kind } = taskLinkInputSchema.parse(req.body);
    res.status(201).json(unwrapLink(tasks.addLink(idParamSchema.parse(req.params.id), targetId, kind)));
  });

  router.delete('/:id/links/:linkId', edit, (req, res) => {
    res.json(unwrapLink(tasks.removeLink(idParamSchema.parse(req.params.id), idParamSchema.parse(req.params.linkId))));
  });

  router.delete('/:id', edit, (req, res) => {
    if (!tasks.remove(idParamSchema.parse(req.params.id))) throw notFound('Task not found');
    res.status(204).end();
  });

  return router;
}
