# User Story 18: System-Tray Integration & Fälligkeits-Erinnerungen

## Kontext & Ziel
Als Nutzer möchte ich, dass die Anwendung dezent in der Windows-Taskleiste (System Tray) weiterläuft und mich an anstehende Deadlines erinnert, damit ich keine fälligen Aufgaben verpasse.

## Fachliche Anforderungen (Acceptance Criteria)
1. **System-Tray Minimierung:**
   - Beim Schließen oder Minimieren kann die App optional in den Windows System Tray (neben der Uhr) minimiert werden.
   - Klick auf das Tray-Icon oder Tastenkombination (z. B. `Alt + Space`) bringt die App sofort in den Vordergrund.
2. **Windows-Desktop-Benachrichtigungen:**
   - Native Windows-Benachrichtigung, wenn eine Aufgabe ihr Fälligkeitsdatum (`due_date`) erreicht oder heute fällig ist.
3. **Einstellungen:**
   - Option im Einstellungs-Menü, um Tray-Minimierung und Benachrichtigungen ein- oder auszuschalten.