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


## Web Push (1.3.11)

The mobile PWA supports opt-in system notifications after signing in. iPhone/iPad users must launch a Home Screen installation (iOS 16.4+). Settings contains separate news/friend-request preferences and a rate-limited test button. No permission prompt runs automatically. Sign-out and account switches unsubscribe the current browser.

Server setup is deployed in project wecrosfultwswyswwkwt: apply backend/push.sql once, deploy backend/rfl-push/index.ts as rfl-push, and use the function's custom x-rfl-worker authentication instead of legacy JWT verification. The random worker token and generated VAPID key pair live only in the RLS-protected rfl_push_config table; never export them into the app/repository. A one-minute cron job invokes the worker. Only the VAPID public key is readable through an RPC. Subscription management requires the signed-in user's identity.

Friend inserts enqueue recipient-only jobs. The fixed published release feed produces deduplicated news jobs only for devices subscribed before publication. The worker checks current preferences and pending-request ownership before delivery, retries transient failures, and removes expired push subscriptions (404/410). Historical notes are not replayed to new subscriptions. Delivered/failed jobs expire after seven days. The service worker opens only the app's own allowlisted screens.

Verification: automated permission/denial/account-switch/error/click tests, anonymous-access rejection, live RPC save/test/remove in a rolled-back transaction, and successful cron/worker HTTP 200. Actual OS delivery must additionally be checked using Settings > Test notification on a physical opted-in phone.
