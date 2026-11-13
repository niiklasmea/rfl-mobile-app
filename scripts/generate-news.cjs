const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const { groupNews } = require("./group-news.cjs");
const root = path.resolve(__dirname, "..");
const git = (...args) => execFileSync("git", args, { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], maxBuffer: 8 * 1024 * 1024 }).trim();
const currentVersion = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8")).version;
// Keep the existing visible history when today's fixes collapse into one entry;
// grouping must not bring older, already hidden notices back into the bell.
const firstNewsCommit = "5b7f185c4ca323590f0bd0e2191b15ac9ebd6af2";
const rows = git("log", "-40", "--format=%H%x09%cI%x09%s", `${firstNewsCommit}^..HEAD`).split("\n").filter(Boolean);
const release139 = {
  de: "📱 iPhone-Menü besser erreichbar\n🏎️ Startanimation verbessert\n👤 Klarere Konto- und Benutzernamen-Hilfe\n🔔 Neuigkeiten direkt in der Glocke",
  en: "📱 Easier access to the iPhone menu\n🏎️ Improved startup animation\n👤 Clearer account and username help\n🔔 App news directly in the bell"
};
const appFiles = /^(index\.html|friends\.js|app-updates\.js|startup\.js|ui-fixes\.css|profile-crop\.(js|css)|desktop\/|package\.json)/;
const readAt = (sha, file) => {
  try { return git("show", `${sha}:${file}`); } catch { return ""; }
};
const calendarAt = sha => {
  const match = readAt(sha, "index.html").match(/(?:const|let) races=(\[\[.*?\]\]);/);
  return match ? match[1] : "";
};
const items = [];
const versionsSeen = new Set();
for (const row of rows) {
  const [id, publishedAt, subject] = row.split("\t");
  const files = git("diff-tree", "--root", "--no-commit-id", "--name-only", "-r", id).split("\n");
  if (!files.some(file => appFiles.test(file))) continue;
  const calendarChanged = files.includes("index.html") && calendarAt(id) && calendarAt(`${id}^`) && calendarAt(id) !== calendarAt(`${id}^`);
  let version = "";
  try { version = JSON.parse(readAt(id, "package.json")).version || ""; } catch {}
  if (!calendarChanged && versionsSeen.has(version || "legacy")) continue;
  if (!calendarChanged) versionsSeen.add(version || "legacy");
  let title = { de: version ? `RFL-APP ${version}` : "RFL-APP aktualisiert", en: version ? `RFL-APP ${version}` : "RFL-APP updated" };
  let body = { de: "Die App wurde verbessert. Öffne sie neu, um die aktuelle Version zu verwenden.", en: "The app has been improved. Reopen it to use the latest version." };
  let action = "home";
  if (calendarChanged) {
    title = { de: "Rennkalender aktualisiert", en: "Race calendar updated" };
    body = { de: "Im Rennkalender wurden Termine geändert. Prüfe die aktuellen Renndaten.", en: "Race dates have changed. Check the current calendar." };
    action = "calendar";
  } else if (files.includes("friends.js")) {
    body = { de: "Konto, Freundesliste und Benachrichtigungen wurden verbessert.", en: "Account, friends and notifications have been improved." };
  } else if (files.some(file => file.startsWith("desktop/"))) {
    body = { de: "Die Windows-App wurde verbessert. Ein bereitstehendes Update lässt sich beim Neustart installieren.", en: "The Windows app has been improved. Restart to install an available update." };
  }
  if (items.length === 0) {
    title = { de: `RFL-APP ${currentVersion}`, en: `RFL-APP ${currentVersion}` };
    body = { de: subject.slice(0, 180), en: body.en };
  }
  if (calendarChanged) body = { de: "🏁 Saisonstart: 2. Januar · danach wöchentlich\n🇳🇱 Neu dabei: Niederlande · Miami jetzt Rennen 4", en: "🏁 Season starts January 2 · weekly races\n🇳🇱 Netherlands added · Miami is now round 4" };
  if (version === "1.4.1" && !calendarChanged) body = { de: "🔔 Benachrichtigungen leichter wieder aktivieren\n📱 Stabilere Handy-Verbindung", en: "🔔 Easier notification reactivation\n📱 More reliable phone connection" };
  if (version === "1.4.2" && !calendarChanged) body = { de: "🔔 Handy-Verbindung gezielt neu einrichten\n⚙️ Klare Rückmeldung beim Aktivieren", en: "🔔 Reset a stuck phone notification connection\n⚙️ Clear feedback when enabling notifications" };
  if (version === "1.4.0" && !calendarChanged) body = { de: "✨ Hilfe und Gründerprofil weiter aufgeräumt\n🔢 Neue Versionszählung: nach .9 folgt die nächste Reihe", en: "✨ Cleaner Help and founder profile\n🔢 New version numbering: .9 rolls into the next series" };
  if (version === "1.3.15" && !calendarChanged) body = { de: "💬 Neues Hilfe-Fenster mit Discord-Kontakt\n🏁 Fünf Fairplay-Regeln · aufgeräumte Seiten\n📸 Besserer Bildausschnitt beim Gründerprofil", en: "💬 New Help window with Discord contact\n🏁 Five fair-play rules · cleaner pages\n📸 Improved founder portrait framing" };
  if (version === "1.3.14" && !calendarChanged) body = { de: "🏎️ Neues Intro mit Startampel, Funken und Lichtspuren\n✨ Große Logo-Enthüllung · weicher Übergang in die App", en: "🏎️ New intro with starting lights, sparks and speed trails\n✨ Bold logo reveal · smooth transition into the app" };
  if (version === "1.3.13" && !calendarChanged) body = { de: "🎬 Neuer Rennkalender-Trailer als Video mit Ton\n🏎️ Kürzeres, flüssigeres Start-Intro", en: "🎬 New race calendar video trailer with sound\n🏎️ Shorter, smoother startup intro" };
  if (version === "1.3.12" && !calendarChanged) body = { de: "🎬 Neuer Saison-Trailer zum Rennkalender\n🏁 Auf der Startseite und im Rennkalender ansehen", en: "🎬 New race calendar season trailer\n🏁 Watch it on Home and in the race calendar" };
  if (version === "1.3.11" && !calendarChanged) body = { de: "🔔 Handy-Benachrichtigungen für Anfragen und Neuigkeiten\n⚙️ In den Einstellungen aktivieren und testen", en: "🔔 Phone notifications for requests and app news\n⚙️ Enable and test them in Settings" };
  if (version === "1.3.9" && !calendarChanged) body = release139;
  items.push({ id, publishedAt, title, body, action, releaseVersion: version });
  if (items.length === 30) break;
}
const groups = JSON.parse(fs.readFileSync(path.join(root, "release-groups.json"), "utf8"));
const payload = { schemaVersion: 1, items: groupNews(items, groups).slice(0, 6) };
fs.writeFileSync(path.join(root, "release-notes.json"), JSON.stringify(payload, null, 2) + "\n");
fs.writeFileSync(path.join(root, "release-notes.js"), "window.RFL_NEWS_SEED = " + JSON.stringify(payload) + ";\n");
console.log(`Prepared ${payload.items.length} app news items for ${currentVersion}.`);
