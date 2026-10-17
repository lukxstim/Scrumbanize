# User Story 14: Analytics & Reporting Dashboard

## Kontext & Ziel
Als Nutzer möchte ich ein übersichtliches Dashboard mit Statistiken zur Produktivität einsehen können, um den Fortschritt meiner Projekte zu analysieren und Engpässe im Workflow zu erkennen.

## Fachliche Anforderungen (Acceptance Criteria)
1. **Analytics-Ansicht:** Ein neuer Bereich/Modal „Statistiken & Reporting“ im aktuellen Projekt.
2. **Velocity & Fertigstellungs-Chart:** Visuelle Darstellung (z. B. Balken- oder Liniendiagramm) der erledigten Tasks pro Woche oder Monat.
3. **Durchlaufzeiten (Cycle Time):** Berechnung der durchschnittlichen Dauer von der Erstellung/Backlog bis zum Status „Done“.
4. **WIP-Limit Histrogramm:** Übersicht, wie oft und in welchen Spalten WIP-Limits überschritten wurden.
5. **Persistenz & Live-Daten:** Die Kennzahlen werden dynamisch aus den vorhandenen SQLite-Daten (Tasks & Activity Log) berechnet.