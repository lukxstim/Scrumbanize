import { text } from './activityText.js';
import type { Db } from './database.js';
import { createActivityRepository } from './repositories/activityRepository.js';
import { createFoldersRepository } from './repositories/foldersRepository.js';
import { createMetaRepository } from './repositories/metaRepository.js';
import { createNotesRepository } from './repositories/notesRepository.js';
import { createProjectsRepository } from './repositories/projectsRepository.js';

export const SAMPLE_NOTEBOOK_NAME = 'Willkommen in Wissen';

const RECIPE_NOTE = `Ein Beispiel für ein Notizbuch voller Rezepte – ersetze es gern durch deine eigenen.

## Zutaten (2 Personen)

- 200 g Spaghetti
- 100 g Guanciale oder Speck
- 2 Eier und 1 Eigelb
- 50 g Pecorino, frisch gerieben
- Pfeffer

## Zubereitung

1. Nudeln in Salzwasser kochen.
2. Guanciale in Würfeln knusprig braten.
3. Eier mit Pecorino und viel Pfeffer verrühren.
4. Nudeln abgießen, mit dem Guanciale mischen, Pfanne vom Herd nehmen und die Eimasse unterrühren.`;

function guideNote(recipeId: number, welcome: { id: number; title: string } | undefined): string {
  return `# Wissen: alles, was zu keinem Projekt gehört

Oben links wechselst du zwischen **Projekte** (Notizen, Board, Kalender) und **Wissen**. Hier in Wissen sammelst du Notizen ohne Board – Rezepte, Mitschriften, Ideen. Dieses Notizbuch ist ein Beispiel: schau dich um, ändere alles und lösche es, wenn du es nicht mehr brauchst.

## Erste Schritte

- [ ] Links bei „Notizbücher“ mit **+** ein eigenes Notizbuch anlegen, mit Farbe und Symbol
- [ ] In der Notizliste einen **Ordner** anlegen und eine Notiz hineinziehen – so wie [Pasta Carbonara](note:${recipeId}) im Ordner „Rezepte“
- [ ] Einer Notiz **Tags** geben; links unter „Tags“ findest du dann alle Notizen damit
- [ ] **[[** tippen und eine Notiz oder Aufgabe auswählen – auch aus Projekten
- [ ] Über **⋯** neben einem Notizbuch: umbenennen, Symbol ändern oder mit anderen teilen

## Gut zu wissen

- „Alle Notizen“ zeigt die Notizen aus all deinen Notizbüchern auf einen Blick.
- Mit <mark data-color="yellow">Strg+K</mark> (Mac: ⌘K) suchst du überall – in Notizbüchern und Projekten.
- Aus einer Notiz wird mit „In Task umwandeln“ eine Aufgabe in einem Projekt deiner Wahl.${
    welcome ? `\n- Mehr über Projekte und das Board steht in [${welcome.title}](note:${welcome.id}).` : ''
  }`;
}

/**
 * Creates the sample notebook (US-22) once per installation: a guide to Wissen, linking to a recipe in a folder and,
 * if it still exists, to the welcome note of the sample project. Existing installations get it on their first start
 * with Wissen; once deleted it never comes back. With login, the administrators own it (on a new server the first
 * administrator becomes owner at the setup, like of every project). Returns its id, or undefined if it was made
 * before.
 */
export function seedSampleNotebookOnce(db: Db): number | undefined {
  const meta = createMetaRepository(db);
  if (meta.get('sample_notebook_id') !== undefined) return undefined;
  const projects = createProjectsRepository(db);
  const folders = createFoldersRepository(db);
  const notes = createNotesRepository(db);
  const activities = createActivityRepository(db);

  return db.transaction(() => {
    const created = projects.create({ name: SAMPLE_NOTEBOOK_NAME, color: 'amber', kind: 'notebook', icon: 'lightbulb' });
    // The name is taken by a notebook of the user: leave Wissen as it is.
    if (!created.ok) {
      meta.set('sample_notebook_id', '');
      return undefined;
    }
    const notebookId = created.project.id;
    const recipes = folders.create(notebookId, { name: 'Rezepte', parentId: null });
    if (!recipes.ok) throw new Error(`Sample folder could not be created: ${recipes.reason}`);
    const recipe = notes.create(notebookId, { title: 'Pasta Carbonara', content: RECIPE_NOTE, tags: ['beispiel', 'rezept'] }, recipes.folder.id);

    const sampleProjectId = meta.sampleProjectId();
    const welcome = sampleProjectId === null ? undefined : notes.list(sampleProjectId).find((n) => n.title === 'So funktioniert Scrumbanize');
    notes.create(notebookId, { title: 'So funktioniert Wissen', content: guideNote(recipe.id, welcome), tags: ['beispiel', 'einstieg'] });

    for (const { id } of db
      .prepare<[], { id: number }>(`SELECT id FROM users WHERE system_role = 'admin' AND password_hash IS NOT NULL AND disabled_at IS NULL`)
      .all()) {
      db.prepare(`INSERT OR IGNORE INTO project_members (project_id, user_id, role, created_at) VALUES (?, ?, 'owner', ?)`).run(
        notebookId,
        id,
        new Date().toISOString(),
      );
    }

    // One entry for the whole sample instead of one per note.
    db.prepare(`DELETE FROM activities WHERE project_id = ?`).run(notebookId);
    activities.record({
      projectId: notebookId,
      entityType: 'project',
      entityId: notebookId,
      actionType: 'create',
      description: text.sampleNotebookCreated(),
      metadata: { name: SAMPLE_NOTEBOOK_NAME, sample: true },
    });
    meta.set('sample_notebook_id', String(notebookId));
    return notebookId;
  })();
}
