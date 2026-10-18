import type { Db } from '../database.js';

/** The projects (and notebooks) the current request's user may see; null: no restriction (no request user). */
export type Visibility = () => Set<number> | null;

// One per database, set by createApp; repositories created elsewhere (sample project, tests) see everything.
const registry = new WeakMap<Db, Visibility>();

export function setVisibility(db: Db, visibility: Visibility): void {
  registry.set(db, visibility);
}

/**
 * For content that points into other projects (US-22): links, backlinks, tasks created from a note elsewhere.
 * Repositories ask this instead of taking a user everywhere; what is not visible is shown as "no access".
 */
export function visibleProjects(db: Db): Set<number> | null {
  return registry.get(db)?.() ?? null;
}

/** Whether a project is visible; true without a restriction. */
export function canSee(visible: Set<number> | null, projectId: number): boolean {
  return visible === null || visible.has(projectId);
}
