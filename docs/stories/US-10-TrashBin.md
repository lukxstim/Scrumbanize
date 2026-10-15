# User Story 10: Papierkorb & Wiederherstellung (Trash Bin)

## Kontext & Ziel
Als Nutzer möchte ich gelöschte Notizen, Aufgaben und Projekte in einen Papierkorb verschieben statt sie sofort unwiderruflich zu löschen, damit ich versehentlich gelöschte Inhalte problemlos wiederherstellen kann.

## Fachliche Anforderungen (Acceptance Criteria)
1. **Soft Delete statt Hard Delete:**
   - Das Löschen von Notizen, Tasks und Projekten setzt standardmäßig ein `deleted_at`-Zeitstempel-Flag (Soft Delete), anstatt den Datensatz sofort aus der SQLite-Datenbank zu entfernen.
2. **Papierkorb-Ansicht (Trash View):**
   - Ein eigener Bereich oder Tab („Papierkorb“), der alle gelöschten Elemente des aktuellen Projekts (oder projektübergreifend) auflistet.
3. **Wiederherstellen (Restore):**
   - Mit einem Klick auf „Wiederherstellen“ wird ein Element in seinen vorherigen Zustand und an seinen Ursprungsort zurückgebracht.
4. **Endgültiges Löschen & Leeren:**
   - Nutzer können einzelne Elemente endgültig löschen (Purge) oder den gesamten Papierkorb auf einmal leeren.
5. **Aktivitäts-Protokollierung:**
   - Das Löschen, Wiederherstellen und endgültige Vernichten von Elementen wird im Activity Log (aus US-07) protokolliert.