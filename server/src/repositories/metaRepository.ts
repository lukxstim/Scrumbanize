import type { Db } from '../database.js';

export type MetaRepository = ReturnType<typeof createMetaRepository>;

/** Key/value facts about the installation (table app_meta). */
export function createMetaRepository(db: Db) {
  const select = db.prepare<[string], { value: string }>(`SELECT value FROM app_meta WHERE key = ?`);
  const upsert = db.prepare<[string, string]>(
    `INSERT INTO app_meta (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value`,
  );
  const liveProject = db.prepare<[number], { id: number }>(`SELECT id FROM live_projects WHERE id = ?`);

  return {
    get: (key: string): string | undefined => select.get(key)?.value,
    set: (key: string, value: string): void => {
      upsert.run(key, value);
    },

    /** The sample project created on the first start, while it exists outside the trash; otherwise null. */
    sampleProjectId(): number | null {
      const id = Number(select.get('sample_project_id')?.value);
      return Number.isInteger(id) && liveProject.get(id) ? id : null;
    },
  };
}
