const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");

function prepareHtml(html, buildId) {
  const assets = new Set();
  const output = html.replace(/\b(src|href)="(\.\/[^"?#]+\.(?:js|css))(?:\?[^\"]*)?"/g, (_match, attribute, file) => {
    const url = `${file}?build=${buildId}`;
    assets.add(url);
    return `${attribute}="${url}"`;
  });
  return { html: output, assets: [...assets] };
}

function prepareWorker(worker, assets, buildId) {
  const existing = JSON.parse(worker.match(/const APP_FILES = (\[[\s\S]*?\]);/)[1]);
  const files = [...new Set([...existing.filter(file => !/\.(?:js|css)(?:\?|$)/.test(file)), ...assets])];
  return worker.replace(/const CACHE_NAME = "[^"]+";/, `const CACHE_NAME = "rfl-f1-league-${buildId}";`)
    .replace(/const APP_FILES = \[[\s\S]*?\];/, `const APP_FILES = ${JSON.stringify(files, null, 2)};`);
}

if (require.main === module) {
  const root = path.resolve(__dirname, "..");
  const buildId = execFileSync("git", ["rev-parse", "--short=12", "HEAD"], { cwd: root, encoding: "utf8" }).trim();
  const prepared = prepareHtml(fs.readFileSync(path.join(root, "index.html"), "utf8"), buildId);
  const worker = prepareWorker(fs.readFileSync(path.join(root, "service-worker.js"), "utf8"), prepared.assets, buildId);
  fs.writeFileSync(path.join(root, "index.html"), prepared.html);
  fs.writeFileSync(path.join(root, "service-worker.js"), worker);
  console.log(`Prepared web build ${buildId} with ${prepared.assets.length} versioned assets.`);
}

module.exports = { prepareHtml, prepareWorker };
