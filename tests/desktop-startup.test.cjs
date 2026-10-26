const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { EventEmitter } = require("node:events");
const source = fs.readFileSync(path.join(__dirname, "../desktop/main.cjs"), "utf8");

async function launch(minimized) {
  let window;
  let ready;
  const handlers = new Map();
  class Window extends EventEmitter {
    constructor() {
      super(); window = this; this.visible = false; this.minimized = false; this.messages = [];
      this.webContents = new EventEmitter();
      this.webContents.send = (type) => this.messages.push(type);
      this.webContents.setWindowOpenHandler = () => {};
    }
    show() { this.visible = true; }
    minimize() { this.minimized = true; }
    restore() { this.minimized = false; this.emit("restore"); }
    isVisible() { return this.visible; }
    isMinimized() { return this.minimized; }
    isDestroyed() { return false; }
    loadFile() {}
  }
  const app = new EventEmitter();
  Object.assign(app, { isPackaged: false, setAppUserModelId() {}, setPath() {}, getPath: () => "C:/qa", requestSingleInstanceLock: () => true, whenReady: () => ({ then(fn) { ready = fn(); } }) });
  const electron = { app, BrowserWindow: Window, shell: { openExternal() {} }, ipcMain: { handle: (name, fn) => handlers.set(name, fn) }, dialog: {} };
  const nodeFs = { readFile: async () => JSON.stringify({ minimizeOnStart: minimized }) };
  vm.runInNewContext(source, {
    require: id => id === "electron" ? electron : id === "electron-updater" ? { autoUpdater: {} } : id === "node:fs/promises" ? nodeFs : require(id),
    __dirname: path.join(__dirname, "../desktop"), process: { platform: "win32", execPath: "C:/qa/app.exe" }, console
  });
  await ready;
  return { window, handlers };
}

test("normal Windows launch signals the intro only when its window is shown", async () => {
  const { window, handlers } = await launch(false);
  assert.equal(handlers.get("window:is-visible")({ sender: window.webContents }), false);
  window.emit("ready-to-show");
  assert.deepEqual(window.messages, ["app:visible"]);
  assert.equal(handlers.get("window:is-visible")({ sender: window.webContents }), true);
  assert.equal(handlers.get("window:is-visible")({ sender: {} }), false);
});

test("minimized Windows launch waits for restoration before playing the intro", async () => {
  const { window } = await launch(true);
  window.emit("ready-to-show");
  assert.equal(window.messages.length, 0);
  window.restore();
  assert.deepEqual(window.messages, ["app:visible"]);
});
