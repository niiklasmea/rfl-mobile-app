const { app, BrowserWindow, shell, ipcMain, dialog } = require("electron");
const { autoUpdater } = require("electron-updater");
const path = require("node:path");
const fs = require("node:fs/promises");
const { pathToFileURL } = require("node:url");

// Keep the Windows app identity stable so an existing auto-start entry is updated in place.
app.setAppUserModelId("de.RFL-LIGA");
// Keep browser storage and saved preferences from the previous RFL F1 League app.
app.setPath("userData", path.join(app.getPath("appData"), "rfl-f1-league"));

// Die App darf nur einmal gleichzeitig laufen
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
}

const siteDirectory = app.isPackaged
  ? path.join(process.resourcesPath, "site")
  : path.join(__dirname, "..");
const siteUrlPrefix = pathToFileURL(siteDirectory).href + "/";

let mainWindow = null;
let updateDialogOpen = false;

function startUpdateChecks() {
  if (!app.isPackaged) return;

  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.on("error", (error) => {
    console.error("RFL-APP update check failed:", error);
  });
  autoUpdater.on("update-downloaded", async (info) => {
    if (updateDialogOpen || app.isQuitting) return;
    updateDialogOpen = true;

    const options = {
      type: "info",
      title: "RFL-APP Update bereit",
      message: `Version ${info?.version ?? "neu"} wurde heruntergeladen.`,
      detail: "Starte RFL-APP jetzt neu, um das Update zu installieren. Du kannst auch später neu starten.",
      buttons: ["Jetzt neu starten", "Später"],
      defaultId: 0,
      cancelId: 1,
      noLink: true
    };

    try {
      const result = mainWindow && !mainWindow.isDestroyed()
        ? await dialog.showMessageBox(mainWindow, options)
        : await dialog.showMessageBox(options);
      if (result.response === 0) autoUpdater.quitAndInstall();
    } finally {
      updateDialogOpen = false;
    }
  });

  const check = () => autoUpdater.checkForUpdates().catch((error) => {
    console.error("RFL-APP update check failed:", error);
  });

  const firstCheck = setTimeout(() => {
    check();
    const repeatCheck = setInterval(check, 6 * 60 * 60 * 1000);
    repeatCheck.unref();
  }, 12_000);
  firstCheck.unref();
}

function createWindow(startMinimized = false) {
  const pagePath = path.join(siteDirectory, "index.html");

  mainWindow = new BrowserWindow({
    title: "RFL-APP",
    width: 1440,
    height: 940,
    minWidth: 900,
    minHeight: 620,
    backgroundColor: "#090b0c",
    autoHideMenuBar: true,
    show: false,
    icon: path.join(__dirname, "assets", "icon.ico"),
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      preload: path.join(__dirname, "preload.cjs")
    }
  });

  mainWindow.once("ready-to-show", () => {
    if (startMinimized) {
      mainWindow.show();
      mainWindow.minimize();
    } else {
      mainWindow.show();
    }
    notifyAppVisible();
  });

  // The renderer must start its intro after the window is visible, including a minimized launch.
  const notifyAppVisible = () => {
    if (mainWindow && !mainWindow.isDestroyed() && mainWindow.isVisible() && !mainWindow.isMinimized()) {
      mainWindow.webContents.send("app:visible");
    }
  };
  mainWindow.on("restore", notifyAppVisible);
  mainWindow.on("focus", notifyAppVisible);
  mainWindow.webContents.on("did-finish-load", notifyAppVisible);

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) {
      shell.openExternal(url);
    }
    return { action: "deny" };
  });

  // Seiten im "site"-Ordner sind erlaubt, alles andere geht in den Browser
  mainWindow.webContents.on("will-navigate", (event, url) => {
    if (url.startsWith(siteUrlPrefix)) return;
    event.preventDefault();
    if (/^https?:\/\//i.test(url)) {
      shell.openExternal(url);
    }
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });

  mainWindow.loadFile(pagePath);
}

// Autostart: Status abfragen und ein-/ausschalten
ipcMain.handle("window:is-visible", (event) => {
  return Boolean(mainWindow && !mainWindow.isDestroyed()
    && event.sender === mainWindow.webContents && mainWindow.isVisible() && !mainWindow.isMinimized());
});

ipcMain.handle("autostart:get", () => {
  return app.getLoginItemSettings({ path: process.execPath, args: [] }).openAtLogin;
});

ipcMain.handle("autostart:set", (_event, enabled) => {
  app.setLoginItemSettings({
    openAtLogin: Boolean(enabled),
    path: process.execPath,
    args: [],
    enabled: true
  });
  return app.getLoginItemSettings({ path: process.execPath, args: [] }).openAtLogin;
});

const preferencesPath = () => path.join(app.getPath("userData"), "preferences.json");

async function readPreferences() {
  try {
    return JSON.parse(await fs.readFile(preferencesPath(), "utf8"));
  } catch {
    return {};
  }
}

ipcMain.handle("minimize-start:get", async () => {
  const preferences = await readPreferences();
  return preferences.minimizeOnStart === true;
});

ipcMain.handle("minimize-start:set", async (_event, enabled) => {
  const preferences = await readPreferences();
  preferences.minimizeOnStart = Boolean(enabled);
  await fs.mkdir(app.getPath("userData"), { recursive: true });
  await fs.writeFile(preferencesPath(), JSON.stringify(preferences, null, 2), "utf8");
  return preferences.minimizeOnStart;
});

// Zweiter Start: vorhandenes Fenster nach vorne holen
app.on("second-instance", () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  }
});

app.whenReady().then(async () => {
  const preferences = await readPreferences();
  createWindow(preferences.minimizeOnStart === true);
  startUpdateChecks();
});

app.on("activate", async () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    const preferences = await readPreferences();
    createWindow(preferences.minimizeOnStart === true);
  }
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
