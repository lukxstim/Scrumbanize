import { Router } from 'express';
import type { Access } from '../auth/access.js';
import { HttpError, notFound } from '../errors.js';
import type { LabelResult, LabelsRepository } from '../repositories/labelsRepository.js';
import type { TemplateResult, TemplatesRepository } from '../repositories/templatesRepository.js';
import { idParamSchema, labelPatchSchema, reorderSchema } from '../validation.js';

/** The label of a successful result, or the matching HTTP error. */
export function unwrapLabel(result: LabelResult) {
  if (result.ok) return result.label;
  if (result.reason === 'not_found') throw notFound('Label not found');
  if (result.reason === 'name_taken') throw new HttpError(409, 'name_taken', 'Label: name is already used in this project');
  throw new HttpError(409, 'limit_reached', 'Label: limit per project reached');
}

export function unwrapTemplate(result: TemplateResult) {
  if (result.ok) return result.template;
  if (result.reason === 'not_found') throw notFound('Template not found');
  if (result.reason === 'name_taken') throw new HttpError(409, 'name_taken', 'Template: name is already used');
  throw new HttpError(409, 'limit_reached', 'Template: limit reached');
}

/** Single labels by id, mounted at /api/labels. Listing and creating are project-scoped (see projectScoped.ts). */
export function labelsRouter(labels: LabelsRepository, access: Access): Router {
  const router = Router();
  const read = access.requireRole('viewer', access.of.label());
  const edit = access.requireRole('member', access.of.label());

  router.patch('/:id', edit, (req, res) => {
    res.json(unwrapLabel(labels.update(idParamSchema.parse(req.params.id), labelPatchSchema.parse(req.body))));
  });

  router.post('/:id/move', edit, (req, res) => {
    const { index } = reorderSchema.parse(req.body);
    res.json(unwrapLabel(labels.move(idParamSchema.parse(req.params.id), index)));
  });

  /** How many tasks carry the label, for the confirmation before deleting. */
  router.get('/:id/usage', read, (req, res) => {
    const id = idParamSchema.parse(req.params.id);
    if (labels.projectOf(id) === undefined) throw notFound('Label not found');
    res.json({ tasks: labels.usage(id) });
  });

  router.delete('/:id', edit, (req, res) => {
    if (!labels.remove(idParamSchema.parse(req.params.id))) throw notFound('Label not found');
    res.status(204).end();
  });

  return router;
}

export type { TemplatesRepository };
