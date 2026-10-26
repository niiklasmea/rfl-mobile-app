const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const source = fs.readFileSync(require("node:path").join(__dirname, "../app-updates.js"), "utf8");
const item = { id: "release-1", publishedAt: "2026-10-26T18:00:00Z", title: { de: "Neuigkeiten" }, body: { de: "Termine geändert." }, action: "calendar" };

function boot(storage = new Map()) {
  const events = [];
  const window = { RFL_NEWS_SEED: { schemaVersion: 1, items: [item, item, { ...item, id: "bad", publishedAt: "invalid" }] }, dispatchEvent: event => events.push(event.type), setInterval() {}, addEventListener() {} };
  vm.runInNewContext(source, { window, document: { hidden: false, addEventListener() {} }, navigator: { onLine: false }, location: { protocol: "file:" }, localStorage: { getItem: key => storage.get(key), setItem: (key, value) => storage.set(key, value) }, Event: class Event { constructor(type) { this.type = type; } }, Date, URL, AbortSignal, Set, Map });
  return { news: window.RflUpdates, storage, events };
}

test("bundled app news are available offline and survive a restart as read", () => {
  const { news, storage } = boot();
  assert.equal(news.getItems().length, 1, "duplicate and malformed entries are ignored");
  assert.equal(news.getUnreadCount(), 1);
  news.markAllRead();
  assert.equal(boot(storage).news.getUnreadCount(), 0);
});

test("a second account on the same device gets its own unread state", () => {
  const { news } = boot();
  news.setAccount("driver-a"); news.markAllRead();
  news.setAccount("driver-b");
  assert.equal(news.getUnreadCount(), 1);
  news.setAccount("driver-a");
  assert.equal(news.getUnreadCount(), 0);
});
