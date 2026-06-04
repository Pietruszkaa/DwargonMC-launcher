import { app, BrowserWindow, dialog, ipcMain, net, protocol, shell } from 'electron';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { BACKGROUND_PROTOCOL, listBackgroundUrls, resolveBackgroundRequest } from './backgrounds';
import { CRASH_LOG_LINES, MAX_LOG_LINES } from './constants';
import { reinstallCore, type ReinstallCoreResult } from './core';
import { checkJava } from './java';
import { launchGame, type LaunchStatus } from './game';
import { ensureLauncherDirs, getLauncherPaths, type LauncherPaths } from './paths';
import { getRamInfo } from './ram';
import { listManagedLocalFiles, runSync, type ManagedFile, type SyncStatus } from './sync';
import {
  readProfile,
  readSettings,
  saveProfile,
  saveSettings,
  type LauncherProfile,
  type LauncherSettings
} from './storage';

type ServerHealth = {
  ok: boolean;
  serverOnline: boolean;
  playersOnline: number | null;
  playersMax: number | null;
  players: string[];
  message: string;
};

type LauncherState = {
  settings: LauncherSettings;
  profile: LauncherProfile;
  health: ServerHealth;
  sync: SyncStatus;
  launch: LaunchStatus;
  logs: string[];
  managedFiles: ManagedFile[];
  backgrounds: string[];
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
  paths = getLauncherPaths();
  await ensureLauncherDirs(paths);
  registerBackgroundProtocol();

  const settings = await readSettings(paths);
  const profile = await readProfile(paths);
  const ram = getRamInfo();

  state = {
    settings,
    profile,
    health: await getHealth(settings.backendUrl),
    sync: idleSync(),
    launch: { running: false, phase: 'idle', message: 'Gotowy.' },
    logs: [],
    managedFiles: await listManagedLocalFiles(paths.minecraftDir),
    backgrounds: await listBackgroundUrls(paths),
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

  if (process.env.VITE_DEV_SERVER_URL) {
    await mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
  } else {
    await mainWindow.loadFile(path.join(__dirname, '../../dist/index.html'));
  }

  registerIpc();
  startHealthPolling();
  void performStartupSync();
}

function registerIpc(): void {
  ipcMain.handle('launcher:get-state', () => state);

  ipcMain.handle('launcher:save-settings', async (_event, settings: LauncherSettings) => {
    state.settings = await saveSettings(paths, settings);
    state.system.java = await checkJava(state.settings.javaPath);
    await refreshHealth();
    return state.settings;
  });

  ipcMain.handle('launcher:save-profile', async (_event, profile: LauncherProfile) => {
    state.profile = await saveProfile(paths, profile);
    emitState();
    return state.profile;
  });

  ipcMain.handle('launcher:run-sync', () => performStartupSync());

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

  ipcMain.handle('launcher:launch-game', async (_event, request: { nickname: string }) => {
    state.profile = await saveProfile(paths, {
      ...state.profile,
      nickname: request.nickname,
      lastPlayedAt: new Date().toISOString()
    });
    state.system.java = await checkJava(state.settings.javaPath);

    if (!state.system.java.ok) {
      state.launch = { running: false, phase: 'error', message: state.system.java.message };
      emitState();
      return state.launch;
    }

    state.launch = await launchGame(paths, state.settings, request.nickname, {
      onStatus: (launch) => {
        state.launch = launch;
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
      mainWindow?.minimize();
    }

    emitState();
    return state.launch;
  });

  ipcMain.handle('launcher:list-managed-files', async () => {
    state.managedFiles = await listManagedLocalFiles(paths.minecraftDir);
    emitState();
    return state.managedFiles;
  });

  ipcMain.handle('launcher:open-minecraft-folder', async () => {
    await shell.openPath(paths.minecraftDir);
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
  state.sync = await runSync(paths, state.settings.backendUrl, (sync) => {
    state.sync = sync;
    emitState();
  });
  state.managedFiles = await listManagedLocalFiles(paths.minecraftDir);
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

function appendLog(line: string): void {
  const text = String(line).trimEnd();
  if (!text) return;

  state.logs = [...state.logs, text].slice(-MAX_LOG_LINES);
  mainWindow?.webContents.send('launcher:log', text);
  emitState();
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

app.on('window-all-closed', () => {
  stopHealthPolling();
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) void createWindow();
});
