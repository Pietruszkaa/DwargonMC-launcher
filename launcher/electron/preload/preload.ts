import { contextBridge, ipcRenderer } from 'electron';

const api = {
  getState: () => ipcRenderer.invoke('launcher:get-state'),
  addServer: (backendUrl: unknown) => ipcRenderer.invoke('launcher:add-server', backendUrl),
  switchServer: (serverId: unknown) => ipcRenderer.invoke('launcher:switch-server', serverId),
  saveSettings: (settings: unknown) => ipcRenderer.invoke('launcher:save-settings', settings),
  saveProfile: (profile: unknown) => ipcRenderer.invoke('launcher:save-profile', profile),
  chooseSetupDirectory: () => ipcRenderer.invoke('launcher:choose-setup-directory'),
  completeSetup: () => ipcRenderer.invoke('launcher:complete-setup'),
  loginMicrosoft: () => ipcRenderer.invoke('launcher:login-microsoft'),
  logoutMicrosoft: () => ipcRenderer.invoke('launcher:logout-microsoft'),
  runSync: () => ipcRenderer.invoke('launcher:run-sync'),
  applySync: () => ipcRenderer.invoke('launcher:apply-sync'),
  refreshAnnouncements: () => ipcRenderer.invoke('launcher:refresh-announcements'),
  getModrinthCache: () => ipcRenderer.invoke('launcher:get-modrinth-cache'),
  searchModrinth: (request: unknown) => ipcRenderer.invoke('launcher:search-modrinth', request),
  installModrinth: (request: unknown) => ipcRenderer.invoke('launcher:install-modrinth', request),
  listInstalledModrinth: () => ipcRenderer.invoke('launcher:list-installed-modrinth'),
  removePlayerAddon: (relativePath: unknown) => ipcRenderer.invoke('launcher:remove-player-addon', relativePath),
  checkAddonUpdates: () => ipcRenderer.invoke('launcher:check-addon-updates'),
  checkUpdate: () => ipcRenderer.invoke('launcher:check-update'),
  openUpdateDownload: () => ipcRenderer.invoke('launcher:open-update-download'),
  downloadUpdate: () => ipcRenderer.invoke('launcher:download-update'),
  showDownloadedUpdate: () => ipcRenderer.invoke('launcher:show-downloaded-update'),
  refreshJava: () => ipcRenderer.invoke('launcher:refresh-java'),
  downloadJavaInstaller: () => ipcRenderer.invoke('launcher:download-java-installer'),
  openJavaInstaller: () => ipcRenderer.invoke('launcher:open-java-installer'),
  openJavaDownloadPage: () => ipcRenderer.invoke('launcher:open-java-download-page'),
  reinstallCore: () => ipcRenderer.invoke('launcher:reinstall-core'),
  launchGame: (request: unknown) => ipcRenderer.invoke('launcher:launch-game', request),
  listManagedFiles: () => ipcRenderer.invoke('launcher:list-managed-files'),
  listPlayerAddons: () => ipcRenderer.invoke('launcher:list-player-addons'),
  readMinecraftOptions: () => ipcRenderer.invoke('launcher:read-minecraft-options'),
  saveMinecraftOptions: (values: unknown) => ipcRenderer.invoke('launcher:save-minecraft-options', values),
  openMinecraftFolder: () => ipcRenderer.invoke('launcher:open-minecraft-folder'),
  openAddonFolder: (kind: unknown) => ipcRenderer.invoke('launcher:open-addon-folder', kind),
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
  },
  onInstanceRequired: (callback: (check: unknown) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, check: unknown) => callback(check);
    ipcRenderer.on('launcher:instance-required', listener);
    return () => ipcRenderer.off('launcher:instance-required', listener);
  }
};

contextBridge.exposeInMainWorld('launcher', api);
