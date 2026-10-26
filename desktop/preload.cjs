const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("appSettings", {
  isWindowVisible: () => ipcRenderer.invoke("window:is-visible"),
  onAppVisible: (callback) => {
    if (typeof callback !== "function") return () => {};
    const listener = () => callback();
    ipcRenderer.on("app:visible", listener);
    return () => ipcRenderer.removeListener("app:visible", listener);
  },
  getAutostart: () => ipcRenderer.invoke("autostart:get"),
  setAutostart: (enabled) => ipcRenderer.invoke("autostart:set", enabled),
  getMinimizedStart: () => ipcRenderer.invoke("minimize-start:get"),
  setMinimizedStart: (enabled) => ipcRenderer.invoke("minimize-start:set", enabled)
});
