import type {
  CrashInfo,
  LauncherApi,
  LauncherProfile,
  LauncherSettings,
  LauncherState,
  ManagedFile,
  SyncStatus
} from '@/types/launcher';

const settings: LauncherSettings = {
  backendUrl: 'https://dwargonmc-sync.petershub.xyz',
  ramMb: 4096,
  closeOnLaunch: false,
  autoConnect: true,
  showLogs: true,
  javaPath: '',
  language: 'pl'
};

const profile: LauncherProfile = {
  nickname: 'Player',
  lastPlayedAt: null,
  lastSessionSeconds: 0,
  totalPlaySeconds: 0,
  launchCount: 0,
  setupComplete: true
};

let state: LauncherState = {
  setup: {
    complete: true,
    required: false,
    reason: null,
    baseInstallDir: '',
    activeInstallDir: '',
    usingNestedDir: false,
    suggestedDir: null,
    crowdedEntries: []
  },
  settings,
  profile,
  health: {
    ok: false,
    serverOnline: false,
    playersOnline: null,
    playersMax: null,
    players: ['Yrafa_Buc', 'Steve', 'Alex'],
    message: 'Mock: backend niepodłączony.'
  },
  sync: {
    phase: 'warning',
    verified: false,
    message: 'Mock: pliki nie zostały zweryfikowane.',
    completedFiles: 0,
    totalFiles: 0
  },
  launch: {
    running: false,
    phase: 'idle',
    message: 'Gotowy.'
  },
  logs: ['Mock renderer działa bez Electron IPC.'],
  managedFiles: [],
  backgrounds: [
    '/assets/backgrounds/1.png',
    '/assets/backgrounds/2.png',
    '/assets/backgrounds/3.png',
    '/assets/backgrounds/4.png'
  ],
  system: {
    totalRamMb: 16384,
    maxRamMb: 12288,
    defaultRamMb: 8192,
    java: {
      ok: false,
      path: 'java',
      version: null,
      message: 'Mock: Java nie została sprawdzona.'
    }
  }
};

const stateListeners = new Set<(next: LauncherState) => void>();
const logListeners = new Set<(line: string) => void>();
const crashListeners = new Set<(crash: CrashInfo) => void>();

function emitState(): void {
  stateListeners.forEach((listener) => listener(state));
}

export function getLauncherApi(): LauncherApi {
  if (window.launcher) return window.launcher;

  return {
    async getState() {
      return state;
    },
    async saveSettings(next) {
      state = { ...state, settings: next };
      emitState();
      return next;
    },
    async saveProfile(next) {
      state = { ...state, profile: next };
      emitState();
      return next;
    },
    async completeSetup() {
      state = {
        ...state,
        setup: { ...state.setup, complete: true, required: false },
        profile: { ...state.profile, setupComplete: true }
      };
      emitState();
      return state.profile;
    },
    async runSync() {
      const sync: SyncStatus = {
        phase: 'warning',
        verified: false,
        message: 'Mock: pliki nie zostały zweryfikowane.',
        completedFiles: 0,
        totalFiles: 0
      };
      state = { ...state, sync };
      emitState();
      return sync;
    },
    async reinstallCore() {
      const line = 'Mock: core cache wyczyszczony.';
      state = { ...state, logs: [...state.logs, line] };
      logListeners.forEach((listener) => listener(line));
      emitState();
      return {
        removed: ['versions', 'libraries', 'assets/indexes', 'assets/objects', 'assets/skins'],
        message: line
      };
    },
    async launchGame(request) {
      const line = `Mock: uruchomienie gry dla ${request.nickname}.`;
      state = {
        ...state,
        profile: {
          ...state.profile,
          nickname: request.nickname,
          lastPlayedAt: new Date().toISOString(),
          lastSessionSeconds: 42,
          totalPlaySeconds: state.profile.totalPlaySeconds + 42,
          launchCount: state.profile.launchCount + 1
        },
        logs: [...state.logs, line],
        launch: { running: true, phase: 'running', message: 'Mock: Minecraft uruchomiony.' }
      };
      logListeners.forEach((listener) => listener(line));
      emitState();
      return state.launch;
    },
    async listManagedFiles() {
      const files: ManagedFile[] = state.managedFiles;
      return files;
    },
    async openMinecraftFolder() {
      return undefined;
    },
    async chooseJavaPath() {
      return null;
    },
    async windowAction() {
      return undefined;
    },
    onState(callback) {
      stateListeners.add(callback);
      return () => stateListeners.delete(callback);
    },
    onLog(callback) {
      logListeners.add(callback);
      return () => logListeners.delete(callback);
    },
    onCrash(callback) {
      crashListeners.add(callback);
      return () => crashListeners.delete(callback);
    }
  };
}
