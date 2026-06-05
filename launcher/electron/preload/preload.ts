import { contextBridge, ipcRenderer } from 'electron';

const api = {
  getState: () => ipcRenderer.invoke('launcher:get-state'),
  saveSettings: (settings: unknown) => ipcRenderer.invoke('launcher:save-settings', settings),
  saveProfile: (profile: unknown) => ipcRenderer.invoke('launcher:save-profile', profile),
  completeSetup: () => ipcRenderer.invoke('launcher:complete-setup'),
  runSync: () => ipcRenderer.invoke('launcher:run-sync'),
  reinstallCore: () => ipcRenderer.invoke('launcher:reinstall-core'),
  launchGame: (request: unknown) => ipcRenderer.invoke('launcher:launch-game', request),
  listManagedFiles: () => ipcRenderer.invoke('launcher:list-managed-files'),
  openMinecraftFolder: () => ipcRenderer.invoke('launcher:open-minecraft-folder'),
  chooseJavaPath: () => ipcRenderer.invoke('launcher:choose-java-path'),
  windowAction: (action: unknown) => ipcRenderer.invoke('launcher:window-action', action),
  onState: (callback: (state: unknown) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, state: unknown) => callback(state);
    ipcRenderer.on('launcher:state', listener);
    return () => ipcRenderer.off('launcher:state', listener);
  },
  onLog: (callback: (line: string) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, line: string) => callback(line);
    ipcRenderer.on('launcher:log', listener);
    return () => ipcRenderer.off('launcher:log', listener);
  },
  onCrash: (callback: (crash: unknown) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, crash: unknown) => callback(crash);
    ipcRenderer.on('launcher:crash', listener);
    return () => ipcRenderer.off('launcher:crash', listener);
  }
};

contextBridge.exposeInMainWorld('launcher', api);
