import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { useAuth } from '../../hooks/useAuth';
import { useProjects } from '../../hooks/useProjects';
import { useToast } from '../../hooks/useToast';
import type { Project, ProjectMember, ProjectRole } from '../../types/project';
import { ApiError, membersApi } from '../../utils/api';
import { can, ROLE_DESCRIPTIONS, ROLE_LABELS } from '../../utils/permissions';
import { Avatar } from '../auth/UserMenu';
import ConfirmDialog from '../ConfirmDialog';
import Button from '../ui/Button';
import Dialog from '../ui/Dialog';
import { dialogActionsClass, dialogTitleClass, fieldClass, labelClass } from '../ui/styles';

const ROLES: ProjectRole[] = ['owner', 'member', 'viewer'];

const ERRORS: Record<string, string> = {
  user_not_found: 'Es gibt kein Konto mit dieser E-Mail-Adresse. Konten legt die Person an, die Scrumbanize verwaltet.',
  already_member: 'Diese Person ist schon Mitglied.',
  last_owner: 'Ein Projekt braucht mindestens einen Owner. Mach zuerst jemand anderen zum Owner.',
};
const errorText = (error: unknown) => (error instanceof ApiError && ERRORS[error.code]) || 'Das hat nicht geklappt. Bitte versuche es erneut.';

/**
 * Who belongs to a project and with which role (US-21). Everyone sees the list and can leave; owners add existing
 * accounts by email, change roles and remove members.
 */
export default function MembersDialog({ project, onClose }: { project: Project; onClose: () => void }) {
  const { session } = useAuth();
  const { reload: reloadProjects } = useProjects();
  const navigate = useNavigate();
  const toast = useToast();
  const me = session?.user?.id;
  const isOwner = can(project.role, 'manageProject');
  const [members, setMembers] = useState<ProjectMember[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<ProjectRole>('member');
  const [busy, setBusy] = useState(false);
  const [removing, setRemoving] = useState<ProjectMember | null>(null);

  const load = useCallback(async () => {
    try {
      setMembers(await membersApi.list(project.id));
    } catch {
      setError('Die Mitglieder konnten nicht geladen werden.');
    }
  }, [project.id]);

  useEffect(() => {
    void load();
  }, [load]);

  async function run(action: () => Promise<unknown>, after?: () => void) {
    setBusy(true);
    setError(null);
    try {
      await action();
      await load();
      after?.();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  function add() {
    void run(
      () => membersApi.add(project.id, email.trim(), role),
      () => {
        toast({ message: `${email.trim()} wurde als ${ROLE_LABELS[role]} hinzugefügt.` });
        setEmail('');
      },
    );
  }

  function changeRole(member: ProjectMember, next: ProjectRole) {
    // Your own role changes what this window may show, so the projects (with their roles) are reloaded.
    void run(() => membersApi.setRole(project.id, member.user.id, next), () => member.user.id === me && void reloadProjects());
  }

  async function remove(member: ProjectMember) {
    setRemoving(null);
    const self = member.user.id === me;
    await run(
      () => membersApi.remove(project.id, member.user.id),
      () => {
        if (!self) return;
        toast({ message: `Du hast „${project.name}“ verlassen.` });
        onClose();
        void reloadProjects();
        navigate('/', { replace: true });
      },
    );
  }

  return (
    <Dialog onClose={onClose} dismissible={!busy} labelledBy="members-dialog-title" className="max-w-lg p-6">
      <h2 id="members-dialog-title" className={dialogTitleClass}>
        Mitglieder von „{project.name}“
      </h2>
      <p className="mt-1 text-sm text-fg-subtle">
        {isOwner
          ? 'Lege fest, wer dieses Notizbuch sehen und bearbeiten darf.'
          : `Du bist hier ${ROLE_LABELS[project.role]}.`}
      </p>

      <ul className="mt-5 divide-y divide-line rounded-lg border border-line" aria-busy={members === null}>
        {members === null && !error && <li className="px-3 py-3 text-sm text-fg-subtle">Lade …</li>}
        {members?.map((member) => {
          const self = member.user.id === me;
          return (
            <li key={member.user.id} className="flex items-center gap-3 px-3 py-2.5">
              <Avatar user={member.user} className="size-8 text-xs" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-fg">
                  {member.user.name}
                  {self && <span className="font-normal text-fg-subtle"> (du)</span>}
                </p>
                <p className="truncate text-xs text-fg-subtle">{member.user.email}</p>
              </div>
              {isOwner ? (
                <select
                  aria-label={`Rolle von ${member.user.name}`}
                  value={member.role}
                  disabled={busy}
                  onChange={(event) => changeRole(member, event.target.value as ProjectRole)}
                  className={`!w-auto shrink-0 !py-1 text-xs ${fieldClass}`}
                >
                  {ROLES.map((r) => (
                    <option key={r} value={r}>
                      {ROLE_LABELS[r]}
                    </option>
                  ))}
                </select>
              ) : (
                <span className="text-xs font-medium text-fg-muted">{ROLE_LABELS[member.role]}</span>
              )}
              {(isOwner || self) && (
                <Button size="sm" variant="danger-ghost" disabled={busy} onClick={() => setRemoving(member)}>
                  {self ? 'Verlassen' : 'Entfernen'}
                </Button>
              )}
            </li>
          );
        })}
      </ul>

      {isOwner && (
        <form
          className="mt-5"
          onSubmit={(event) => {
            event.preventDefault();
            add();
          }}
        >
          <p className={labelClass}>Person hinzufügen</p>
          <div className="mt-1 flex gap-2">
            <input
              autoComplete="off"
              enterKeyHint="send"
              type="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="E-Mail-Adresse"
              aria-label="E-Mail-Adresse der Person"
              data-autofocus
              className={`min-w-0 flex-1 ${fieldClass}`}
            />
            <select aria-label="Rolle" value={role} onChange={(event) => setRole(event.target.value as ProjectRole)} className={`!w-auto shrink-0 ${fieldClass}`}>
              {ROLES.map((r) => (
                <option key={r} value={r}>
                  {ROLE_LABELS[r]}
                </option>
              ))}
            </select>
            <Button type="submit" variant="primary" disabled={busy || !email.trim()}>
              Hinzufügen
            </Button>
          </div>
          <p className="mt-1.5 text-xs text-fg-subtle">{ROLE_DESCRIPTIONS[role]}. Die Person braucht schon ein Konto.</p>
        </form>
      )}

      {error && (
        <p role="alert" className="mt-4 rounded-lg bg-danger-muted px-3 py-2 text-sm text-danger-text">
          {error}
        </p>
      )}

      <div className={dialogActionsClass}>
        <Button variant="ghost" disabled={busy} onClick={onClose}>
          Schließen
        </Button>
      </div>

      <ConfirmDialog
        open={removing !== null}
        title={removing?.user.id === me ? 'Notizbuch verlassen?' : `${removing?.user.name ?? ''} entfernen?`}
        message={
          removing?.user.id === me
            ? `Du siehst „${project.name}“ danach nicht mehr. Ein Owner kann dich wieder hinzufügen.`
            : `${removing?.user.name ?? ''} sieht „${project.name}“ danach nicht mehr.`
        }
        confirmLabel={removing?.user.id === me ? 'Verlassen' : 'Entfernen'}
        onConfirm={() => removing && void remove(removing)}
        onCancel={() => setRemoving(null)}
      />
    </Dialog>
  );
}
