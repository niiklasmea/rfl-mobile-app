const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("appSettings", {
  getAutostart: () => ipcRenderer.invoke("autostart:get"),
  setAutostart: (enabled) => ipcRenderer.invoke("autostart:set", enabled),
  getMinimizedStart: () => ipcRenderer.invoke("minimize-start:get"),
  setMinimizedStart: (enabled) => ipcRenderer.invoke("minimize-start:set", enabled)
});
