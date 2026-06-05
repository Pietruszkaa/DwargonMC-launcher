export type Language = 'pl' | 'en';

export type ManagedFile = {
  name: string;
  path: string;
  size: number;
  sha256: string;
  version?: string;
};

export type PlayerAddonKind = 'mod' | 'resourcepack' | 'shader';

export type PlayerAddonFile = {
  kind: PlayerAddonKind;
  name: string;
  path: string;
  size: number;
  sha1: string;
  sha512: string;
  managed: boolean;
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
  closeOnLaunch: boolean;
  windowCloseBehavior: 'ask' | 'tray' | 'exit';
  autoConnect: boolean;
  showLogs: boolean;
  javaPath: string;
  jvmArgs: string;
  minecraftArgs: string;
  language: Language;
};

export type LauncherProfile = {
  nickname: string;
  accountMode: 'offline' | 'microsoft';
  microsoft: MicrosoftProfile | null;
  lastPlayedAt: string | null;
  lastSessionSeconds: number;
  totalPlaySeconds: number;
  launchCount: number;
  setupComplete: boolean;
};

export type MicrosoftProfile = {
  name: string;
  uuid: string;
  refreshToken: string;
  xuid: string | null;
  expiresAt: number | null;
};

export type ServerHealth = {
  ok: boolean;
  serverOnline: boolean;
  playersOnline: number | null;
  playersMax: number | null;
  players: string[];
  message: string;
};

export type AnnouncementLevel = 'info' | 'warning' | 'maintenance' | 'update';

export type Announcement = {
  id: string;
  title: string;
  body: string;
  level: AnnouncementLevel;
  date: string;
  link: string | null;
  expiresAt: string | null;
};

export type AnnouncementsStatus = {
  items: Announcement[];
  cached: boolean;
  error: string | null;
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
    java: JavaCheckResult;
  };
};

export type UpdateStatus = {
  checking: boolean;
  available: boolean;
  currentVersion: string;
  latestVersion: string | null;
  releaseName: string | null;
  releaseUrl: string | null;
  downloadUrl: string | null;
  sha256Url: string | null;
  notes: string;
  error: string | null;
};

export type SetupState = {
  complete: boolean;
  required: boolean;
  reason: 'first-run' | 'crowded-folder' | null;
  baseInstallDir: string;
  activeInstallDir: string;
  usingNestedDir: boolean;
  suggestedDir: string | null;
  crowdedEntries: string[];
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

export type JavaInstallerResult = {
  started: boolean;
  path: string | null;
  message: string;
};

export type ModrinthProjectType = 'mod' | 'resourcepack' | 'shader';
export type ModrinthSort = 'relevance' | 'downloads' | 'updated' | 'newest';

export type ModrinthSearchRequest = {
  query: string;
  projectType: ModrinthProjectType;
  sort: ModrinthSort;
  offset?: number;
  limit?: number;
};

export type ModrinthProject = {
  projectId: string;
  slug: string;
  title: string;
  description: string;
  author: string;
  projectType: ModrinthProjectType;
  clientSide: string;
  serverSide: string;
  downloads: number;
  iconUrl: string | null;
};

export type ModrinthInstallRequest = {
  projectId: string;
  projectType: ModrinthProjectType;
  slug?: string;
};

export type ModrinthInstallResult = {
  installed: boolean;
  message: string;
  fileName: string | null;
  targetPath: string | null;
};

export type ModrinthAddonUpdate = {
  path: string;
  status: 'unknown' | 'current' | 'update';
  projectId: string | null;
  versionNumber: string | null;
  fileName: string | null;
  downloadUrl: string | null;
  message: string;
};

export type InstalledModrinthProject = {
  projectId: string | null;
  slug: string;
  fileName: string;
  path: string;
  kind: PlayerAddonKind;
  managed: boolean;
};

export type RemovePlayerAddonResult = {
  removed: boolean;
  message: string;
};

export type MinecraftOptionsState = {
  exists: boolean;
  path: string;
  values: Record<string, string>;
  updatedAt: string | null;
};

export type LauncherApi = {
  getState(): Promise<LauncherState>;
  saveSettings(settings: LauncherSettings): Promise<LauncherSettings>;
  saveProfile(profile: LauncherProfile): Promise<LauncherProfile>;
  completeSetup(): Promise<LauncherProfile>;
  loginMicrosoft(): Promise<LauncherProfile>;
  logoutMicrosoft(): Promise<LauncherProfile>;
  runSync(): Promise<SyncStatus>;
  refreshAnnouncements(): Promise<AnnouncementsStatus>;
  searchModrinth(request: ModrinthSearchRequest): Promise<ModrinthProject[]>;
  installModrinth(request: ModrinthInstallRequest): Promise<ModrinthInstallResult>;
  listInstalledModrinth(): Promise<InstalledModrinthProject[]>;
  removePlayerAddon(relativePath: string): Promise<RemovePlayerAddonResult>;
  checkAddonUpdates(): Promise<ModrinthAddonUpdate[]>;
  checkUpdate(): Promise<UpdateStatus>;
  openUpdateDownload(): Promise<void>;
  refreshJava(): Promise<JavaCheckResult>;
  downloadJavaInstaller(): Promise<JavaInstallerResult>;
  openJavaDownloadPage(): Promise<void>;
  reinstallCore(): Promise<ReinstallCoreResult>;
  launchGame(request: LaunchRequest): Promise<LaunchStatus>;
  listManagedFiles(): Promise<ManagedFile[]>;
  listPlayerAddons(): Promise<PlayerAddonFile[]>;
  readMinecraftOptions(): Promise<MinecraftOptionsState>;
  saveMinecraftOptions(values: Record<string, string>): Promise<MinecraftOptionsState>;
  openMinecraftFolder(): Promise<void>;
  openAddonFolder(kind: PlayerAddonKind): Promise<void>;
  chooseJavaPath(): Promise<string | null>;
  windowAction(action: 'minimize' | 'maximize' | 'close'): Promise<void>;
  onState(callback: (state: LauncherState) => void): () => void;
  onLog(callback: (line: string) => void): () => void;
  onCrash(callback: (crash: CrashInfo) => void): () => void;
};
