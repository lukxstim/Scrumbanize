# User Story 16: Backup, Export & Import Assistent

## Kontext & Ziel
Als Nutzer möchte ich unkompliziert vollständige Backups meiner Daten erstellen, einzelne Notizen/Boards exportieren und bestehende Daten aus anderen Tools importieren können.

## Fachliche Anforderungen (Acceptance Criteria)
1. **1-Klick Backup & Restore:**
   - Ein Button in den Einstellungen zum Erstellen einer kompletten `.zip`-Sicherungsdatei (enthält `scrumbanize.db` und den `uploads/`-Ordner).
   - Wiederherstellungs-Funktion, die ein ausgewähltes Backup-Archiv entpackt und einspielt.
2. **Export-Optionen:**
   - Notizen als Markdown-Datei (`.md`) oder HTML exportieren.
   - Board-Daten als CSV-Datei (z. B. für Excel) exportieren.
3. **Import-Wizard:**
   - Import-Funktion für standardmäßige `.md`-Dateien oder Markdown-Ordnerstrukturen (z. B. aus Obsidian/Notion).