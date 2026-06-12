import { app, BrowserWindow, dialog, ipcMain, net, protocol, shell, type OpenDialogOptions } from 'electron';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { getAnnouncements, type AnnouncementsStatus } from './announcements';
import { BACKGROUND_PROTOCOL, listBackgroundUrls, resolveBackgroundRequest } from './backgrounds';
import { CRASH_LOG_LINES, LAUNCHER_NAME, MAX_LOG_LINES, MC_VERSION } from './constants';
import { reinstallCore, type ReinstallCoreResult } from './core';
import { checkJava, downloadJavaInstaller, idleJavaInstallerStatus, javaDownloadPageUrl, type JavaInstallerResult } from './java';
import { deleteMicrosoftRefreshToken, getMicrosoftRefreshToken, saveMicrosoftRefreshToken } from './keychain';
import { checkMinecraftInstanceReady, launchGame, type LaunchStatus } from './game';
import { readMinecraftOptions, saveMinecraftOptions } from './minecraftOptions';
import { loginMicrosoft, refreshMicrosoft, type MclcAuthorization } from './microsoftAuth';
import { checkModrinthAddonUpdates, identifyInstalledModrinthProjects, installModrinthProject, readSearchCache, searchModrinth, type ModrinthInstallRequest, type ModrinthSearchRequest } from './modrinth';
import { buildLauncherPaths, ensureLauncherDirs, getLauncherPaths, type LauncherPaths } from './paths';
import { getRamInfo } from './ram';
import { activateServer, activeServer, addServer, readServerRegistry, refreshServerName, removeServer, type ServerMinecraftConfig, type ServerRegistry } from './servers';
import { resolveSetupPaths, type SetupState } from './setup';
import { checkSyncPlan, listManagedLocalFiles, listPlayerAddonFiles, removePlayerAddonFile, runSync, type ManagedFile, type PlayerAddonFile, type PlayerAddonKind, type SyncStatus } from './sync';
import {
  readProfile,
  readSettings,
  saveProfile,
  saveSettings,
  type LauncherProfile,
  type LauncherSettings
} from './storage';
import { offlineUuid } from './validation';
import { checkForLauncherUpdate, downloadLauncherUpdate, idleUpdateStatus, type UpdateStatus } from './updater';

type ServerHealth = {
  ok: boolean;
  serverOnline: boolean;
  playersOnline: number | null;
  playersMax: number | null;
  players: string[];
  message: string;
};

type LauncherState = {
  setup: SetupState;
  settings: LauncherSettings;
  profile: LauncherProfile;
  servers: ServerRegistry;
  health: ServerHealth;
  sync: SyncStatus;
  launch: LaunchStatus;
  logs: string[];
  managedFiles: ManagedFile[];
  playerAddons: PlayerAddonFile[];
  backgrounds: string[];
  announcements: AnnouncementsStatus;
  update: UpdateStatus;
  session: {
    activeStartedAt: string | null;
    tickAt: string;
  };
  system: {
    totalRamMb: number;
    maxRamMb: number;
    defaultRamMb: number;
    java: Awaited<ReturnType<typeof checkJava>>;
    javaInstaller: JavaInstallerResult;
  };
};

type RuntimeSnapshot = {
  paths: LauncherPaths;
  settings: LauncherSettings;
  profile: LauncherProfile;
  servers: ServerRegistry;
  health: ServerHealth;
  managedFiles: ManagedFile[];
  playerAddons: PlayerAddonFile[];
  backgrounds: string[];
  announcements: AnnouncementsStatus;
};

const HEALTH_POLL_MS = 15_000;

let mainWindow: BrowserWindow | null = null;
let paths: LauncherPaths;
let basePaths: LauncherPaths;
let state: LauncherState;
let backgroundProtocolRegistered = false;
let healthPollTimer: NodeJS.Timeout | null = null;
let announcementPollTimer: NodeJS.Timeout | null = null;
let healthPollInFlight = false;
let playSessionStartedAt: number | null = null;
let playSessionTickTimer: NodeJS.Timeout | null = null;
let isQuitting = false;
let closeChoicePending = false;

protocol.registerSchemesAsPrivileged([
  {
    scheme: BACKGROUND_PROTOCOL,
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true
    }
  }
]);

async function createWindow(): Promise<void> {
  const setupResolution = await resolveSetupPaths(getLauncherPaths(), {
    isPackaged: app.isPackaged,
    portableExecutableDir: process.env.PORTABLE_EXECUTABLE_DIR,
    portableExecutableFile: process.env.PORTABLE_EXECUTABLE_FILE
  });
  basePaths = setupResolution.paths;
  const runtime = await reinitializeLauncherRuntime(basePaths, await readServerRegistry(basePaths));
  paths = runtime.paths;
  registerBackgroundProtocol();
  const ram = getRamInfo();
  const java = await checkJava(runtime.settings.javaPath, activeMinecraftVersion(runtime.servers));

  state = {
    setup: {
      ...setupResolution.setup,
      complete: runtime.profile.setupComplete,
      required: app.isPackaged && !runtime.profile.setupComplete
    },
    settings: runtime.settings,
    profile: runtime.profile,
    servers: runtime.servers,
    health: runtime.health,
    sync: idleSync(),
    launch: { running: false, phase: 'idle', message: 'Gotowy.' },
    logs: [],
    managedFiles: runtime.managedFiles,
    playerAddons: runtime.playerAddons,
    backgrounds: runtime.backgrounds,
    announcements: runtime.announcements,
    update: idleUpdateStatus(app.getVersion()),
    session: {
      activeStartedAt: null,
      tickAt: new Date().toISOString()
    },
    system: {
      ...ram,
      java,
      javaInstaller: idleJavaInstallerStatus(java.requiredMajor)
    }
  };

  mainWindow = new BrowserWindow({
    width: 1180,
    height: 760,
    minWidth: 980,
    minHeight: 640,
    title: LAUNCHER_NAME,
    frame: false,
    autoHideMenuBar: true,
    backgroundColor: '#101014',
    webPreferences: {
      preload: path.join(__dirname, '../preload/preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });
  mainWindow.on('close', (event) => {
    if (isQuitting) return;
    event.preventDefault();
    void handleMainWindowClose();
  });
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    void safeOpenExternal(url);
    return { action: 'deny' };
  });
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (isAllowedAppNavigation(url)) return;
    event.preventDefault();
    void safeOpenExternal(url);
  });
  if (process.env.VITE_DEV_SERVER_URL) {
    await mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
  } else {
    await mainWindow.loadFile(path.join(__dirname, '../../dist/index.html'));
  }

  registerIpc();
  startHealthPolling();
  startAnnouncementPolling();
  void refreshUpdateStatus();
  void performStartupSync();
}

function registerIpc(): void {
  ipcMain.handle('launcher:get-state', () => state);

  ipcMain.handle('launcher:save-settings', async (_event, settings: LauncherSettings) => {
    state.settings = await saveSettings(paths, settings);
    state.system.java = await checkJava(state.settings.javaPath, activeMinecraft().version);
    state.system.javaInstaller = idleJavaInstallerStatus(state.system.java.requiredMajor);
    await refreshHealth();
    await refreshAnnouncements();
    return state.settings;
  });

  ipcMain.handle('launcher:add-server', async (_event, backendUrl: string) => {
    const registry = await addServer(basePaths, state.servers, backendUrl);
    const server = activeServer(registry);
    if (!server) return state;
    await switchToServer(registry, server.instanceId);
    return state;
  });

  ipcMain.handle('launcher:remove-server', async (_event, serverId: string) => {
    const registry = await removeServer(basePaths, state.servers, serverId);
    const server = activeServer(registry);

    if (server) {
      await switchToServer(registry, server.instanceId);
      return state;
    }

    const runtime = await reinitializeLauncherRuntime(basePaths, registry);
    applyRuntimeSnapshot(runtime);
    state.system.java = await checkJava(state.settings.javaPath, activeMinecraftVersion(state.servers));
    state.system.javaInstaller = idleJavaInstallerStatus(state.system.java.requiredMajor);
    state.sync = idleSync();
    state.session = {
      activeStartedAt: null,
      tickAt: new Date().toISOString()
    };
    emitState();
    void performStartupSync();
    return state;
  });

  ipcMain.handle('launcher:switch-server', async (_event, serverId: string) => {
    const registry = await activateServer(basePaths, state.servers, serverId);
    const server = activeServer(registry);
    if (!server) return state;
    await switchToServer(registry, server.instanceId);
    return state;
  });

  ipcMain.handle('launcher:save-profile', async (_event, profile: LauncherProfile) => {
    state.profile = await saveProfile(paths, profile);
    state.setup.complete = state.profile.setupComplete;
    state.setup.required = app.isPackaged && !state.profile.setupComplete;
    emitState();
    return state.profile;
  });

  ipcMain.handle('launcher:choose-setup-directory', async () => {
    const options: OpenDialogOptions = {
      title: 'Wybierz folder danych launchera',
      properties: ['openDirectory', 'createDirectory']
    };
    const result = mainWindow ? await dialog.showOpenDialog(mainWindow, options) : await dialog.showOpenDialog(options);

    const selectedDir = result.canceled ? null : result.filePaths[0];
    if (!selectedDir) return state;

    basePaths = buildLauncherPaths(selectedDir, basePaths.appDir);
    const runtime = await reinitializeLauncherRuntime(basePaths, await readServerRegistry(basePaths));
    applyRuntimeSnapshot(runtime);
    state.system.java = await checkJava(state.settings.javaPath, activeMinecraft().version);
    state.system.javaInstaller = idleJavaInstallerStatus(state.system.java.requiredMajor);
    state.setup = {
      ...state.setup,
      reason: 'first-run',
      baseInstallDir: runtime.paths.installDir,
      activeInstallDir: runtime.paths.installDir,
      usingNestedDir: false,
      suggestedDir: null,
      crowdedEntries: [],
      complete: state.profile.setupComplete,
      required: app.isPackaged && !state.profile.setupComplete
    };
    emitState();
    return state;
  });

  ipcMain.handle('launcher:complete-setup', async () => {
    state.profile = await saveProfile(paths, {
      ...state.profile,
      setupComplete: true
    });
    state.setup = {
      ...state.setup,
      complete: true,
      required: false
    };
    emitState();
    return state.profile;
  });

  ipcMain.handle('launcher:login-microsoft', async () => {
    const result = await loginMicrosoft({ onLog: appendLog });

    await saveMicrosoftRefreshToken(result.profile.uuid, result.profile.refreshToken);

    state.profile = await saveProfile(paths, {
      ...state.profile,
      nickname: result.profile.name,
      accountMode: 'microsoft',
      microsoft: {
        name: result.profile.name,
        uuid: result.profile.uuid,
        xuid: result.profile.xuid,
        expiresAt: result.profile.expiresAt
      }
    });

    emitState();
    return state.profile;
  });

  ipcMain.handle('launcher:logout-microsoft', async () => {
    const microsoftUuid = state.profile.microsoft?.uuid ?? null;

    if (microsoftUuid) {
      try {
        await deleteMicrosoftRefreshToken(microsoftUuid);
      } catch (error) {
        appendLog(error instanceof Error ? `Nie udało się usunąć tokena Microsoft: ${error.message}` : 'Nie udało się usunąć tokena Microsoft.');
      }
    }

    state.profile = await saveProfile(paths, {
      ...state.profile,
      accountMode: 'offline',
      microsoft: null
    });

    emitState();
    return state.profile;
  });

  ipcMain.handle('launcher:run-sync', () => performStartupSync());
  ipcMain.handle('launcher:apply-sync', () => applySync());

  ipcMain.handle('launcher:check-update', () => refreshUpdateStatus());

  ipcMain.handle('launcher:refresh-announcements', () => refreshAnnouncements());

  ipcMain.handle('launcher:search-modrinth', async (_event, request: ModrinthSearchRequest) => {
    return searchModrinth(paths, request, app.getVersion(), activeMinecraft());
  });

  ipcMain.handle('launcher:install-modrinth', async (_event, request: ModrinthInstallRequest) => {
    const result = await installModrinthProject(paths, request, app.getVersion(), activeMinecraft());
    appendLog(result.message);
    state.playerAddons = await listPlayerAddonFiles(paths.minecraftDir);
    emitState();
    return result;
  });

  ipcMain.handle('launcher:check-addon-updates', async () => {
    state.playerAddons = await listPlayerAddonFiles(paths.minecraftDir);
    emitState();
    return checkModrinthAddonUpdates(state.playerAddons, app.getVersion(), activeMinecraft());
  });

  ipcMain.handle('launcher:list-installed-modrinth', async () => {
    state.playerAddons = await listPlayerAddonFiles(paths.minecraftDir);
    const addonsForDetection = await listPlayerAddonFiles(paths.minecraftDir, { includeManaged: true });
    emitState();
    return identifyInstalledModrinthProjects(paths, addonsForDetection, app.getVersion(), activeMinecraft());
  });

  ipcMain.handle('launcher:get-modrinth-cache', async () => {
    return readSearchCache(paths);
  });

  ipcMain.handle('launcher:remove-player-addon', async (_event, relativePath: string) => {
    const result = await removePlayerAddonFile(paths.minecraftDir, relativePath);
    appendLog(result.message);
    state.playerAddons = await listPlayerAddonFiles(paths.minecraftDir);
    emitState();
    return result;
  });

  ipcMain.handle('launcher:open-update-download', async () => {
    const target = state.update.releaseUrl ?? state.update.downloadUrl;
    if (target) await safeOpenExternal(target);
  });

  ipcMain.handle('launcher:download-update', async () => {
    if (state.update.download.phase === 'downloading' || state.update.download.phase === 'verifying') {
      return state.update.download;
    }

    const result = await downloadLauncherUpdate(
      state.update,
      paths.launcherDataDir,
      (download) => {
        state.update = { ...state.update, download };
        emitState();
      },
      app.getVersion()
    );

    if (result.phase === 'ready' && result.filePath) {
      shell.showItemInFolder(result.filePath);
      appendLog(`Aktualizacja pobrana: ${result.filePath}`);
    } else if (result.phase === 'error') {
      appendLog(`Błąd pobierania aktualizacji: ${result.message}`);
    }

    return result;
  });

  ipcMain.handle('launcher:show-downloaded-update', async () => {
    const filePath = state.update.download.filePath;
    if (filePath) shell.showItemInFolder(filePath);
  });

  ipcMain.handle('launcher:refresh-java', async () => {
    state.system.java = await checkJava(state.settings.javaPath, activeMinecraft().version);
    state.system.javaInstaller = idleJavaInstallerStatus(state.system.java.requiredMajor);
    emitState();
    return state.system.java;
  });

  ipcMain.handle('launcher:download-java-installer', async () => {
    if (state.system.javaInstaller.phase === 'downloading') return state.system.javaInstaller;

    const result = await downloadJavaInstaller(paths.launcherDataDir, (javaInstaller) => {
      state.system = { ...state.system, javaInstaller };
      emitState();
    }, state.system.java.requiredMajor);
    appendLog(result.message);
    return result;
  });

  ipcMain.handle('launcher:open-java-installer', async () => {
    const installerPath = state.system.javaInstaller.path;
    if (installerPath) {
      await shell.openPath(installerPath);
      return;
    }

    await safeOpenExternal(javaDownloadPageUrl(state.system.java.requiredMajor));
  });

  ipcMain.handle('launcher:open-java-download-page', async () => {
    await safeOpenExternal(javaDownloadPageUrl(state.system.java.requiredMajor));
  });

  ipcMain.handle('launcher:reinstall-core', async (): Promise<ReinstallCoreResult> => {
    if (state.launch.running) {
      return {
        removed: [],
        message: 'Nie można czyścić core podczas działania gry.'
      };
    }

    const result = await reinstallCore(paths);
    appendLog(result.message);
    emitState();
    return result;
  });

  ipcMain.handle('launcher:launch-game', async (_event, request: { nickname: string; forceDownload?: boolean }) => launchWithNickname(request.nickname, request.forceDownload));

  ipcMain.handle('launcher:list-managed-files', async () => {
    state.managedFiles = await listManagedLocalFiles(paths.minecraftDir);
    emitState();
    return state.managedFiles;
  });

  ipcMain.handle('launcher:list-player-addons', async () => {
    state.playerAddons = await listPlayerAddonFiles(paths.minecraftDir);
    emitState();
    return state.playerAddons;
  });

  ipcMain.handle('launcher:read-minecraft-options', async () => {
    return readMinecraftOptions(paths);
  });

  ipcMain.handle('launcher:save-minecraft-options', async (_event, values: Record<string, string>) => {
    return saveMinecraftOptions(paths, values);
  });

  ipcMain.handle('launcher:open-minecraft-folder', async () => {
    await shell.openPath(paths.minecraftDir);
  });

  ipcMain.handle('launcher:open-addon-folder', async (_event, kind: PlayerAddonKind) => {
    const folder =
      kind === 'shader'
        ? path.join(paths.minecraftDir, 'shaderpacks')
        : kind === 'resourcepack'
          ? path.join(paths.minecraftDir, 'resourcepacks')
          : path.join(paths.minecraftDir, 'mods');
    await shell.openPath(folder);
  });

  ipcMain.handle('launcher:choose-java-path', async () => {
    const result = await dialog.showOpenDialog(mainWindow!, {
      title: 'Wybierz java.exe',
      properties: ['openFile'],
      filters: process.platform === 'win32' ? [{ name: 'Java', extensions: ['exe'] }] : undefined
    });

    return result.canceled ? null : result.filePaths[0];
  });

  ipcMain.handle('launcher:window-action', (_event, action: 'minimize' | 'maximize' | 'close') => {
    if (!mainWindow) return;

    if (action === 'minimize') {
      mainWindow.minimize();
      return;
    }

    if (action === 'maximize') {
      if (mainWindow.isMaximized()) {
        mainWindow.unmaximize();
      } else {
        mainWindow.maximize();
      }
      return;
    }

    mainWindow.close();
  });
}

async function performStartupSync(): Promise<SyncStatus> {
  if (!state.settings.backendUrl) {
    state.sync = {
      phase: 'idle',
      verified: false,
      message: 'Dodaj serwer, żeby synchronizować pliki.',
      completedFiles: 0,
      totalFiles: 0
    };
    emitState();
    return state.sync;
  }

  state.sync = await checkSyncPlan(paths, state.settings.backendUrl, (sync) => {
    state.sync = sync;
    emitState();
  });
  state.managedFiles = await listManagedLocalFiles(paths.minecraftDir);
  state.playerAddons = await listPlayerAddonFiles(paths.minecraftDir);
  state.backgrounds = await listBackgroundUrls(paths);
  await refreshAnnouncements();
  emitState();
  return state.sync;
}

async function applySync(): Promise<SyncStatus> {
  if (!state.settings.backendUrl) return performStartupSync();

  state.sync = await runSync(paths, state.settings.backendUrl, (sync) => {
    state.sync = sync;
    emitState();
  });
  state.managedFiles = await listManagedLocalFiles(paths.minecraftDir);
  state.playerAddons = await listPlayerAddonFiles(paths.minecraftDir);
  state.backgrounds = await listBackgroundUrls(paths);
  await refreshAnnouncements();
  emitState();
  return state.sync;
}

function startHealthPolling(): void {
  stopHealthPolling();
  healthPollTimer = setInterval(() => {
    void refreshHealth();
  }, HEALTH_POLL_MS);
}

function stopHealthPolling(): void {
  if (!healthPollTimer) return;
  clearInterval(healthPollTimer);
  healthPollTimer = null;
}

function startAnnouncementPolling(): void {
  stopAnnouncementPolling();
  announcementPollTimer = setInterval(() => {
    void refreshAnnouncements();
  }, 3 * 60 * 1000);
}

function stopAnnouncementPolling(): void {
  if (!announcementPollTimer) return;
  clearInterval(announcementPollTimer);
  announcementPollTimer = null;
}

async function refreshHealth(): Promise<void> {
  if (healthPollInFlight) return;
  healthPollInFlight = true;

  try {
    state.health = await getHealth(state.settings.backendUrl);

    // Refresh server name from server.json if it changed on the admin-site
    const activeServerId = state.servers.activeServerId;
    if (activeServerId) {
      const updated = await refreshServerName(basePaths, state.servers, activeServerId);
      if (updated) state.servers = updated;
    }

    emitState();
  } finally {
    healthPollInFlight = false;
  }
}

async function refreshAnnouncements(): Promise<AnnouncementsStatus> {
  if (!state.settings.backendUrl) {
    state.announcements = { items: [], cached: false, error: null };
    emitState();
    return state.announcements;
  }

  state.announcements = await getAnnouncements(paths, state.settings.backendUrl);
  emitState();
  return state.announcements;
}

async function refreshUpdateStatus(): Promise<UpdateStatus> {
  state.update = {
    ...state.update,
    checking: true,
    error: null
  };
  emitState();

  state.update = await checkForLauncherUpdate(app.getVersion());
  emitState();
  return state.update;
}

async function switchToServer(registry: ServerRegistry, instanceId: string): Promise<void> {
  if (state.launch.running) throw new Error('Zamknij Minecraft przed zmianą serwera.');

  const runtime = await reinitializeLauncherRuntime(basePaths, registry, instanceId);
  applyRuntimeSnapshot(runtime);
  state.system.java = await checkJava(state.settings.javaPath, activeMinecraft().version);
  state.system.javaInstaller = idleJavaInstallerStatus(state.system.java.requiredMajor);
  state.setup = {
    ...state.setup,
    activeInstallDir: runtime.paths.activeInstanceDir,
    suggestedDir: null
  };
  state.sync = idleSync();
  state.session = {
    activeStartedAt: null,
    tickAt: new Date().toISOString()
  };
  emitState();
  void performStartupSync();
}

async function reinitializeLauncherRuntime(
  nextBasePaths: LauncherPaths,
  registry: ServerRegistry,
  instanceId?: string
): Promise<RuntimeSnapshot> {
  const selectedServer = instanceId
    ? registry.servers.find((server) => server.instanceId === instanceId) ?? null
    : activeServer(registry);
  const nextPaths = selectedServer
    ? buildLauncherPaths(nextBasePaths.installDir, nextBasePaths.appDir, selectedServer.instanceId)
    : nextBasePaths;

  await ensureLauncherDirs(nextPaths);

  const settings = {
    ...(await readSettings(nextPaths)),
    backendUrl: selectedServer?.backendUrl ?? ''
  };
  const persistedSettings = selectedServer ? await saveSettings(nextPaths, settings) : settings;

  return {
    paths: nextPaths,
    settings: persistedSettings,
    profile: await readProfile(nextPaths),
    servers: registry,
    health: await getHealth(persistedSettings.backendUrl),
    managedFiles: await listManagedLocalFiles(nextPaths.minecraftDir),
    playerAddons: await listPlayerAddonFiles(nextPaths.minecraftDir),
    backgrounds: await listBackgroundUrls(nextPaths),
    announcements: await getAnnouncements(nextPaths, persistedSettings.backendUrl)
  };
}

function applyRuntimeSnapshot(runtime: RuntimeSnapshot): void {
  paths = runtime.paths;
  state.settings = runtime.settings;
  state.profile = runtime.profile;
  state.servers = runtime.servers;
  state.health = runtime.health;
  state.managedFiles = runtime.managedFiles;
  state.playerAddons = runtime.playerAddons;
  state.backgrounds = runtime.backgrounds;
  state.announcements = runtime.announcements;
}

function appendLog(line: string): void {
  const text = String(line).trimEnd();
  if (!text) return;

  state.logs = [...state.logs, text].slice(-MAX_LOG_LINES);
  mainWindow?.webContents.send('launcher:log', text);
  emitState();
}

async function resolveAuthorization(nickname: string): Promise<MclcAuthorization> {
  if (state.profile.accountMode === 'microsoft') {
    const microsoft = state.profile.microsoft;

    if (!microsoft?.uuid) {
      throw new Error('Zaloguj konto Microsoft ponownie.');
    }

    let refreshToken: string | null;

    try {
      refreshToken = await getMicrosoftRefreshToken(microsoft.uuid);
    } catch (error) {
      appendLog(error instanceof Error ? `Nie można odczytać tokena Microsoft: ${error.message}` : 'Nie można odczytać tokena Microsoft.');
      throw new Error('Nie można odczytać tokena Microsoft z systemowego magazynu. Zaloguj konto ponownie.');
    }

    if (!refreshToken) {
      throw new Error('Zaloguj konto Microsoft ponownie.');
    }

    const result = await refreshMicrosoft(refreshToken, { onLog: appendLog });

    await saveMicrosoftRefreshToken(result.profile.uuid, result.profile.refreshToken);

    state.profile = await saveProfile(paths, {
      ...state.profile,
      nickname: result.profile.name,
      microsoft: {
        name: result.profile.name,
        uuid: result.profile.uuid,
        xuid: result.profile.xuid,
        expiresAt: result.profile.expiresAt
      },
      accountMode: 'microsoft'
    });

    emitState();
    return result.authorization;
  }

  const uuid = offlineUuid(nickname);
  return {
    access_token: '0',
    client_token: uuid,
    uuid,
    name: nickname,
    user_properties: '{}',
    meta: {
      type: 'msa'
    }
  };
}

async function launchWithNickname(nickname: string, forceDownload = false): Promise<LaunchStatus> {
  if (state.launch.running) return state.launch;

  if (!forceDownload) {
    const instanceCheck = await checkMinecraftInstanceReady(paths, activeMinecraft());
    if (!instanceCheck.ready) {
      state.launch = {
        running: false,
        phase: 'error',
        message: instanceCheck.message
      };
      mainWindow?.webContents.send('launcher:instance-required', instanceCheck);
      emitState();
      return state.launch;
    }
  }

  let authorization: MclcAuthorization;
  try {
    authorization = await resolveAuthorization(nickname);
  } catch (error) {
    state.launch = {
      running: false,
      phase: 'error',
      message: error instanceof Error ? error.message : 'Nie udało się przygotować konta Microsoft.'
    };
    emitState();
    return state.launch;
  }
  const launchNickname = authorization.name ?? nickname;

  state.profile = await saveProfile(paths, {
    ...state.profile,
    nickname: launchNickname,
    setupComplete: state.profile.setupComplete
  });
  state.system.java = await checkJava(state.settings.javaPath, activeMinecraft().version);
  state.system.javaInstaller = idleJavaInstallerStatus(state.system.java.requiredMajor);

  if (!state.system.java.ok) {
    state.launch = { running: false, phase: 'error', message: state.system.java.message };
    emitState();
    return state.launch;
  }

  try {
    state.launch = await launchGame(
      paths,
      state.settings,
      launchNickname,
      authorization,
      {
        onStatus: (launch) => {
          state.launch = launch;
          if (launch.running) {
            beginPlaySession();
          }
          if (launch.phase === 'closed') {
            void completePlaySession();
          }
          emitState();
        },
        onLog: appendLog,
        onCrash: (exitCode) => {
          mainWindow?.webContents.send('launcher:crash', {
            exitCode,
            lines: state.logs.slice(-CRASH_LOG_LINES)
          });
        }
      },
      activeServer(state.servers)?.minecraft
    );
  } catch (error) {
    state.launch = {
      running: false,
      phase: 'error',
      message: error instanceof Error ? error.message : 'Błąd launchera: ' + String(error)
    };
    emitState();
    return state.launch;
  }

  if (state.settings.closeOnLaunch) {
    mainWindow?.minimize();
  }

  emitState();
  return state.launch;
}

function beginPlaySession(): void {
  if (playSessionStartedAt) return;

  playSessionStartedAt = Date.now();
  state.session = {
    activeStartedAt: new Date(playSessionStartedAt).toISOString(),
    tickAt: new Date().toISOString()
  };
  state.profile = {
    ...state.profile,
    launchCount: state.profile.launchCount + 1
  };
  startPlaySessionTicking();
  emitState();
}

async function completePlaySession(): Promise<void> {
  if (!playSessionStartedAt) return;

  const seconds = Math.max(1, Math.round((Date.now() - playSessionStartedAt) / 1000));
  playSessionStartedAt = null;
  stopPlaySessionTicking();

  state.profile = await saveProfile(paths, {
    ...state.profile,
    lastPlayedAt: new Date().toISOString(),
    lastSessionSeconds: seconds,
    totalPlaySeconds: state.profile.totalPlaySeconds + seconds
  });
  state.session = {
    activeStartedAt: null,
    tickAt: new Date().toISOString()
  };
  emitState();
}

function startPlaySessionTicking(): void {
  stopPlaySessionTicking();
  playSessionTickTimer = setInterval(() => {
    if (!state.session.activeStartedAt) return;
    state.session = {
      ...state.session,
      tickAt: new Date().toISOString()
    };
    emitState();
  }, 60_000);
}

function stopPlaySessionTicking(): void {
  if (!playSessionTickTimer) return;
  clearInterval(playSessionTickTimer);
  playSessionTickTimer = null;
}

async function getHealth(backendUrl: string): Promise<ServerHealth> {
  if (!backendUrl) {
    return {
      ok: false,
      serverOnline: false,
      playersOnline: null,
      playersMax: null,
      players: [],
      message: 'Dodaj serwer, żeby sprawdzić status.'
    };
  }

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);
    const response = await fetch(`${backendUrl}/health`, { signal: controller.signal });
    clearTimeout(timer);

    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return (await response.json()) as ServerHealth;
  } catch {
    return {
      ok: false,
      serverOnline: false,
      playersOnline: null,
      playersMax: null,
      players: [],
      message: 'Backend albo serwer MC nie odpowiada.'
    };
  }
}

function idleSync(): SyncStatus {
  return {
    phase: 'idle',
    verified: false,
    message: 'Oczekiwanie na synchronizację.',
    completedFiles: 0,
    totalFiles: 0
  };
}

function activeMinecraft(): ServerMinecraftConfig {
  return activeServer(state.servers)?.minecraft ?? {
    address: null,
    version: MC_VERSION,
    loader: 'neoforge',
    loaderVersion: null
  };
}

function activeMinecraftVersion(registry: ServerRegistry): string {
  return activeServer(registry)?.minecraft.version ?? MC_VERSION;
}

function emitState(): void {
  mainWindow?.webContents.send('launcher:state', state);
}

async function handleMainWindowClose(): Promise<void> {
  if (!mainWindow || closeChoicePending) return;

  if (state.settings.windowCloseBehavior === 'tray') {
    mainWindow.minimize();
    return;
  }

  if (state.settings.windowCloseBehavior === 'exit') {
    isQuitting = true;
    app.quit();
    return;
  }

  closeChoicePending = true;
  try {
    const result = await dialog.showMessageBox(mainWindow, {
      type: 'question',
      buttons: ['Minimalizuj launcher', 'Zamknij launcher', 'Anuluj'],
      defaultId: 0,
      cancelId: 2,
      noLink: true,
      title: 'Zamykanie launchera',
      message: 'Co zrobić po kliknięciu zamknięcia?',
      detail: 'Launcher może się zminimalizować albo zamknąć całkowicie. Ten wybór możesz później zmienić w ustawieniach launchera.'
    });

    if (result.response === 0) {
      state.settings = await saveSettings(paths, { ...state.settings, windowCloseBehavior: 'tray' });
      emitState();
      mainWindow.minimize();
      return;
    }

    if (result.response === 1) {
      state.settings = await saveSettings(paths, { ...state.settings, windowCloseBehavior: 'exit' });
      emitState();
      isQuitting = true;
      app.quit();
    }
  } finally {
    closeChoicePending = false;
  }
}

function showMainWindow(): void {
  if (!mainWindow) return;
  mainWindow.show();
  mainWindow.focus();
}

async function safeOpenExternal(url: string): Promise<void> {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
      appendLog(`Zablokowano zewnętrzny link z niedozwolonym schematem: ${parsed.protocol}`);
      return;
    }

    await shell.openExternal(parsed.toString());
  } catch {
    appendLog('Zablokowano niepoprawny zewnętrzny link.');
  }
}

function isAllowedAppNavigation(url: string): boolean {
  if (process.env.VITE_DEV_SERVER_URL && url.startsWith(process.env.VITE_DEV_SERVER_URL)) return true;
  return false;
}

function registerBackgroundProtocol(): void {
  if (backgroundProtocolRegistered) return;
  backgroundProtocolRegistered = true;

  protocol.handle(BACKGROUND_PROTOCOL, (request) => {
    const filePath = resolveBackgroundRequest(paths, request.url);
    if (!filePath) return net.fetch('data:text/plain,Not%20found');

    return net.fetch(pathToFileURL(filePath).toString());
  });
}

app.whenReady().then(createWindow);

app.on('before-quit', () => {
  isQuitting = true;
});

app.on('window-all-closed', () => {
  stopHealthPolling();
  stopPlaySessionTicking();
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (mainWindow) {
    showMainWindow();
    return;
  }
  if (BrowserWindow.getAllWindows().length === 0) void createWindow();
});
