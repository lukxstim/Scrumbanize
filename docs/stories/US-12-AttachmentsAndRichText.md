# User Story 12: File Attachments & Rich-Text Formatting

## Kontext & Ziel
Als Nutzer möchte ich Dateien an Notizen und Aufgaben anhängen sowie Text farblich hervorheben und formatieren können, um Inhalte besser zu strukturieren.

## Fachliche Anforderungen (Acceptance Criteria)
1. **Dateianhänge (Attachments):**
   - Drag & Drop oder Upload-Button für Bilder, PDFs und Dokumente in Notizen und Tasks.
   - Speicherung im lokalen `uploads/`-Ordner (bzw. `app.getPath('userData')/uploads` im Desktop-Modus).
   - Vorschau für Bilder und Download-/Öffnen-Funktion für Dateien.
2. **Rich-Text & Word-Funktionen:**
   - WYSIWYG-Formatierung in Notizen/Tasks (Text-Highlighting/Farben, Fett, Kursiv, Überschriften, Checklisten).