# US-25: Mobile Web App & PWA (Progressive Web App)

## User Story
Als **Smartphone- & Tablet-Nutzer**
möchte ich **Scrumbanize flüssig im mobilen Browser bedienen und als App auf meinem Homescreen installieren können**,
damit **ich auch unterwegs schnellen Zugriff auf meine Boards und Notizen habe**.

---

## Kontext & Zweck
Die Web-Version soll auf mobilen Endgeräten wie eine native App funktionieren. Durch PWA-Standards kann Scrumbanize ohne App-Store-Zwang auf iOS und Android installiert werden.

---

## Akzeptanzkriterien

### 1. PWA-Manifest & Service Worker
- [x] Web App Manifest (`manifest.json`) mit App-Icons, Start-URL und Standalone-Display-Modus.
- [x] Service Worker für schnelles Cachen statischer Assets und Offline-Anzeige der UI.

### 2. Mobile Touch & Responsive UI
- [x] Touch-optimiertes Drag-and-Drop auf dem Kanban-Board für Smartphones und Tablets.
- [x] Mobile Navigation (Bottom Navigation Bar oder ausklappbares Menü auf kleinen Bildschirmen).
- [x] Optimierte Formulare und Modals für Bildschirmtastaturen.

---

## Technische Aufgaben
1. **PWA Integration:** Konfiguration in Vite (`vite-plugin-pwa`) und Erstellen der Manifest-Assets.
2. **CSS/Tailwind Refinements:** Responsive Breakpoints (`sm:`, `md:`) für Board- und Notizansichten überprüfen und anpassen.