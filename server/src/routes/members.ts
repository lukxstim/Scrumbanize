import { Router } from 'express';
import { text } from '../activityText.js';
import type { Access } from '../auth/access.js';
import { userOf } from '../auth/middleware.js';
import { HttpError, notFound } from '../errors.js';
import type { ActivityRepository } from '../repositories/activityRepository.js';
import type { MemberResult, UsersRepository } from '../repositories/usersRepository.js';
import { accessChanged, changed } from '../realtime/events.js';
import { idParamSchema, memberInputSchema, memberPatchSchema } from '../validation.js';

function unwrap(result: MemberResult) {
  if (result.ok) return result.member;
  if (result.reason === 'not_found') throw notFound('Member not found');
  if (result.reason === 'already_member') throw new HttpError(409, 'already_member', 'Already a member of this project');
  throw new HttpError(409, 'last_owner', 'A project needs at least one owner');
}

/**
 * The members of a project (US-21), at /api/projects/:projectId/members. Everyone in the project sees them; owners
 * add existing accounts by email, change roles and remove members; anyone may leave. The last owner can do neither
 * of the latter, so no project is left without one. Changes are logged in the project.
 */
export function membersRouter(users: UsersRepository, activities: ActivityRepository, access: Access): Router {
  const router = Router({ mergeParams: true });
  const projectOf = access.of.project();
  const owner = access.requireRole('owner', projectOf);
  const log = (projectId: number, description: string, metadata: object) =>
    activities.record({ projectId, entityType: 'project', entityId: projectId, actionType: 'update', description, metadata: { members: metadata } });

  router.get('/', access.requireRole('viewer', projectOf), (_req, res) => {
    res.json(users.members(res.locals.projectId as number));
  });

  router.post('/', owner, (req, res) => {
    const projectId = res.locals.projectId as number;
    const { email, role } = memberInputSchema.parse(req.body);
    const user = users.activeUserByEmail(email);
    if (!user) throw new HttpError(404, 'user_not_found', 'There is no account with this email');
    const member = unwrap(users.invite(projectId, user.id, role));
    log(projectId, text.memberAdded(user.name, role), { added: user.id, role });
    changed(res, projectId, { type: 'members.changed' });
    accessChanged(res, [user.id]);
    res.status(201).json(member);
  });

  router.patch('/:userId', owner, (req, res) => {
    const projectId = res.locals.projectId as number;
    const { role } = memberPatchSchema.parse(req.body);
    const member = unwrap(users.setRole(projectId, idParamSchema.parse(req.params.userId), role));
    log(projectId, text.memberRoleChanged(member.user.name, role), { changed: member.user.id, role });
    changed(res, projectId, { type: 'members.changed' });
    accessChanged(res, [member.user.id]);
    res.json(member);
  });

  // Owners remove anyone; everyone may remove themselves (leave the project).
  router.delete('/:userId', access.requireRole('viewer', projectOf), (req, res) => {
    const projectId = res.locals.projectId as number;
    const userId = idParamSchema.parse(req.params.userId);
    const self = userId === userOf(res)!.id;
    if (!self && res.locals.projectRole !== 'owner') throw new HttpError(403, 'forbidden', 'This needs the role "owner" in the project');
    const member = unwrap(users.removeMember(projectId, userId));
    log(projectId, self ? text.memberLeft(member.user.name) : text.memberRemoved(member.user.name), { removed: userId });
    // Still in the project's room: the removed person's pages hear it, then their connections leave the room.
    changed(res, projectId, { type: 'members.changed' });
    accessChanged(res, [userId]);
    res.status(204).end();
  });

  return router;
}
