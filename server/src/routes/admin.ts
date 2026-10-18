import { Router } from 'express';
import type { Access } from '../auth/access.js';
import { userOf } from '../auth/middleware.js';
import { HttpError, notFound } from '../errors.js';
import type { UsersRepository } from '../repositories/usersRepository.js';
import { accountPatchSchema, handOverSchema, idParamSchema, invitationSchema } from '../validation.js';

/**
 * User management for system administrators (US-21c), at /api/admin. Invitations and password resets are one-time
 * links the administrator passes on (there is no email sending). Accounts are disabled rather than deleted, so their
 * names stay in the activity log; nobody can be disabled while they are the only owner of a project, and the last
 * administrator keeps their role.
 */
export function adminRouter(users: UsersRepository, access: Access): Router {
  const router = Router();
  router.use(access.requireSystemAdmin);

  const account = (raw: unknown) => {
    const id = idParamSchema.parse(raw);
    const found = users.accounts().find((a) => a.id === id);
    if (!found) throw notFound('Account not found');
    return found;
  };

  router.get('/users', (_req, res) => {
    res.json(users.accounts());
  });

  router.patch('/users/:id', (req, res) => {
    const target = account(req.params.id);
    const patch = accountPatchSchema.parse(req.body);
    const losesAdmin = (patch.systemRole === 'user' || patch.disabled === true) && users.isActiveAdmin(target.id);
    if (losesAdmin && users.activeAdminCount() === 1) {
      throw new HttpError(409, 'last_admin', 'There must be at least one administrator');
    }
    if (patch.disabled === true) {
      if (target.id === userOf(res)!.id) throw new HttpError(409, 'self', 'You cannot disable your own account');
      if (target.soleOwnerOf.length > 0) {
        throw new HttpError(409, 'sole_owner', `Only owner of: ${target.soleOwnerOf.map((p) => p.name).join(', ')}`);
      }
    }
    if (patch.systemRole) users.setSystemRole(target.id, patch.systemRole);
    if (patch.disabled !== undefined) users.setDisabled(target.id, patch.disabled);
    res.json(account(req.params.id));
  });

  /** Makes another account owner of every project only this one owns (before disabling it). */
  router.post('/users/:id/hand-over', (req, res) => {
    const target = account(req.params.id);
    const { toUserId } = handOverSchema.parse(req.body);
    const to = users.accounts().find((a) => a.id === toUserId);
    if (!to || to.disabled || to.id === target.id) throw new HttpError(400, 'invalid_target', 'Hand over to another active account');
    res.json({ projects: users.handOver(target.id, to.id), account: account(req.params.id) });
  });

  /** A link (24 hours) to set a new password; earlier unused reset links of the account stop working. */
  router.post('/users/:id/reset-link', (req, res) => {
    const target = account(req.params.id);
    if (target.disabled) throw new HttpError(409, 'disabled', 'The account is disabled');
    const { token, expiresAt } = users.createToken({ kind: 'reset', userId: target.id, createdBy: userOf(res)!.id });
    res.status(201).json({ token, expiresAt: expiresAt.toISOString() });
  });

  router.get('/invitations', (_req, res) => {
    res.json(users.openInvitations());
  });

  /** A link (7 days) with which someone creates their own account for this email. */
  router.post('/invitations', (req, res) => {
    const { email } = invitationSchema.parse(req.body);
    if (users.accounts().some((a) => a.email === email)) throw new HttpError(409, 'email_taken', 'There is already an account with this email');
    const { token, expiresAt } = users.createToken({ kind: 'invite', email, createdBy: userOf(res)!.id });
    res.status(201).json({ token, email, expiresAt: expiresAt.toISOString() });
  });

  router.delete('/invitations/:id', (req, res) => {
    if (!users.revokeInvitation(String(req.params.id))) throw notFound('Invitation not found');
    res.status(204).end();
  });

  return router;
}
