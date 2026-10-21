import { Router } from 'express';
import type { Access } from '../auth/access.js';
import { HttpError, notFound } from '../errors.js';
import type { LinkResult, TasksRepository } from '../repositories/tasksRepository.js';
import { changed } from '../realtime/events.js';
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
      changed(res, res.locals.projectId as number, { type: 'task.updated', taskId: result.task.id });
      res.json(result.task);
      return;
    }
    if (result.reason === 'not_found') throw notFound('Task not found');
    if (result.reason === 'invalid_labels') throw new HttpError(400, 'invalid_input', 'A label belongs to another project');
    // Title or description changed elsewhere since the edit started (US-24): the current task, and which fields.
    if (result.reason === 'conflict') {
      throw new HttpError(409, 'conflict', 'The task was changed in the meantime', { task: result.task, fields: result.fields });
    }
    throw new HttpError(400, 'invalid_schedule', result.message);
  });

  // Moves stay inside the task's own project.
  router.post('/:id/move', edit, (req, res) => {
    const { columnId, laneId, index } = moveTaskSchema.parse(req.body);
    const result = tasks.move(idParamSchema.parse(req.params.id), columnId, laneId, index);
    if (result.ok) {
      changed(res, res.locals.projectId as number, { type: 'task.moved', taskId: result.task.id });
      res.json(result.task);
      return;
    }
    if (result.reason === 'not_found') throw notFound('Task not found');
    throw new HttpError(400, 'invalid_target', "Column and lane must belong to the task's project");
  });

  // Changing a link changes both tasks, so both come back.
  router.post('/:id/links', edit, (req, res) => {
    const { targetId, kind } = taskLinkInputSchema.parse(req.body);
    const linked = unwrapLink(tasks.addLink(idParamSchema.parse(req.params.id), targetId, kind));
    changed(res, res.locals.projectId as number, { type: 'task.linked', taskIds: [linked.task.id, linked.target.id] });
    res.status(201).json(linked);
  });

  router.delete('/:id/links/:linkId', edit, (req, res) => {
    const unlinked = unwrapLink(tasks.removeLink(idParamSchema.parse(req.params.id), idParamSchema.parse(req.params.linkId)));
    changed(res, res.locals.projectId as number, { type: 'task.linked', taskIds: [unlinked.task.id, unlinked.target.id] });
    res.json(unlinked);
  });

  router.delete('/:id', edit, (req, res) => {
    const id = idParamSchema.parse(req.params.id);
    if (!tasks.remove(id)) throw notFound('Task not found');
    changed(res, res.locals.projectId as number, { type: 'task.deleted', taskId: id });
    res.status(204).end();
  });

  return router;
}
