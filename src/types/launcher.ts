export type Language = 'pl' | 'en';

export type ManagedFile = {
  name: string;
  path: string;
  size: number;
  sha256: string;
  version?: string;
};

export type Manifest = {
  version: string;
  generatedAt: string;
  files: ManagedFile[];
  backgrounds?: ManagedFile[];
};

export type LauncherSettings = {
  backendUrl: string;
  ramMb: number;
  fov: number;
  closeOnLaunch: boolean;
  autoConnect: boolean;
  showLogs: boolean;
  javaPath: string;
  language: Language;
};

export type LauncherProfile = {
  nickname: string;
  lastPlayedAt: string | null;
};

export type ServerHealth = {
  ok: boolean;
  serverOnline: boolean;
  playersOnline: number | null;
  playersMax: number | null;
  players: string[];
  message: string;
};

export type SyncStatus = {
  phase: 'idle' | 'checking' | 'downloading' | 'complete' | 'warning' | 'error';
  verified: boolean;
  message: string;
  currentFile?: string;
  completedFiles: number;
  totalFiles: number;
};

export type LaunchStatus = {
  running: boolean;
  phase: 'idle' | 'preparing' | 'launching' | 'running' | 'closed' | 'error';
  message: string;
  exitCode?: number;
};

export type LauncherState = {
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
    java: JavaCheckResult;
  };
};

export type JavaCheckResult = {
  ok: boolean;
  path: string;
  version: string | null;
  message: string;
};

export type LaunchRequest = {
  nickname: string;
};

export type CrashInfo = {
  exitCode: number;
  lines: string[];
};

export type ReinstallCoreResult = {
  removed: string[];
  message: string;
};

export type LauncherApi = {
  getState(): Promise<LauncherState>;
  saveSettings(settings: LauncherSettings): Promise<LauncherSettings>;
  saveProfile(profile: LauncherProfile): Promise<LauncherProfile>;
  runSync(): Promise<SyncStatus>;
  reinstallCore(): Promise<ReinstallCoreResult>;
  launchGame(request: LaunchRequest): Promise<LaunchStatus>;
  listManagedFiles(): Promise<ManagedFile[]>;
  openMinecraftFolder(): Promise<void>;
  chooseJavaPath(): Promise<string | null>;
  windowAction(action: 'minimize' | 'maximize' | 'close'): Promise<void>;
  onState(callback: (state: LauncherState) => void): () => void;
  onLog(callback: (line: string) => void): () => void;
  onCrash(callback: (crash: CrashInfo) => void): () => void;
};
