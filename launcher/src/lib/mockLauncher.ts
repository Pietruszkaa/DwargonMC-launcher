import type {
  CrashInfo,
  LauncherApi,
  MinecraftInstanceCheck,
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
  windowCloseBehavior: 'ask',
  autoConnect: true,
  showLogs: true,
  javaPath: '',
  jvmArgs: '',
  minecraftArgs: '',
  language: 'pl'
};

const mockServer = {
  id: 'https://dwargonmc-sync.petershub.xyz',
  instanceId: 'dwargonmc-sync-petershub-xyz-mock',
  name: 'DwargonMC',
  backendUrl: 'https://dwargonmc-sync.petershub.xyz',
  minecraft: {
    address: 'dwargonmc.playit.plus',
    version: '1.21.1',
    loader: 'neoforge' as const,
    loaderVersion: null
  },
  authRequired: false,
  addedAt: new Date().toISOString(),
  lastUsedAt: new Date().toISOString()
};

const profile: LauncherProfile = {
  nickname: 'Player',
  accountMode: 'offline',
  microsoft: null,
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
  servers: {
    activeServerId: mockServer.id,
    servers: [mockServer]
  },
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
  playerAddons: [
    {
      kind: 'resourcepack',
      name: 'mock-pack.zip',
      path: 'resourcepacks/mock-pack.zip',
      size: 1024,
      sha1: 'mock-sha1',
      sha512: 'mock-sha512',
      managed: false
    }
  ],
  backgrounds: [
    '/assets/backgrounds/1.png',
    '/assets/backgrounds/2.png',
    '/assets/backgrounds/3.png',
    '/assets/backgrounds/4.png'
  ],
  announcements: {
    items: [
      {
        id: 'mock-welcome',
        title: 'Komunikat serwera',
        body: 'Tutaj pojawia sie informacja od admina z sync-server.',
        level: 'info',
        date: new Date().toISOString(),
        link: null,
        expiresAt: null
      }
    ],
    cached: false,
    error: null
  },
  update: {
    checking: false,
    available: false,
    currentVersion: '1.1.2',
    latestVersion: null,
    releaseName: null,
    releaseUrl: null,
    downloadUrl: null,
    downloadName: null,
    sha256Url: null,
    notes: '',
    error: null,
    download: {
      phase: 'idle',
      progress: 0,
      downloadedBytes: 0,
      totalBytes: null,
      filePath: null,
      fileName: null,
      expectedSha256: null,
      actualSha256: null,
      message: ''
    }
  },
  session: {
    activeStartedAt: null,
    tickAt: new Date().toISOString()
  },
  system: {
    totalRamMb: 16384,
    maxRamMb: 12288,
    defaultRamMb: 8192,
    java: {
      ok: false,
      path: 'java',
      version: null,
      message: 'Mock: Java nie została sprawdzona.'
    },
    javaInstaller: {
      phase: 'idle',
      progress: 0,
      downloadedBytes: 0,
      totalBytes: null,
      path: null,
      url: 'https://download.oracle.com/java/21/latest/jdk-21_windows-x64_bin.exe',
      pageUrl: 'https://www.oracle.com/pl/java/technologies/downloads/#jdk21-windows',
      message: ''
    }
  }
};

const stateListeners = new Set<(next: LauncherState) => void>();
const logListeners = new Set<(line: string) => void>();
const crashListeners = new Set<(crash: CrashInfo) => void>();
const instanceListeners = new Set<(check: MinecraftInstanceCheck) => void>();

function emitState(): void {
  stateListeners.forEach((listener) => listener(state));
}

export function getLauncherApi(): LauncherApi {
  if (window.launcher) return window.launcher;

  return {
    async getState() {
      return state;
    },
    async addServer(backendUrl) {
      const normalized = backendUrl.trim().replace(/\/+$/, '');
      const server = {
        id: normalized,
        instanceId: normalized.replace(/^https?:\/\//, '').replace(/[^a-z0-9_-]+/gi, '-').toLowerCase(),
        name: new URL(normalized).hostname,
        backendUrl: normalized,
        minecraft: {
          address: null,
          version: '1.21.1',
          loader: 'neoforge' as const,
          loaderVersion: null
        },
        authRequired: false,
        addedAt: new Date().toISOString(),
        lastUsedAt: new Date().toISOString()
      };
      state = {
        ...state,
        settings: { ...state.settings, backendUrl: normalized },
        servers: {
          activeServerId: server.id,
          servers: [...state.servers.servers.filter((entry) => entry.id !== server.id), server]
        }
      };
      emitState();
      return state;
    },
    async switchServer(serverId) {
      const server = state.servers.servers.find((entry) => entry.id === serverId);
      if (!server) throw new Error('Nie znaleziono serwera.');
      state = {
        ...state,
        settings: { ...state.settings, backendUrl: server.backendUrl },
        servers: { ...state.servers, activeServerId: server.id }
      };
      emitState();
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
    async loginMicrosoft() {
      state = {
        ...state,
        profile: {
          ...state.profile,
          nickname: 'PremiumPlayer',
          accountMode: 'microsoft',
          microsoft: {
            name: 'PremiumPlayer',
            uuid: '00000000000000000000000000000000',
            xuid: null,
            expiresAt: Date.now() + 3600_000
          }
        }
      };
      emitState();
      return state.profile;
    },
    async logoutMicrosoft() {
      state = {
        ...state,
        profile: {
          ...state.profile,
          accountMode: 'offline',
          microsoft: null
        }
      };
      emitState();
      return state.profile;
    },
    async runSync() {
      const sync: SyncStatus = {
        phase: 'ready',
        verified: false,
        message: 'Mock: sync wykrył zmiany do potwierdzenia.',
        completedFiles: 0,
        totalFiles: 1,
        plan: {
          version: 'mock',
          generatedAt: new Date().toISOString(),
          changes: [
            {
              path: 'mods/_mock.jar',
              kind: 'file',
              action: 'download',
              impact: 'recommended'
            }
          ],
          hasChanges: true,
          highestImpact: 'recommended',
          requiredCount: 0,
          recommendedCount: 1,
          optionalCount: 0
        }
      };
      state = { ...state, sync };
      emitState();
      return sync;
    },
    async applySync() {
      const sync: SyncStatus = {
        phase: 'complete',
        verified: true,
        message: 'Mock: pliki zsynchronizowane.',
        completedFiles: 1,
        totalFiles: 1
      };
      state = { ...state, sync };
      emitState();
      return sync;
    },
    async refreshAnnouncements() {
      return state.announcements;
    },
    async getModrinthCache() {
      return null;
    },
    async searchModrinth(request) {
      return [
        {
          projectId: 'mock-sodium',
          slug: 'sodium',
          title: request.projectType === 'shader' ? 'Mock Shader' : 'Mock Sodium',
          description: 'Przykladowy wynik Modrinth w trybie dev bez Electron IPC.',
          author: 'Modrinth',
          projectType: request.projectType,
          clientSide: 'required',
          serverSide: request.projectType === 'mod' ? 'unsupported' : 'unknown',
          downloads: 123456,
          iconUrl: null
        }
      ];
    },
    async installModrinth(request) {
      const folder = request.projectType === 'shader' ? 'shaderpacks' : request.projectType === 'resourcepack' ? 'resourcepacks' : 'mods';
      return {
        installed: true,
        message: `Mock: zainstalowano dodatek w ${folder}.`,
        fileName: `mock-${request.projectType}.jar`,
        targetPath: `minecraft/${folder}/mock-${request.projectType}.jar`
      };
    },
    async listInstalledModrinth() {
      return [
        {
          projectId: 'mock-sodium',
          slug: 'mock-pack',
          fileName: 'mock-pack.zip',
          path: 'resourcepacks/mock-pack.zip',
          kind: 'resourcepack',
          managed: false
        }
      ];
    },
    async removePlayerAddon(relativePath) {
      state = {
        ...state,
        playerAddons: state.playerAddons.filter((file) => file.path !== relativePath)
      };
      emitState();
      return {
        removed: true,
        message: `Mock: usunieto ${relativePath}.`
      };
    },
    async checkAddonUpdates() {
      return state.playerAddons.map((file) => ({
        path: file.path,
        status: 'unknown',
        projectId: null,
        versionNumber: null,
        fileName: null,
        downloadUrl: null,
        message: 'Mock: zrodlo nieznane w Modrinth.'
      }));
    },
    async checkUpdate() {
      return state.update;
    },
    async openUpdateDownload() {
      return undefined;
    },
    async downloadUpdate() {
      state.update.download = {
        phase: 'ready',
        progress: 100,
        downloadedBytes: 0,
        totalBytes: null,
        filePath: '/mock/Dwargon Launcher update.exe',
        fileName: 'Dwargon Launcher update.exe',
        expectedSha256: null,
        actualSha256: '0'.repeat(64),
        message: 'Mock: aktualizacja pobrana.'
      };
      emitState();
      return state.update.download;
    },
    async showDownloadedUpdate() {
      return undefined;
    },
    async refreshJava() {
      state = {
        ...state,
        system: {
          ...state.system,
          java: {
            ok: true,
            path: 'java',
            version: '21',
            message: 'Mock: Java 21 gotowa.'
          }
        }
      };
      emitState();
      return state.system.java;
    },
    async downloadJavaInstaller() {
      state.system.javaInstaller = {
        phase: 'ready',
        progress: 100,
        downloadedBytes: 0,
        totalBytes: null,
        path: '/mock/jdk-21_windows-x64_bin.exe',
        url: 'https://download.oracle.com/java/21/latest/jdk-21_windows-x64_bin.exe',
        pageUrl: 'https://www.oracle.com/pl/java/technologies/downloads/#jdk21-windows',
        message: 'Mock: pobrano instalator Java 21.'
      };
      emitState();
      return state.system.javaInstaller;
    },
    async openJavaInstaller() {
      return undefined;
    },
    async openJavaDownloadPage() {
      return undefined;
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
    async listPlayerAddons() {
      return state.playerAddons;
    },
    async readMinecraftOptions() {
      return {
        exists: true,
        path: '/mock/minecraft/options.txt',
        updatedAt: new Date().toISOString(),
        values: {
          autoJump: 'false',
          fov: '0.0',
          guiScale: '3',
          renderDistance: '12',
          simulationDistance: '8',
          particles: '1',
          'key_key.jump': 'key.keyboard.space',
          'key_key.inventory': 'key.keyboard.e'
        }
      };
    },
    async saveMinecraftOptions(values) {
      return {
        exists: true,
        path: '/mock/minecraft/options.txt',
        updatedAt: new Date().toISOString(),
        values
      };
    },
    async openMinecraftFolder() {
      return undefined;
    },
    async openAddonFolder() {
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
    },
    onInstanceRequired(callback) {
      instanceListeners.add(callback);
      return () => instanceListeners.delete(callback);
    }
  };
}
