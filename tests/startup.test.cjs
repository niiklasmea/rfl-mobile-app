const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const source = fs.readFileSync(require("node:path").join(__dirname, "../startup.js"), "utf8");

async function boot({ desktop = false, hidden = false, reduced = false } = {}) {
  const classes = new Set();
  const events = new Map();
  const timers = new Map();
  let nextId = 0;
  let visibleCallback;
  let now = 0;
  const intro = { classList: { add: x => classes.add(x), remove: x => classes.delete(x), contains: x => classes.has(x), toggle: (x, on) => on ? classes.add(x) : classes.delete(x) }, setAttribute() {}, remove() { this.removed = true; } };
  const document = {
    hidden,
    getElementById: id => id === "appIntro" ? intro : { addEventListener() {} },
    addEventListener(type, callback) { const list = events.get(type) || []; list.push(callback); events.set(type, list); },
    removeEventListener(type, callback) { events.set(type, (events.get(type) || []).filter(value => value !== callback)); }
  };
  const context = { document, performance: { now: () => now }, setTimeout: (fn, delay) => { const id = ++nextId; timers.set(id, { fn, delay }); return id; }, clearTimeout: id => timers.delete(id) };
  context.window = { matchMedia: () => ({ matches: reduced }), addEventListener() {} };
  if (desktop) context.window.appSettings = { isWindowVisible: async () => false, onAppVisible: fn => { visibleCallback = fn; return () => {}; } };
  vm.runInNewContext(source, context);
  await Promise.resolve();
  return { classes, intro, timers, show: () => visibleCallback(), setTime: value => { now = value; }, changeVisibility(value) { document.hidden = value; for (const callback of [...(events.get("visibilitychange") || [])]) callback(); } };
}

test("Windows intro waits for the visible window even after a slow load", async () => {
  const app = await boot({ desktop: true });
  app.setTime(30000);
  assert.equal(app.classes.has("show"), false);
  assert.equal(app.timers.size, 0);
  app.show();
  assert.equal(app.classes.has("show"), true);
  assert.equal([...app.timers.values()][0].delay, 3600);
  app.show();
  assert.equal(app.timers.size, 1, "later focus events must not restart the intro");
});

test("hidden browser startup and time in a background tab do not consume the intro", async () => {
  const app = await boot({ hidden: true });
  assert.equal(app.timers.size, 0);
  app.changeVisibility(false);
  assert.equal(app.classes.has("show"), true);
  app.setTime(1000);
  app.changeVisibility(true);
  assert.equal(app.timers.size, 0);
  app.setTime(90000);
  app.changeVisibility(false);
  assert.equal([...app.timers.values()][0].delay, 2600);
});

test("a restore event arriving before Chromium visibility updates still starts the desktop intro", async () => {
  const app = await boot({ desktop: true, hidden: true });
  app.show();
  assert.equal(app.timers.size, 0);
  app.changeVisibility(false);
  assert.equal(app.classes.has("show"), true);
  assert.equal([...app.timers.values()][0].delay, 3600);
});

test("reduced-motion users still get an intentional visible logo introduction", async () => {
  const app = await boot({ reduced: true });
  assert.equal(app.classes.has("reduced-motion"), true);
  assert.equal([...app.timers.values()][0].delay, 1800);
  [...app.timers.values()][0].fn();
  assert.equal(app.classes.has("exit"), true);
});
