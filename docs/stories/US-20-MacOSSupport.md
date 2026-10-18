# US-20: macOS-Unterstützung & Cross-Platform Multi-Architektur-Builds

## User Story
Als **Entwickler und Nutzer auf macOS (Apple Silicon / Intel)**
möchte ich **die Scrumbanize Desktop-App als `.dmg`-Installer direkt aus dem Repository bzw. den GitHub Releases herunterladen und installieren können**,
damit **ich das Tool auf Mac-Geräten uneingeschränkt nutzen kann**.

---

## Kontext & Zweck
Scrumbanize wird als Electron-Desktop-Anwendung entwickelt. Bisher ist der Paketierungsprozess primär auf Windows (`.exe`) ausgerichtet. Da immer mehr Teammitglieder und Nutzer macOS (sowohl mit Apple Silicon `arm64` als auch Intel `x64` Prozessoren) verwenden, soll der Paketierungs- und Release-Prozess so erweitert werden, dass automatisch einsatzfähige macOS-Installationspakete (`.dmg` / `.zip`) generiert werden.

---

## Akzeptanzkriterien

### 1. `electron-builder` Konfiguration
- [ ] Erweiterung der `electron-builder`-Konfiguration (`package.json` oder `electron-builder.yml`) um ein eigenes `mac`-Target.
- [ ] Unterstützung beider Prozessor-Architekturen:
  - **`arm64`** (für neuere Apple Silicon Macs: M1, M2, M3, M4)
  - **`x64`** (für ältere Intel-basierte Macs)
- [ ] Erstellung eines benutzerfreundlichen Drag-and-Drop `.dmg`-Installers (App-Icon -> `/Applications`-Verzeichnis).

### 2. Automatisierte Builds (GitHub Actions CI/CD)
- [ ] Anpassung / Erstellung der GitHub-Workflow-Datei (z. B. `.github/workflows/build.yml`), um bei einem Release-Tag sowohl Windows (`.exe`) als auch macOS (`.dmg` / `.zip`) automatisiert zu bauen.
- [ ] Ausführung des macOS-Build-Schritts auf einer `macos-latest` GitHub-Runner-Instanz.
- [ ] Automatische Anheftung der generierten `.dmg`-Dateien an das entsprechende GitHub Release.

### 3. Dokumentation & Erste-Schritte-Anleitung
- [ ] Aktualisierung der `README.md` um eine kurze macOS-Installationsanleitung.
- [ ] Dokumentation des Hinweises zum ersten Start unter macOS bezüglich Gatekeeper (da die App unsigniert / ohne gebührenpflichtiges Apple-Entwicklerzertifikat ausgeliefert wird: *Rechtsklick -> Öffnen -> Bestätigen*).

---

## Technische Aufgaben
1. **Konfiguration anpassen:** `package.json` / `electron-builder.yml` um `mac`- und `dmg`-Blöcke ergänzen.
2. **Build-Skripte im Monorepo:** Hinzufügen von `npm run desktop:dist:mac` in der Root-`package.json`.
3. **CI/CD Pipeline:** Erstellen/Anpassen des Matrix-Builds in GitHub Actions für Windows und macOS.
4. **Testing:** Verifizieren des Installationsträgers auf Apple Silicon und Intel-Prozessoren.

---

## Abgrenzung (Out of Scope)
- Kostenpflichtige Apple Code-Signing-Zertifikate (Notarisierung via Apple Developer Account).
- Mac App Store Distribution (App wird über GitHub Releases verteilt).