const test = require("node:test");
const assert = require("node:assert/strict");
const { prepareHtml, prepareWorker } = require("../scripts/prepare-web.cjs");

test("a new web build cannot reuse the previous worker's account script", () => {
  const source = '<script src="./friends.js"></script><link href="./ui-fixes.css"><script src="https://cdn.example/sdk.js"></script>';
  const first = prepareHtml(source, "build-a");
  const next = prepareHtml(first.html, "build-b");
  assert.deepEqual(next.assets, ["./friends.js?build=build-b", "./ui-fixes.css?build=build-b"]);
  assert.equal(next.html.includes("build-a"), false);
  assert.equal(next.html.includes('src="https://cdn.example/sdk.js"'), true);
  assert.equal(prepareHtml(next.html, "build-b").html, next.html);
  const worker = prepareWorker('const CACHE_NAME = "rfl-f1-league-old";\nconst APP_FILES = ["./", "./index.html", "./friends.js", "./icons/icon.png"];', next.assets, "build-b");
  assert.equal(worker.includes('"./friends.js"'), false);
  assert.equal(worker.includes('"./friends.js?build=build-b"'), true);
  assert.equal(worker.includes('"./index.html"'), true);
  assert.equal(worker.includes('rfl-f1-league-build-b'), true);
});
