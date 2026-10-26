const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const root = path.resolve(__dirname, "..");
const git = (...args) => execFileSync("git", args, { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], maxBuffer: 8 * 1024 * 1024 }).trim();
const currentVersion = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8")).version;
// Older release notices were removed at the owner's request. New updates still appear automatically.
const firstNewsCommit = "4e49c80e10691dacf3d9e7151c11ea724d039705";
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
  if (version === "1.3.9" && !calendarChanged) body = release139;
  items.push({ id, publishedAt, title, body, action });
  if (items.length === 6) break;
}
const payload = { schemaVersion: 1, items };
fs.writeFileSync(path.join(root, "release-notes.json"), JSON.stringify(payload, null, 2) + "\n");
fs.writeFileSync(path.join(root, "release-notes.js"), "window.RFL_NEWS_SEED = " + JSON.stringify(payload) + ";\n");
console.log(`Prepared ${items.length} app news items for ${currentVersion}.`);
