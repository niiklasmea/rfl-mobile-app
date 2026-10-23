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
