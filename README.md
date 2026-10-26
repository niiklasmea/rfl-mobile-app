# RFL-APP

Die RFL-APP ist für Windows-PCs als eigenes Windows-Programm und für Smartphones als installierbare Web-App verfügbar.

## Installieren

- **Windows-PC:** [Windows-Installer herunterladen](https://github.com/niiklasmea/rfl-mobile-app/releases/latest/download/RFL-APP-Setup-1.3.8.exe), anschließend die heruntergeladene `.exe` öffnen und den Installationsordner auswählen.
- **Android:** [RFL-APP öffnen](https://niiklasmea.github.io/rfl-mobile-app/) und im Chrome-Menü **App installieren** oder **Zum Startbildschirm hinzufügen** auswählen.
- **iPhone:** [RFL-APP öffnen](https://niiklasmea.github.io/rfl-mobile-app/) in Safari, **Teilen** und **Zum Home-Bildschirm** wählen.

Auf dem Handy werden Profilname und eigenes Profilbild pro Gerät gespeichert.

## Entwicklung

Die Website-Dateien liegen im Repository-Stamm. Die Windows-Version nutzt dieselben Dateien und wird aus einem Versions-Tag `v*` gebaut und als GitHub Release veröffentlicht.

Lokaler Windows-Build: `pnpm install` und `pnpm run build:win`.
# RFL-APP 1.3.9

This release reserves the iPhone safe areas for the status bar and display cutouts, starts the Windows intro when its window becomes visible, and improves account feedback and recovery UI.

The bell includes a public app news feed as well as private friend requests. `scripts/generate-news.cjs` generates the feed from published source changes during the Pages and Windows builds. Calendar changes receive a calendar notice. The feed is refreshed while the app is open; the bundled copy also works offline. Read markers are stored separately per account on the device.

The username-availability RPC is defined in `backend/username-availability.sql`. It returns only a boolean and must be installed in the configured Supabase project before publishing this frontend. Existing uniqueness constraints remain authoritative.

Run `node --test tests/*.test.cjs` for startup and news regression checks. Account UI scenarios should be exercised against an isolated mock backend, without changing real users' passwords or sending test emails to users.

Password recovery still requires working SMTP credentials in Supabase. A successful UI request must never be treated as proof that a message reached the recipient's inbox.
