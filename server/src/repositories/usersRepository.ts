import crypto from 'node:crypto';
import type { Db } from '../database.js';
import type { ProjectColor } from './projectsRepository.js';

export type UsersRepository = ReturnType<typeof createUsersRepository>;

export type SystemRole = 'admin' | 'user';
export type ProjectRole = 'owner' | 'member' | 'viewer';

/** A member of a project as the members dialog shows them. */
export interface Member {
  user: Pick<User, 'id' | 'name' | 'email' | 'avatarColor' | 'avatarUrl'>;
  role: ProjectRole;
}

export type MemberResult = { ok: true; member: Member } | { ok: false; reason: 'not_found' | 'already_member' | 'last_owner' };

/** A user as the API shows them; never the password hash. */
export interface User {
  id: number;
  email: string;
  name: string;
  systemRole: SystemRole;
  avatarColor: ProjectColor;
  /** The profile picture, or null for initials; its file name in the URL, so a new picture is a new address. */
  avatarUrl: string | null;
}

interface UserRow {
  id: number;
  email: string;
  name: string;
  password_hash: string | null;
  system_role: SystemRole;
  avatar_color: ProjectColor;
  avatar_file: string | null;
  disabled_at: string | null;
}

/** Sessions last 30 days from the last request ("angemeldet bleiben"). */
export const SESSION_DAYS = 30;
const DAY = 24 * 60 * 60 * 1000;
/** A session's expiry is pushed back at most this often, so not every request writes to the database. */
const TOUCH_INTERVAL = 60 * 1000;

/** The user of the desktop app (and of `AUTH=off`): no password, so nobody can log in as them. */
export const LOCAL_USER_EMAIL = 'local@scrumbanize.invalid';

export const hashToken = (token: string) => crypto.createHash('sha256').update(token).digest('hex');
export const newToken = () => crypto.randomBytes(32).toString('base64url');

/** Where the app loads a profile picture from (US-21c). */
export const avatarUrl = (userId: number, file: string | null) => (file ? `/api/users/${userId}/avatar?v=${encodeURIComponent(file)}` : null);

const toUser = (row: UserRow): User => ({
  id: row.id,
  email: row.email,
  name: row.name,
  systemRole: row.system_role,
  avatarColor: row.avatar_color,
  avatarUrl: avatarUrl(row.id, row.avatar_file),
});

/** Users, their sessions and project memberships (US-21). */
export function createUsersRepository(db: Db) {
  const selectById = db.prepare<[number], UserRow>(`SELECT * FROM users WHERE id = ?`);
  const selectByEmail = db.prepare<[string], UserRow>(`SELECT * FROM users WHERE email = ?`);
  const countAdmins = db.prepare<[], { n: number }>(
    `SELECT COUNT(*) AS n FROM users WHERE system_role = 'admin' AND password_hash IS NOT NULL AND disabled_at IS NULL`,
  );
  const insertUser = db.prepare<[string, string, string | null, SystemRole, ProjectColor, string, string], { id: number }>(
    `INSERT INTO users (email, name, password_hash, system_role, avatar_color, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?) RETURNING id`,
  );

  const insertSession = db.prepare<[string, number, string, string, string, string | null]>(
    `INSERT INTO sessions (token_hash, user_id, created_at, last_seen_at, expires_at, user_agent) VALUES (?, ?, ?, ?, ?, ?)`,
  );
  const selectSession = db.prepare<[string], { user_id: number; last_seen_at: string; expires_at: string }>(
    `SELECT user_id, last_seen_at, expires_at FROM sessions WHERE token_hash = ?`,
  );
  const touchSession = db.prepare<[string, string, string]>(`UPDATE sessions SET last_seen_at = ?, expires_at = ? WHERE token_hash = ?`);
  const deleteSession = db.prepare<[string]>(`DELETE FROM sessions WHERE token_hash = ?`);
  const deleteExpired = db.prepare<[string]>(`DELETE FROM sessions WHERE expires_at <= ?`);

  const insertMember = db.prepare<[number, number, ProjectRole, string]>(
    `INSERT INTO project_members (project_id, user_id, role, created_at) VALUES (?, ?, ?, ?)
     ON CONFLICT (project_id, user_id) DO UPDATE SET role = excluded.role`,
  );
  const selectAllProjectIds = db.prepare<[], { id: number }>(`SELECT id FROM projects`);
  const selectMembers = db.prepare<[number], UserRow & { role: ProjectRole }>(
    `SELECT u.*, m.role FROM project_members m JOIN users u ON u.id = m.user_id
     WHERE m.project_id = ?
     ORDER BY CASE m.role WHEN 'owner' THEN 0 WHEN 'member' THEN 1 ELSE 2 END, u.name COLLATE NOCASE, u.id`,
  );
  const selectMember = db.prepare<[number, number], { role: ProjectRole }>(`SELECT role FROM project_members WHERE project_id = ? AND user_id = ?`);
  const countOwners = db.prepare<[number], { n: number }>(`SELECT COUNT(*) AS n FROM project_members WHERE project_id = ? AND role = 'owner'`);
  const updateRole = db.prepare<[ProjectRole, number, number]>(`UPDATE project_members SET role = ? WHERE project_id = ? AND user_id = ?`);
  const deleteMember = db.prepare<[number, number]>(`DELETE FROM project_members WHERE project_id = ? AND user_id = ?`);

  const toMember = (row: UserRow & { role: ProjectRole }): Member => {
    const { id, name, email, avatarColor, avatarUrl } = toUser(row);
    return { user: { id, name, email, avatarColor, avatarUrl }, role: row.role };
  };
  const memberOf = (projectId: number, userId: number) => {
    const row = selectMembers.all(projectId).find((m) => m.id === userId);
    return row && toMember(row);
  };
  /** A project always keeps an owner: the last one can neither leave nor become something else. */
  const isLastOwner = (projectId: number, userId: number) =>
    selectMember.get(projectId, userId)?.role === 'owner' && countOwners.get(projectId)!.n === 1;

  function createUser(input: { email: string; name: string; passwordHash: string | null; systemRole: SystemRole }): User {
    const now = new Date().toISOString();
    const { id } = insertUser.get(input.email, input.name, input.passwordHash, input.systemRole, 'indigo', now, now)!;
    return toUser(selectById.get(id)!);
  }

  return {
    get(id: number): User | undefined {
      const row = selectById.get(id);
      return row && toUser(row);
    },

    /** The account behind a login: active, with a password. Its hash is only used for checking the password. */
    loginCandidate(email: string): { user: User; passwordHash: string } | undefined {
      const row = selectByEmail.get(email.trim());
      if (!row || !row.password_hash || row.disabled_at) return undefined;
      return { user: toUser(row), passwordHash: row.password_hash };
    },

    /** The first start of a server with login: nobody who could log in and administrate exists yet. */
    setupRequired(): boolean {
      return countAdmins.get()!.n === 0;
    },

    /**
     * The first administrator (setup wizard). They become owner of every existing project, since the data on the
     * server is theirs (an update from a version without users, or a restored desktop backup). Undefined if an
     * administrator exists already or the email is taken.
     */
    createFirstAdmin: db.transaction((input: { email: string; name: string; passwordHash: string }): User | undefined => {
      if (countAdmins.get()!.n > 0 || selectByEmail.get(input.email)) return undefined;
      const user = createUser({ ...input, systemRole: 'admin' });
      const now = new Date().toISOString();
      for (const { id } of selectAllProjectIds.all()) insertMember.run(id, user.id, 'owner', now);
      return user;
    }),

    /** The local user of the desktop app and of `AUTH=off`, created on first use. */
    localUser(): User {
      const row = selectByEmail.get(LOCAL_USER_EMAIL);
      if (row) return toUser(row);
      return createUser({ email: LOCAL_USER_EMAIL, name: 'Ich', passwordHash: null, systemRole: 'admin' });
    },

    /** Makes `userId` a member of `projectId` with `role` (replacing an earlier role). */
    addMember(projectId: number, userId: number, role: ProjectRole): void {
      insertMember.run(projectId, userId, role, new Date().toISOString());
    },

    /** Owners first, then members and viewers, each by name. */
    members(projectId: number): Member[] {
      return selectMembers.all(projectId).map(toMember);
    },

    /** An active account with a password (not the local user), for adding it to a project by email. */
    activeUserByEmail(email: string): User | undefined {
      const row = selectByEmail.get(email.trim());
      return row && row.password_hash && !row.disabled_at ? toUser(row) : undefined;
    },

    invite: db.transaction((projectId: number, userId: number, role: ProjectRole): MemberResult => {
      if (selectMember.get(projectId, userId)) return { ok: false, reason: 'already_member' };
      insertMember.run(projectId, userId, role, new Date().toISOString());
      return { ok: true, member: memberOf(projectId, userId)! };
    }),

    setRole: db.transaction((projectId: number, userId: number, role: ProjectRole): MemberResult => {
      if (!selectMember.get(projectId, userId)) return { ok: false, reason: 'not_found' };
      if (role !== 'owner' && isLastOwner(projectId, userId)) return { ok: false, reason: 'last_owner' };
      updateRole.run(role, projectId, userId);
      return { ok: true, member: memberOf(projectId, userId)! };
    }),

    removeMember: db.transaction((projectId: number, userId: number): MemberResult => {
      const member = memberOf(projectId, userId);
      if (!member) return { ok: false, reason: 'not_found' };
      if (isLastOwner(projectId, userId)) return { ok: false, reason: 'last_owner' };
      deleteMember.run(projectId, userId);
      return { ok: true, member };
    }),

    /** A new session; returns the token for the cookie (only its hash is stored). */
    createSession(userId: number, userAgent: string | undefined, now = new Date()): { token: string; expiresAt: Date } {
      deleteExpired.run(now.toISOString());
      const token = newToken();
      const expiresAt = new Date(now.getTime() + SESSION_DAYS * DAY);
      insertSession.run(hashToken(token), userId, now.toISOString(), now.toISOString(), expiresAt.toISOString(), userAgent?.slice(0, 300) ?? null);
      return { token, expiresAt };
    },

    /**
     * The user of a session token, if the session is valid and the account active. Extends the session to 30 days
     * from now (at most once a minute); `renewed` then holds the new expiry for the cookie.
     */
    sessionUser(token: string, now = new Date()): { user: User; renewed?: Date } | undefined {
      const hash = hashToken(token);
      const session = selectSession.get(hash);
      if (!session) return undefined;
      if (Date.parse(session.expires_at) <= now.getTime()) {
        deleteSession.run(hash);
        return undefined;
      }
      const row = selectById.get(session.user_id);
      if (!row || row.disabled_at || !row.password_hash) return undefined;
      if (now.getTime() - Date.parse(session.last_seen_at) < TOUCH_INTERVAL) return { user: toUser(row) };
      const renewed = new Date(now.getTime() + SESSION_DAYS * DAY);
      touchSession.run(now.toISOString(), renewed.toISOString(), hash);
      return { user: toUser(row), renewed };
    },

    /**
     * The user of a session token like sessionUser, but without extending the session: the live connection (US-24)
     * checks it now and then and cannot renew the cookie, so only requests keep a session alive.
     */
    peekSession(token: string, now = new Date()): User | undefined {
      const session = selectSession.get(hashToken(token));
      if (!session || Date.parse(session.expires_at) <= now.getTime()) return undefined;
      const row = selectById.get(session.user_id);
      return row && !row.disabled_at && row.password_hash ? toUser(row) : undefined;
    },

    deleteSession(token: string): void {
      deleteSession.run(hashToken(token));
    },

    // --- Profile (US-21c) ---------------------------------------------------------------------------------------

    updateProfile(userId: number, patch: { name?: string; avatarColor?: ProjectColor }): User {
      const row = selectById.get(userId)!;
      db.prepare(`UPDATE users SET name = ?, avatar_color = ?, updated_at = ? WHERE id = ?`).run(
        patch.name ?? row.name,
        patch.avatarColor ?? row.avatar_color,
        new Date().toISOString(),
        userId,
      );
      return toUser(selectById.get(userId)!);
    },

    passwordHashOf(userId: number): string | null {
      return selectById.get(userId)?.password_hash ?? null;
    },

    /** A new password ends every session of the account except `keepToken` (the one that changed it). */
    setPassword: db.transaction((userId: number, passwordHash: string, keepToken?: string) => {
      db.prepare(`UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?`).run(passwordHash, new Date().toISOString(), userId);
      if (keepToken) db.prepare(`DELETE FROM sessions WHERE user_id = ? AND token_hash != ?`).run(userId, hashToken(keepToken));
      else db.prepare(`DELETE FROM sessions WHERE user_id = ?`).run(userId);
    }),

    /** Sets (or removes, with null) the profile picture; returns the file it replaces, for deleting. */
    setAvatarFile(userId: number, file: string | null): string | null {
      const previous = selectById.get(userId)?.avatar_file ?? null;
      db.prepare(`UPDATE users SET avatar_file = ?, updated_at = ? WHERE id = ?`).run(file, new Date().toISOString(), userId);
      return previous;
    },

    avatarFileOf(userId: number): string | null {
      return selectById.get(userId)?.avatar_file ?? null;
    },

    /** Whether two people share a project, so one may see the other's picture (members, activity log). */
    shareAProject(userId: number, otherId: number): boolean {
      return (
        db
          .prepare(`SELECT 1 FROM project_members a JOIN project_members b ON a.project_id = b.project_id WHERE a.user_id = ? AND b.user_id = ? LIMIT 1`)
          .get(userId, otherId) !== undefined
      );
    },

    // --- One-time links: invitations and password resets (US-21c) ------------------------------------------------

    /**
     * A one-time link: invitations last 7 days and name an email, resets last 24 hours and name an account (earlier,
     * unused reset links of that account stop working). Only the token's hash is stored.
     */
    createToken(input: { kind: 'invite'; email: string; createdBy: number } | { kind: 'reset'; userId: number; createdBy: number }, now = new Date()) {
      const token = newToken();
      const expiresAt = new Date(now.getTime() + (input.kind === 'invite' ? 7 : 1) * DAY);
      if (input.kind === 'reset') db.prepare(`DELETE FROM auth_tokens WHERE kind = 'reset' AND user_id = ? AND used_at IS NULL`).run(input.userId);
      db.prepare(`INSERT INTO auth_tokens (token_hash, kind, user_id, email, created_by, expires_at) VALUES (?, ?, ?, ?, ?, ?)`).run(
        hashToken(token),
        input.kind,
        input.kind === 'reset' ? input.userId : null,
        input.kind === 'invite' ? input.email : null,
        input.createdBy,
        expiresAt.toISOString(),
      );
      return { token, expiresAt };
    },

    /** A valid (unused, unexpired) link of `kind`; for resets only if the account is still active. */
    findToken(token: string, kind: 'invite' | 'reset', now = new Date()): { email: string; user: User | null } | undefined {
      const row = db
        .prepare<[string, string, string], { user_id: number | null; email: string | null }>(
          `SELECT user_id, email FROM auth_tokens WHERE token_hash = ? AND kind = ? AND used_at IS NULL AND expires_at > ?`,
        )
        .get(hashToken(token), kind, now.toISOString());
      if (!row) return undefined;
      if (kind === 'invite') return { email: row.email!, user: null };
      const user = row.user_id === null ? undefined : selectById.get(row.user_id);
      if (!user || user.disabled_at || !user.password_hash) return undefined;
      return { email: user.email, user: toUser(user) };
    },

    /** Marks a link as used; false if it was used meanwhile (two tabs). */
    useToken(token: string, now = new Date()): boolean {
      return db.prepare(`UPDATE auth_tokens SET used_at = ? WHERE token_hash = ? AND used_at IS NULL`).run(now.toISOString(), hashToken(token)).changes === 1;
    },

    /** The account of an accepted invitation: a standard user, logged in right away. Undefined if the email is taken. */
    register: db.transaction((token: string, input: { email: string; name: string; passwordHash: string }): User | undefined => {
      if (selectByEmail.get(input.email)) return undefined;
      if (db.prepare(`UPDATE auth_tokens SET used_at = ? WHERE token_hash = ? AND used_at IS NULL`).run(new Date().toISOString(), hashToken(token)).changes !== 1) {
        return undefined;
      }
      return createUser({ ...input, systemRole: 'user' });
    }),

    /** Open invitations, newest first; the token hash serves as id (the token itself is not stored). */
    openInvitations(now = new Date()) {
      return db
        .prepare<[string], { token_hash: string; email: string; expires_at: string; created_by_name: string | null }>(
          `SELECT t.token_hash, t.email, t.expires_at, u.name AS created_by_name FROM auth_tokens t LEFT JOIN users u ON u.id = t.created_by
           WHERE t.kind = 'invite' AND t.used_at IS NULL AND t.expires_at > ? ORDER BY t.expires_at DESC`,
        )
        .all(now.toISOString())
        .map((r) => ({ id: r.token_hash, email: r.email, expiresAt: r.expires_at, createdBy: r.created_by_name }));
    },

    revokeInvitation(id: string): boolean {
      return db.prepare(`DELETE FROM auth_tokens WHERE token_hash = ? AND kind = 'invite' AND used_at IS NULL`).run(id).changes === 1;
    },

    // --- User management (US-21c) ---------------------------------------------------------------------------------

    /**
     * Every account except the local user, with the projects only they own (name only – administrators do not see
     * projects' contents), so a disabled account never leaves a project without owner.
     */
    accounts(): (User & { disabled: boolean; createdAt: string; soleOwnerOf: { id: number; name: string }[] })[] {
      const rows = db.prepare<[string], UserRow & { created_at: string }>(`SELECT * FROM users WHERE email != ? ORDER BY name COLLATE NOCASE, id`).all(LOCAL_USER_EMAIL);
      return rows.map((row) => ({ ...toUser(row), disabled: row.disabled_at !== null, createdAt: row.created_at, soleOwnerOf: soleOwnerOf(row.id) }));
    },

    /** Administrators who can log in; the last one may neither lose the role nor be disabled. */
    activeAdminCount(): number {
      return countAdmins.get()!.n;
    },

    isActiveAdmin(userId: number): boolean {
      const row = selectById.get(userId);
      return !!row && row.system_role === 'admin' && !!row.password_hash && !row.disabled_at;
    },

    soleOwnerOf,

    setSystemRole(userId: number, role: SystemRole): void {
      db.prepare(`UPDATE users SET system_role = ?, updated_at = ? WHERE id = ?`).run(role, new Date().toISOString(), userId);
    },

    /** Disabling ends the account's sessions and its open reset links at once. */
    setDisabled: db.transaction((userId: number, disabled: boolean) => {
      db.prepare(`UPDATE users SET disabled_at = ?, updated_at = ? WHERE id = ?`).run(disabled ? new Date().toISOString() : null, new Date().toISOString(), userId);
      if (disabled) {
        db.prepare(`DELETE FROM sessions WHERE user_id = ?`).run(userId);
        db.prepare(`DELETE FROM auth_tokens WHERE kind = 'reset' AND user_id = ?`).run(userId);
      }
    }),

    /** Makes `toUserId` an owner of every project that only `userId` owns; returns how many. */
    handOver: db.transaction((userId: number, toUserId: number): number => {
      const projects = soleOwnerOf(userId);
      const now = new Date().toISOString();
      for (const project of projects) insertMember.run(project.id, toUserId, 'owner', now);
      return projects.length;
    }),
  };

  /** Projects (also in the trash) whose only owner is `userId`. */
  function soleOwnerOf(userId: number): { id: number; name: string }[] {
    return db
      .prepare<[number], { id: number; name: string }>(
        `SELECT p.id, p.name FROM projects p JOIN project_members m ON m.project_id = p.id AND m.user_id = ? AND m.role = 'owner'
         WHERE (SELECT COUNT(*) FROM project_members o WHERE o.project_id = p.id AND o.role = 'owner') = 1
         ORDER BY p.name COLLATE NOCASE`,
      )
      .all(userId);
  }
}
