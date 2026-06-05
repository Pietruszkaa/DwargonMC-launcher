import { app, BrowserWindow, Menu, Tray, dialog, ipcMain, net, protocol, shell } from 'electron';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { getAnnouncements, type AnnouncementsStatus } from './announcements';
import { BACKGROUND_PROTOCOL, listBackgroundUrls, resolveBackgroundRequest } from './backgrounds';
import { CRASH_LOG_LINES, MAX_LOG_LINES } from './constants';
import { reinstallCore, type ReinstallCoreResult } from './core';
import { checkJava, javaDownloadUrl } from './java';
import { launchGame, type LaunchStatus } from './game';
import { loginMicrosoft, refreshMicrosoft, type MclcAuthorization } from './microsoftAuth';
import { checkModrinthAddonUpdates, installModrinthProject, listInstalledModrinthProjects, searchModrinth, type ModrinthInstallRequest, type ModrinthSearchRequest } from './modrinth';
import { ensureLauncherDirs, getLauncherPaths, type LauncherPaths } from './paths';
import { getRamInfo } from './ram';
import { resolveSetupPaths, type SetupState } from './setup';
import { listManagedLocalFiles, listPlayerAddonFiles, runSync, type ManagedFile, type PlayerAddonFile, type PlayerAddonKind, type SyncStatus } from './sync';
import {
  readProfile,
  readSettings,
  saveProfile,
  saveSettings,
  type LauncherProfile,
  type LauncherSettings
} from './storage';
import { offlineUuid } from './validation';
import { checkForLauncherUpdate, idleUpdateStatus, type UpdateStatus } from './updater';

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
  };
};

const HEALTH_POLL_MS = 15_000;

let mainWindow: BrowserWindow | null = null;
let paths: LauncherPaths;
let state: LauncherState;
let backgroundProtocolRegistered = false;
let healthPollTimer: NodeJS.Timeout | null = null;
let healthPollInFlight = false;
let playSessionStartedAt: number | null = null;
let playSessionTickTimer: NodeJS.Timeout | null = null;
let tray: Tray | null = null;
let isQuitting = false;
let restoreAfterGameClose = false;

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
  paths = setupResolution.paths;
  await ensureLauncherDirs(paths);
  registerBackgroundProtocol();

  const settings = await readSettings(paths);
  const profile = await readProfile(paths);
  const ram = getRamInfo();

  state = {
    setup: {
      ...setupResolution.setup,
      complete: profile.setupComplete,
      required: app.isPackaged && !profile.setupComplete
    },
    settings,
    profile,
    health: await getHealth(settings.backendUrl),
    sync: idleSync(),
    launch: { running: false, phase: 'idle', message: 'Gotowy.' },
    logs: [],
    managedFiles: await listManagedLocalFiles(paths.minecraftDir),
    playerAddons: await listPlayerAddonFiles(paths.minecraftDir),
    backgrounds: await listBackgroundUrls(paths),
    announcements: await getAnnouncements(paths, settings.backendUrl),
    update: idleUpdateStatus(app.getVersion()),
    session: {
      activeStartedAt: null,
      tickAt: new Date().toISOString()
    },
    system: {
      ...ram,
      java: await checkJava(settings.javaPath)
    }
  };

  mainWindow = new BrowserWindow({
    width: 1180,
    height: 760,
    minWidth: 980,
    minHeight: 640,
    title: 'DwargonMC Launcher',
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
    hideToTray(false);
  });
  createTray();

  if (process.env.VITE_DEV_SERVER_URL) {
    await mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
  } else {
    await mainWindow.loadFile(path.join(__dirname, '../../dist/index.html'));
  }

  registerIpc();
  startHealthPolling();
  void refreshUpdateStatus();
  void performStartupSync();
}

function registerIpc(): void {
  ipcMain.handle('launcher:get-state', () => state);

  ipcMain.handle('launcher:save-settings', async (_event, settings: LauncherSettings) => {
    state.settings = await saveSettings(paths, settings);
    state.system.java = await checkJava(state.settings.javaPath);
    await refreshHealth();
    await refreshAnnouncements();
    return state.settings;
  });

  ipcMain.handle('launcher:save-profile', async (_event, profile: LauncherProfile) => {
    state.profile = await saveProfile(paths, profile);
    state.setup.complete = state.profile.setupComplete;
    state.setup.required = app.isPackaged && !state.profile.setupComplete;
    emitState();
    return state.profile;
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
    state.profile = await saveProfile(paths, {
      ...state.profile,
      nickname: result.profile.name,
      accountMode: 'microsoft',
      microsoft: result.profile
    });
    emitState();
    return state.profile;
  });

  ipcMain.handle('launcher:logout-microsoft', async () => {
    state.profile = await saveProfile(paths, {
      ...state.profile,
      accountMode: 'offline',
      microsoft: null
    });
    emitState();
    return state.profile;
  });

  ipcMain.handle('launcher:run-sync', () => performStartupSync());

  ipcMain.handle('launcher:check-update', () => refreshUpdateStatus());

  ipcMain.handle('launcher:refresh-announcements', () => refreshAnnouncements());

  ipcMain.handle('launcher:search-modrinth', async (_event, request: ModrinthSearchRequest) => {
    return searchModrinth(request, app.getVersion());
  });

  ipcMain.handle('launcher:install-modrinth', async (_event, request: ModrinthInstallRequest) => {
    const result = await installModrinthProject(paths, request, app.getVersion());
    appendLog(result.message);
    state.playerAddons = await listPlayerAddonFiles(paths.minecraftDir);
    emitState();
    return result;
  });

  ipcMain.handle('launcher:check-addon-updates', async () => {
    state.playerAddons = await listPlayerAddonFiles(paths.minecraftDir);
    emitState();
    return checkModrinthAddonUpdates(state.playerAddons, app.getVersion());
  });

  ipcMain.handle('launcher:list-installed-modrinth', async () => {
    state.playerAddons = await listPlayerAddonFiles(paths.minecraftDir);
    const addonsForDetection = await listPlayerAddonFiles(paths.minecraftDir, { includeManaged: true });
    emitState();
    return listInstalledModrinthProjects(addonsForDetection);
  });

  ipcMain.handle('launcher:open-update-download', async () => {
    const target = state.update.downloadUrl ?? state.update.releaseUrl;
    if (target) await shell.openExternal(target);
  });

  ipcMain.handle('launcher:refresh-java', async () => {
    state.system.java = await checkJava(state.settings.javaPath);
    emitState();
    return state.system.java;
  });

  ipcMain.handle('launcher:open-java-download', async () => {
    await shell.openExternal(javaDownloadUrl());
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

  ipcMain.handle('launcher:launch-game', async (_event, request: { nickname: string }) => launchWithNickname(request.nickname));

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
      hideToTray(false);
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
  state.sync = await runSync(paths, state.settings.backendUrl, (sync) => {
    state.sync = sync;
    emitState();
  });
  state.managedFiles = await listManagedLocalFiles(paths.minecraftDir);
  state.playerAddons = await listPlayerAddonFiles(paths.minecraftDir);
  state.backgrounds = await listBackgroundUrls(paths);
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

async function refreshHealth(): Promise<void> {
  if (healthPollInFlight) return;
  healthPollInFlight = true;

  try {
    state.health = await getHealth(state.settings.backendUrl);
    emitState();
  } finally {
    healthPollInFlight = false;
  }
}

async function refreshAnnouncements(): Promise<AnnouncementsStatus> {
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

function appendLog(line: string): void {
  const text = String(line).trimEnd();
  if (!text) return;

  state.logs = [...state.logs, text].slice(-MAX_LOG_LINES);
  mainWindow?.webContents.send('launcher:log', text);
  emitState();
}

async function resolveAuthorization(nickname: string): Promise<MclcAuthorization> {
  if (state.profile.accountMode === 'microsoft') {
    if (!state.profile.microsoft?.refreshToken) {
      throw new Error('Zaloguj konto Microsoft ponownie.');
    }

    const result = await refreshMicrosoft(state.profile.microsoft.refreshToken, { onLog: appendLog });
    state.profile = await saveProfile(paths, {
      ...state.profile,
      nickname: result.profile.name,
      microsoft: result.profile,
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

async function launchWithNickname(nickname: string): Promise<LaunchStatus> {
  if (state.launch.running) return state.launch;

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
  state.system.java = await checkJava(state.settings.javaPath);

  if (!state.system.java.ok) {
    state.launch = { running: false, phase: 'error', message: state.system.java.message };
    emitState();
    return state.launch;
  }

  state.launch = await launchGame(paths, state.settings, launchNickname, authorization, {
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
  });

  if (state.settings.closeOnLaunch) {
    hideToTray(true);
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

  if (restoreAfterGameClose) {
    restoreAfterGameClose = false;
    showMainWindow();
  }
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

function emitState(): void {
  mainWindow?.webContents.send('launcher:state', state);
}

function createTray(): void {
  if (tray) return;

  tray = new Tray(path.join(paths.bundledAssetsDir, 'icon.png'));
  tray.setToolTip('DwargonMC Launcher');
  tray.setContextMenu(
    Menu.buildFromTemplate([
      {
        label: 'Pokaż launcher',
        click: showMainWindow
      },
      {
        label: 'Start gry',
        click: () => {
          void launchFromTray();
        }
      },
      {
        label: 'Otwórz folder gry',
        click: () => {
          void shell.openPath(paths.minecraftDir);
        }
      },
      { type: 'separator' },
      {
        label: 'Wyjdź',
        click: () => {
          isQuitting = true;
          app.quit();
        }
      }
    ])
  );
  tray.on('click', showMainWindow);
}

async function launchFromTray(): Promise<void> {
  if (state.launch.running) {
    showMainWindow();
    return;
  }

  const nickname = state.profile.microsoft?.name ?? state.profile.nickname;
  if (!/^[A-Za-z0-9_]{3,16}$/.test(nickname)) {
    appendLog('Tray: ustaw nick w launcherze przed startem gry.');
    showMainWindow();
    return;
  }

  const launch = await launchWithNickname(nickname);
  if (launch.phase === 'error') showMainWindow();
}

function hideToTray(restoreAfterGame: boolean): void {
  if (!mainWindow) return;
  restoreAfterGameClose = restoreAfterGameClose || restoreAfterGame;
  mainWindow.hide();
}

function showMainWindow(): void {
  if (!mainWindow) return;
  mainWindow.show();
  mainWindow.focus();
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
