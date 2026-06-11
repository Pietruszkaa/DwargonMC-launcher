import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type UIEvent } from 'react';
import { Modal } from '~components/Modal';
import { branding, brandingStyle } from '@/lib/branding';
import minecraftOptionsSchema from '@/lib/minecraft-options.schema.json';
import { getLauncherApi } from '@/lib/mockLauncher';
import { t } from '@/lib/i18n';
import type { Announcement, CrashInfo, InstalledModrinthProject, LauncherSettings, LauncherState, MinecraftInstanceCheck, MinecraftOptionsState, ModrinthAddonUpdate, ModrinthProject, ModrinthProjectType, ModrinthSort, SyncPlanChange } from '@/types/launcher';

type Popup = 'settings' | 'files' | 'map' | 'logs' | 'modrinth' | null;
type SettingsCategory = 'launcher' | 'arguments' | 'mc-options';
type McOptionEntry = {
  key: string;
  label: string;
  type: 'boolean' | 'integer' | 'decimal' | 'enum' | 'string' | 'keybind';
  default?: string;
  min?: number;
  max?: number;
  step?: number;
  unit?: string;
  restartRequired?: boolean;
  notes?: string;
  options?: Array<{ value: string; label: string }>;
};
type McOptionCategory = {
  id: string;
  label: string;
  description?: string;
  entries: McOptionEntry[];
};

const api = getLauncherApi();
const MODRINTH_PAGE_SIZE = 20;
const launcherIconUrl = new URL('../assets/icon.ico', import.meta.url).href;

export function App(): JSX.Element {
  const [state, setState] = useState<LauncherState | null>(null);
  const [popup, setPopup] = useState<Popup>(null);
  const [crash, setCrash] = useState<CrashInfo | null>(null);
  const [nickname, setNickname] = useState('');
  const [logsExpanded, setLogsExpanded] = useState(false);
  const [mapFullscreen, setMapFullscreen] = useState(false);
  const [backgroundIndex, setBackgroundIndex] = useState(0);
  const [updateDismissed, setUpdateDismissed] = useState(false);
  const [accountPromptDismissed, setAccountPromptDismissed] = useState(false);
  const [javaPromptDismissed, setJavaPromptDismissed] = useState(false);
  const [timeTick, setTimeTick] = useState(() => Date.now());
  const [mapAvailable, setMapAvailable] = useState(false);
  const [activeSettingsCategory, setActiveSettingsCategory] = useState<SettingsCategory>('launcher');
  const [manualUpdateOpen, setManualUpdateOpen] = useState(false);
  const [syncPromptDismissed, setSyncPromptDismissed] = useState<string | null>(null);
  const [instanceCheck, setInstanceCheck] = useState<MinecraftInstanceCheck | null>(null);

  useEffect(() => {
    void api.getState().then((next) => {
      setState(next);
      setNickname(next.profile.nickname);
    });

    const offState = api.onState((next) => {
      setState(next);
      setNickname((current) => current || next.profile.nickname);
    });
    const offCrash = api.onCrash((nextCrash) => setCrash(nextCrash));
    const offInstanceRequired = api.onInstanceRequired((check) => setInstanceCheck(check));

    return () => {
      offState();
      offCrash();
      offInstanceRequired();
    };
  }, []);

  const copy = useMemo(() => t(state?.settings.language ?? 'pl'), [state?.settings.language]);

  useEffect(() => {
    const total = state?.backgrounds.length ?? 0;
    if (total <= 1) return undefined;

    const timer = window.setInterval(() => {
      setBackgroundIndex((current) => (current + 1) % total);
    }, 30_000);

    return () => window.clearInterval(timer);
  }, [state?.backgrounds.length]);

  useEffect(() => {
    if (state?.system.java.ok) setJavaPromptDismissed(false);
  }, [state?.system.java.ok]);

  useEffect(() => {
    if (state?.launch.running || !state?.profile.lastPlayedAt) return undefined;

    setTimeTick(Date.now());
    const timer = window.setInterval(() => {
      setTimeTick(Date.now());
    }, 60_000);

    return () => window.clearInterval(timer);
  }, [state?.launch.running, state?.profile.lastPlayedAt]);

  useEffect(() => {
    if (!state?.health.ok || !state.settings.backendUrl) {
      setMapAvailable(false);
      return undefined;
    }

    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), 3500);

    fetch(`${state.settings.backendUrl}/map/`, {
      headers: { Accept: 'text/html,application/xhtml+xml' },
      signal: controller.signal
    })
      .then((response) => setMapAvailable(response.ok))
      .catch(() => setMapAvailable(false))
      .finally(() => window.clearTimeout(timer));

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [state?.health.ok, state?.settings.backendUrl]);

  const openLauncherSettings = useCallback(() => {
    setActiveSettingsCategory('launcher');
    setPopup('settings');
  }, []);

  const openMinecraftSettings = useCallback(() => {
    setActiveSettingsCategory('mc-options');
    setPopup('settings');
  }, []);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        if (crash) {
          setCrash(null);
          return;
        }
        if (mapFullscreen) {
          setMapFullscreen(false);
          return;
        }
        if (popup) {
          setPopup(null);
        }
        return;
      }

      if (!event.ctrlKey && !event.metaKey) return;

      const target = event.target as HTMLElement | null;
      if (target && ['INPUT', 'SELECT', 'TEXTAREA'].includes(target.tagName)) return;

      const key = event.key.toLowerCase();
      if (key === ',') {
        event.preventDefault();
        openLauncherSettings();
      } else if (key === 'l') {
        event.preventDefault();
        setPopup('logs');
      } else if (key === 'm') {
        event.preventDefault();
        setPopup('modrinth');
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [crash, mapFullscreen, openLauncherSettings, popup]);

  const handlePlay = useCallback(async () => {
    await api.launchGame({ nickname });
  }, [nickname]);

  const handleApplySync = useCallback(async () => {
    await api.applySync();
  }, []);

  const checkUpdates = useCallback(async () => {
    await api.checkUpdate();
    setManualUpdateOpen(true);
    setUpdateDismissed(false);
  }, []);

  const switchServer = useCallback(async (serverId: string) => {
    await api.switchServer(serverId);
  }, []);

  const handleWindowAction = useCallback((action: 'minimize' | 'maximize' | 'close') => {
    void api.windowAction(action);
  }, []);

  const handleCompleteSetup = useCallback(async () => {
    await api.completeSetup();
  }, []);

  if (!state) {
    return <div className="boot">{branding.launcherName}</div>;
  }

  const activeServer = state.servers.servers.find((server) => server.id === state.servers.activeServerId) ?? null;
  const serverName = activeServer?.name ?? branding.serverName;
  const serverVersion = activeServer ? activeServer.minecraft.version : 'Brak aktywnego serwera';
  const syncPercent =
    state.sync.totalFiles > 0 ? Math.round((state.sync.completedFiles / state.sync.totalFiles) * 100) : 0;
  const syncProgressWidth = state.sync.verified || state.sync.phase === 'complete' ? 100 : syncPercent;
  const showTopProgress = state.sync.phase === 'checking' || state.sync.phase === 'downloading';
  const isNickValid = /^[A-Za-z0-9_]{3,16}$/.test(nickname);
  const settingsOpen = popup === 'settings';
  const showUpdatePrompt = (state.update.available && !updateDismissed) || manualUpdateOpen;
  const showServerPrompt = state.setup.complete && !activeServer;
  const showAccountPrompt = !showServerPrompt && !accountPromptDismissed && state.profile.accountMode === 'offline' && !state.profile.nickname;
  const showJavaPrompt =
    !javaPromptDismissed &&
    !state.system.java.ok &&
    state.setup.complete &&
    !showUpdatePrompt &&
    !showAccountPrompt &&
    !popup &&
    !crash;
  const syncPromptKey = state.sync.plan ? `${state.settings.backendUrl}:${state.sync.plan.version}:${state.sync.plan.changes.length}` : null;
  const showSyncPrompt = Boolean(state.sync.phase === 'ready' && state.sync.plan?.hasChanges && syncPromptKey !== syncPromptDismissed);

  if (state.setup.required && !state.setup.complete) {
    return <SetupWizard state={state} onComplete={handleCompleteSetup} onWindowAction={handleWindowAction} />;
  }

  return (
    <main className={state.servers.servers.length > 1 ? 'shell shell-with-server-rail' : 'shell'} style={brandingStyle as CSSProperties}>
      <div className="background-layer" aria-hidden="true">
        {state.backgrounds.map((background, index) => (
          <span
            className={index === backgroundIndex % state.backgrounds.length ? 'background-slide background-slide-active' : 'background-slide'}
            key={background}
            style={{ backgroundImage: `url("${background}")` } as CSSProperties}
          />
        ))}
      </div>

      <div className="top-bar">
        <img className="top-launcher-icon" src={launcherIconUrl} alt="" aria-hidden="true" />
        <div className="status-left">
          <span className={`server-state ${state.health.ok ? 'server-state-online' : 'server-state-offline'}`}>
            <span aria-hidden="true" />
            Backend {state.health.ok ? 'Online' : 'Offline'}
          </span>
          <span className={`server-state ${state.health.serverOnline ? 'server-state-online' : 'server-state-offline'}`}>
            <span aria-hidden="true" />
            Serwer {state.health.serverOnline ? 'Online' : 'Offline'}
          </span>
        </div>
        <div className="top-bar-right">
          <button className="top-icon-btn" type="button" onClick={openLauncherSettings} title="Ustawienia launchera" aria-label="Ustawienia launchera">
            ⚙
          </button>
          <span className="version-right">v{state.update.currentVersion}</span>
          <div className="window-controls" aria-label="Window controls">
            <button className="win-btn" type="button" onClick={() => handleWindowAction('minimize')} aria-label="Minimalizuj">−</button>
            <button className="win-btn" type="button" onClick={() => handleWindowAction('maximize')} aria-label="Maksymalizuj">□</button>
            <button className="win-btn close" type="button" onClick={() => handleWindowAction('close')} aria-label="Zamknij">×</button>
          </div>
        </div>
        {showTopProgress && (
          <div className="top-progress-shell" aria-label="Postęp synchronizacji" title={state.sync.message}>
            <span style={{ width: `${syncProgressWidth}%` }} />
          </div>
        )}
      </div>

      <div className="launcher-container">
        {state.servers.servers.length > 1 && (
          <aside className="server-rail" aria-label="Wybór serwera">
            {state.servers.servers.map((server) => (
              <button
                className={server.id === state.servers.activeServerId ? 'server-rail-btn active' : 'server-rail-btn'}
                type="button"
                key={server.id}
                onClick={() => void switchServer(server.id)}
                disabled={server.id === state.servers.activeServerId || state.launch.running}
                title={`${server.name} · ${server.minecraft.version}`}
              >
                <strong>{server.name.slice(0, 2).toUpperCase()}</strong>
                <small>{server.minecraft.version}</small>
              </button>
            ))}
          </aside>
        )}

        <aside className="sidebar">
          <div className="logo-block">
            <h1 className="logo">{serverName}</h1>
            <p className="logo-meta">{serverVersion}</p>
          </div>

          <nav className="main-menu" aria-label={settingsOpen ? 'Kategorie ustawień' : 'Launcher actions'}>
            {settingsOpen ? (
              <>
                <button className="menu-btn back" type="button" onClick={() => setPopup(null)}>
                  Back
                </button>
                <button className={activeSettingsCategory === 'launcher' ? 'menu-btn active' : 'menu-btn'} type="button" onClick={() => setActiveSettingsCategory('launcher')}>
                  Launcher
                </button>
                <button className={activeSettingsCategory === 'arguments' ? 'menu-btn active' : 'menu-btn'} type="button" onClick={() => setActiveSettingsCategory('arguments')}>
                  Argumenty MC
                </button>
                <button className={activeSettingsCategory === 'mc-options' ? 'menu-btn active' : 'menu-btn'} type="button" onClick={() => setActiveSettingsCategory('mc-options')}>
                  Opcje MC
                </button>
              </>
            ) : (
              <>
                <div className={state.sync.plan?.hasChanges ? 'play-sync-row' : 'play-sync-row play-sync-row-single'}>
                  <button className="menu-btn active" type="button" disabled={!isNickValid || state.launch.running} onClick={handlePlay}>
                    {copy.play}
                  </button>
                  {state.sync.plan?.hasChanges && (
                    <button
                      className="sync-icon-btn"
                      type="button"
                      onClick={handleApplySync}
                      disabled={state.sync.phase === 'checking' || state.sync.phase === 'downloading'}
                      title="Pobierz aktualizacje manifestu"
                      aria-label="Pobierz aktualizacje manifestu"
                    >
                      ↻
                    </button>
                  )}
                </div>
                <button className="menu-btn" type="button" onClick={openMinecraftSettings}>
                  Minecraft
                </button>
                <button className="menu-btn" type="button" onClick={() => setPopup('logs')}>
                  {copy.logs}
                </button>
                <button className="menu-btn" type="button" onClick={() => setPopup('modrinth')}>
                  Dodatki
                </button>
              </>
            )}
            <div className="spacer" />
            <div className="sidebar-status">
              <label className="sidebar-nick">
                <span>{state.profile.accountMode === 'microsoft' ? 'Microsoft' : 'Nick'}</span>
                <input
                  value={nickname}
                  onChange={(event) => setNickname(event.target.value)}
                  placeholder="Wpisz nick..."
                  disabled={state.profile.accountMode === 'microsoft'}
                />
              </label>
              <div className="sidebar-stats">
                <span>Ostatnia sesja</span>
                <strong>{formatLastSessionClose(state.profile.lastPlayedAt, timeTick)}</strong>
                <span>Łączny czas gry</span>
                <strong>{formatDuration(state.profile.totalPlaySeconds)}</strong>
              </div>
            </div>
            <button className="icon-btn" type="button" onClick={() => void api.openMinecraftFolder()} title="Pliki gry">
              Pliki gry
            </button>
          </nav>
        </aside>

        <section className="content-area">
          <aside className="right-rail">
            {state.health.ok && mapAvailable && (
              <MapPanel backendUrl={state.settings.backendUrl} onToggle={() => setMapFullscreen(true)} />
            )}

            <div className="right-stack">
              <section className="players-panel">
                <header>
                  <h2>Lista graczy</h2>
                  <span>{state.health.playersOnline ?? state.health.players.length}/{state.health.playersMax ?? '--'}</span>
                </header>
                <div className="players-list">
                  {state.health.players.length ? state.health.players.map((player) => <span key={player}>{player}</span>) : <span className="muted">Brak danych z backendu</span>}
                </div>
              </section>
            </div>
          </aside>

          {settingsOpen ? (
            <SettingsWorkspace state={state} activeCategory={activeSettingsCategory} onCheckUpdates={checkUpdates} />
          ) : (
            <AnnouncementsPanel items={state.announcements.items} cached={state.announcements.cached} error={state.announcements.error} />
          )}

          {state.settings.showLogs && (
            <section className={`inline-logs ${logsExpanded ? 'inline-logs-expanded' : ''}`}>
              <header>
                <span>{state.launch.message}</span>
                <button type="button" onClick={() => setLogsExpanded((current) => !current)}>
                  {logsExpanded ? 'Mniej' : 'Więcej'}
                </button>
              </header>
              <code>{state.logs.slice(logsExpanded ? -16 : -6).join('\n') || 'Brak logów JVM.'}</code>
            </section>
          )}
        </section>
      </div>

      {mapFullscreen && state.health.ok && mapAvailable && (
        <div className="map-overlay">
          <MapPanel backendUrl={state.settings.backendUrl} fullscreen onToggle={() => setMapFullscreen(false)} />
        </div>
      )}

      {popup === 'files' && <FilesModal state={state} onClose={() => setPopup(null)} />}
      {popup === 'map' && <MapModal backendUrl={state.settings.backendUrl} onClose={() => setPopup(null)} />}
      {popup === 'logs' && <LogsModal logs={state.logs} onClose={() => setPopup(null)} />}
      {popup === 'modrinth' && <ModrinthModal onClose={() => setPopup(null)} />}
      {showUpdatePrompt && (
        <UpdateModal
          state={state}
          onClose={() => {
            setUpdateDismissed(true);
            setManualUpdateOpen(false);
          }}
        />
      )}
      {showSyncPrompt && state.sync.plan && (
        <SyncPlanModal
          plan={state.sync.plan}
          onClose={() => setSyncPromptDismissed(syncPromptKey)}
        />
      )}
      {showServerPrompt && <ServerSetupModal />}
      {showAccountPrompt && (
        <AccountChoiceModal onClose={() => setAccountPromptDismissed(true)} />
      )}
      {showJavaPrompt && (
        <JavaHelpModal state={state} onClose={() => setJavaPromptDismissed(true)} />
      )}
      {instanceCheck && <InstanceRequiredModal check={instanceCheck} onClose={() => setInstanceCheck(null)} onDownload={() => { setInstanceCheck(null); void api.launchGame({ nickname, forceDownload: true }); }} />}
      {crash && <CrashModal crash={crash} onClose={() => setCrash(null)} />}
    </main>
  );
}

function AnnouncementsPanel({
  items,
  cached,
  error
}: {
  items: Announcement[];
  cached: boolean;
  error: string | null;
}): JSX.Element | null {
  if (!items.length) return null;
  if (error && /^HTTP \d+$/i.test(error.trim())) return null;

  return (
    <section className="announcements-panel">
      <header>
        <h2>Komunikaty</h2>
        {cached && <span>cache</span>}
      </header>
      <div className="announcements-list">
        {items.slice(0, 3).map((item) => (
          <article className={`announcement announcement-${item.level}`} key={item.id}>
            <strong>{item.title}</strong>
            <p>{item.body}</p>
            {item.link && (
              <button type="button" onClick={() => window.open(item.link!, '_blank', 'noopener,noreferrer')}>
                Otwórz
              </button>
            )}
          </article>
        ))}
      </div>
    </section>
  );
}

function SetupWizard({
  state,
  onComplete,
  onWindowAction
}: {
  state: LauncherState;
  onComplete: () => Promise<void>;
  onWindowAction: (action: 'minimize' | 'maximize' | 'close') => void;
}): JSX.Element {
  const [busy, setBusy] = useState(false);

  const chooseDirectory = async (): Promise<void> => {
    if (busy) return;

    setBusy(true);
    try {
      await api.chooseSetupDirectory();
    } finally {
      setBusy(false);
    }
  };

  const finish = async (): Promise<void> => {
    setBusy(true);
    try {
      await onComplete();
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="setup-shell">
      <div className="setup-window-controls window-controls" aria-label="Window controls">
        <button className="win-btn" type="button" onClick={() => onWindowAction('minimize')} aria-label="Minimalizuj">−</button>
        <button className="win-btn close" type="button" onClick={() => onWindowAction('close')} aria-label="Zamknij">×</button>
      </div>

      <section className="setup-panel" aria-label="Pierwsza konfiguracja">
        <span className="setup-kicker">Pierwsza konfiguracja</span>
        <h1>{branding.launcherName}</h1>
        {state.setup.reason === 'crowded-folder' ? (
          <p>
            Launcher utworzy folder <strong>Dwargon Launcher</strong> i będzie trzymał w nim Minecrafta, ustawienia,
            logi oraz pliki serwerów. Dzięki temu folder, z którego uruchomiono plik .exe, zostanie czysty.
          </p>
        ) : (
          <p>
            Launcher przygotuje folder danych z Minecraftem, ustawieniami, logami i plikami serwerów. Możesz użyć
            proponowanej lokalizacji albo wskazać własny folder.
          </p>
        )}

        <div className="setup-paths">
          <div>
            <span>Folder uruchomienia</span>
            <code>{state.setup.baseInstallDir}</code>
          </div>
          <div>
            <span>Folder danych launchera</span>
            <code>{state.setup.activeInstallDir}</code>
          </div>
        </div>

        <p className="setup-note">
          Plik .exe możesz później przenieść ręcznie do wybranego folderu, jeśli chcesz mieć launcher i dane w jednym
          miejscu. Launcher nie przenosi sam siebie podczas pracy.
        </p>

        <footer className="setup-actions">
          <button className="secondary-button" type="button" onClick={chooseDirectory} disabled={busy}>
            Wybierz inny folder
          </button>
          <button className="play-button compact" type="button" onClick={finish} disabled={busy}>
            {busy ? 'Zapisywanie...' : 'Użyj proponowanego folderu'}
          </button>
        </footer>
      </section>
    </main>
  );
}

function MapPanel({
  backendUrl,
  fullscreen = false,
  onToggle
}: {
  backendUrl: string;
  fullscreen?: boolean;
  onToggle: () => void;
}): JSX.Element {
  return (
    <section className={`map-panel ${fullscreen ? 'map-panel-fullscreen' : ''}`} aria-label={`Mapa ${branding.serverName}`}>
      <header>
        <span>Mapa</span>
        <button type="button" onClick={onToggle}>
          {fullscreen ? 'Zamknij' : 'Fullscreen'}
        </button>
      </header>
      <iframe title={`Mapa ${branding.serverName}`} src={`${backendUrl}/map/`} />
    </section>
  );
}

function formatDuration(totalSeconds: number, zeroLabel = 'brak'): string {
  const seconds = Math.max(0, Math.round(totalSeconds || 0));
  if (seconds === 0) return zeroLabel;

  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);

  if (hours > 0 && minutes > 0) return `${hours}h ${minutes}min`;
  if (hours > 0) return `${hours}h`;
  if (minutes > 0) return `${minutes}min`;
  return '<1min';
}

function formatLastSessionClose(value: string | null, now: number): string {
  if (!value) return 'brak';

  const closedAt = Date.parse(value);
  if (Number.isNaN(closedAt)) return 'brak';

  const secondsAgo = Math.max(0, Math.floor((now - closedAt) / 1000));
  return `${formatDuration(secondsAgo, '<1min')} temu`;
}

function AccountChoiceModal({ onClose }: { onClose: () => void }): JSX.Element {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  const login = async (): Promise<void> => {
    setBusy(true);
    setMessage('Otwieranie logowania Microsoft...');
    try {
      await api.loginMicrosoft();
      onClose();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Nie udało się zalogować konta Microsoft.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title="Wybierz tryb konta" onClose={onClose}>
      <div className="account-choice">
        <button type="button" onClick={onClose} disabled={busy}>
          <strong>Non-premium</strong>
          <span>Wpisz nick w górnym pasku i graj offline.</span>
        </button>
        <button type="button" onClick={login} disabled={busy}>
          <strong>Microsoft</strong>
          <span>Zaloguj konto premium przez Microsoft.</span>
        </button>
        {message && <p className="notice notice-warn">{message}</p>}
      </div>
    </Modal>
  );
}

function ServerSetupModal(): JSX.Element {
  const [backendUrl, setBackendUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('Wklej adres backendu serwera, np. https://sync.example.com');

  const add = async (): Promise<void> => {
    setBusy(true);
    try {
      await api.addServer(backendUrl);
      setMessage('Serwer dodany.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Nie udało się dodać serwera.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title="Dodaj serwer" onClose={() => undefined}>
      <div className="server-setup">
        <p>{message}</p>
        <input value={backendUrl} onChange={(event) => setBackendUrl(event.target.value)} placeholder="https://sync.example.com" />
      </div>
      <footer className="modal-actions">
        <button className="play-button compact" type="button" onClick={add} disabled={busy || !backendUrl.trim()}>
          {busy ? 'Sprawdzanie...' : 'Dodaj serwer'}
        </button>
      </footer>
    </Modal>
  );
}

function JavaHelpModal({ state, onClose }: { state: LauncherState; onClose: () => void }): JSX.Element {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(state.system.java.message);
  const installer = state.system.javaInstaller;
  const downloading = installer.phase === 'downloading';
  const installerReady = installer.phase === 'ready' && Boolean(installer.path);
  const installerProgress = installer.totalBytes
    ? `${formatBytes(installer.downloadedBytes)} / ${formatBytes(installer.totalBytes)}`
    : installer.downloadedBytes > 0
      ? formatBytes(installer.downloadedBytes)
      : '';

  const downloadInstaller = async (): Promise<void> => {
    setBusy(true);
    setMessage(`Pobieranie instalatora Java ${state.system.java.requiredMajor} z Adoptium...`);
    try {
      const result = await api.downloadJavaInstaller();
      setMessage(result.message);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Nie udało się pobrać instalatora Java. Użyj trybu ręcznego.');
    } finally {
      setBusy(false);
    }
  };

  const runInstaller = async (): Promise<void> => {
    await api.openJavaInstaller();
    setMessage('Po zakończeniu instalacji kliknij „Sprawdź ponownie”.');
  };

  const refresh = async (): Promise<void> => {
    setBusy(true);
    try {
      const result = await api.refreshJava();
      setMessage(result.message);
      if (result.ok) onClose();
    } finally {
      setBusy(false);
    }
  };

  const chooseJava = async (): Promise<void> => {
    const selected = await api.chooseJavaPath();
    if (!selected) return;

    setBusy(true);
    try {
      await api.saveSettings({ ...state.settings, javaPath: selected });
      const result = await api.refreshJava();
      setMessage(result.message);
      if (result.ok) onClose();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title={`Java ${state.system.java.requiredMajor} zalecana`} onClose={onClose}>
      <div className="java-help">
        <p>{message}</p>
        <div className="java-download-info">
          <span>Źródło: Eclipse Temurin JDK {state.system.java.requiredMajor} Windows x64</span>
          <code>{installer.url}</code>
          <div className="progress-track">
            <span style={{ width: `${installer.progress}%` }} />
          </div>
          {(installer.message || installerProgress) && (
            <small>{installer.message}{installerProgress ? ` · ${installerProgress}` : ''}</small>
          )}
        </div>
        <div className="java-help-actions">
          <button type="button" onClick={downloadInstaller} disabled={busy}>
            {downloading ? 'Pobieranie...' : 'Pobierz instalator'}
          </button>
          <button type="button" onClick={runInstaller} disabled={!installerReady || busy}>
            Uruchom instalator
          </button>
          <button type="button" onClick={() => void api.openJavaDownloadPage()} disabled={busy}>
            Strona Adoptium
          </button>
          <button type="button" onClick={refresh} disabled={busy}>
            Sprawdź ponownie
          </button>
          <button type="button" onClick={chooseJava} disabled={busy}>
            Wskaż ręcznie
          </button>
        </div>
        <small>
          Automatyczny tryb pobiera oficjalny instalator Eclipse Temurin JDK {state.system.java.requiredMajor} i uruchamia go normalnie.
          Klikaj w instalatorze Next/Install, a po zakończeniu wróć do launchera i użyj „Sprawdź ponownie”. Launcher nie instaluje
          Javy po cichu.
        </small>
      </div>
    </Modal>
  );
}

function SettingsWorkspace({
  state,
  activeCategory,
  onCheckUpdates
}: {
  state: LauncherState;
  activeCategory: SettingsCategory;
  onCheckUpdates: () => Promise<void>;
}): JSX.Element {
  const [draft, setDraft] = useState<LauncherSettings>(state.settings);
  const [coreMessage, setCoreMessage] = useState('');
  const [accountMessage, setAccountMessage] = useState('');
  const [accountBusy, setAccountBusy] = useState(false);
  const [settingsMessage, setSettingsMessage] = useState('');
  const [mcOptions, setMcOptions] = useState<MinecraftOptionsState | null>(null);
  const [mcDraft, setMcDraft] = useState<Record<string, string>>({});
  const [mcMessage, setMcMessage] = useState('');
  const [mcGroup, setMcGroup] = useState('video');
  const [newServerUrl, setNewServerUrl] = useState('');
  const [serverMessage, setServerMessage] = useState('');
  const copy = t(draft.language);
  const mcCategories = minecraftOptionsSchema.categories as McOptionCategory[];
  const optionCategories = mcCategories.filter((category) => category.id !== 'controls');
  const selectedMcCategory = optionCategories.find((category) => category.id === mcGroup) ?? optionCategories[0];

  const update = <K extends keyof LauncherSettings>(key: K, value: LauncherSettings[K]): void => {
    setDraft((current) => ({ ...current, [key]: value }));
  };

  useEffect(() => {
    void api.readMinecraftOptions().then((next) => {
      setMcOptions(next);
      setMcDraft(next.values);
    });
  }, []);

  useEffect(() => {
    setDraft(state.settings);
  }, [state.settings]);

  const chooseJava = async (): Promise<void> => {
    const selected = await api.chooseJavaPath();
    if (selected) update('javaPath', selected);
  };

  const refreshJava = async (): Promise<void> => {
    await api.saveSettings(draft);
    const result = await api.refreshJava();
    update('javaPath', result.path === 'java' ? '' : result.path);
  };

  const save = async (): Promise<void> => {
    const saved = await api.saveSettings(draft);
    setDraft(saved);
    setSettingsMessage('Zapisano ustawienia launchera.');
  };

  const addServer = async (): Promise<void> => {
    setServerMessage('Sprawdzanie backendu...');
    try {
      await api.addServer(newServerUrl);
      setNewServerUrl('');
      setServerMessage('Serwer dodany i aktywny.');
    } catch (error) {
      setServerMessage(error instanceof Error ? error.message : 'Nie udało się dodać serwera.');
    }
  };

  const switchServer = async (serverId: string): Promise<void> => {
    setServerMessage('Przełączanie serwera...');
    try {
      await api.switchServer(serverId);
      setServerMessage('Serwer przełączony.');
    } catch (error) {
      setServerMessage(error instanceof Error ? error.message : 'Nie udało się przełączyć serwera.');
    }
  };

  const saveMcOptions = async (): Promise<void> => {
    if (state.launch.running) {
      setMcMessage('Zamknij Minecraft przed zapisem. Gra zapisuje options.txt przy wyjściu i może nadpisać zmiany.');
      return;
    }

    const saved = await api.saveMinecraftOptions(mcDraft);
    setMcOptions(saved);
    setMcDraft(saved.values);
    setMcMessage('Zapisano options.txt. Zmiany zadziałają od następnego uruchomienia gry.');
  };

  const handleReinstallCore = async (): Promise<void> => {
    const result = await api.reinstallCore();
    setCoreMessage(result.message);
  };

  const handleMicrosoftLogin = async (): Promise<void> => {
    setAccountBusy(true);
    setAccountMessage('Otwieranie logowania Microsoft...');
    try {
      const profile = await api.loginMicrosoft();
      setAccountMessage(`Zalogowano jako ${profile.microsoft?.name ?? profile.nickname}.`);
    } catch (error) {
      setAccountMessage(error instanceof Error ? error.message : 'Nie udało się zalogować konta Microsoft.');
    } finally {
      setAccountBusy(false);
    }
  };

  const handleMicrosoftLogout = async (): Promise<void> => {
    setAccountBusy(true);
    try {
      await api.logoutMicrosoft();
      setAccountMessage('Wylogowano konto Microsoft. Launcher użyje trybu non-premium.');
    } finally {
      setAccountBusy(false);
    }
  };

  return (
    <section className="settings-workspace" aria-label={copy.settings}>
      <header className="settings-workspace-header">
        <div>
          <span>Ustawienia</span>
          <h2>{settingsCategoryTitle(activeCategory)}</h2>
        </div>
        <button className="play-button compact" type="button" onClick={activeCategory === 'mc-options' ? saveMcOptions : save}>
          Zapisz
        </button>
      </header>

      {activeCategory === 'launcher' && (
        <div className="settings-grid settings-section">
          <section className="account-box" aria-label="Account mode">
            <div>
              <strong>Konto</strong>
              <p>
                {state.profile.accountMode === 'microsoft' && state.profile.microsoft
                  ? `Microsoft: ${state.profile.microsoft.name}`
                  : 'Tryb non-premium / offline'}
              </p>
            </div>
            {state.profile.accountMode === 'microsoft' ? (
              <button type="button" onClick={handleMicrosoftLogout} disabled={accountBusy}>
                Wyloguj Microsoft
              </button>
            ) : (
              <button type="button" onClick={handleMicrosoftLogin} disabled={accountBusy}>
                Zaloguj Microsoft
              </button>
            )}
            {accountMessage && <small>{accountMessage}</small>}
          </section>
          <section className="account-box" aria-label="Servers">
            <div>
              <strong>Serwery</strong>
              <p>Każdy backend ma osobną instancję Minecrafta i własne ustawienia.</p>
            </div>
            <div className="server-list">
              {state.servers.servers.length > 0 ? (
                state.servers.servers.map((server) => (
                  <button
                    className={server.id === state.servers.activeServerId ? 'active' : ''}
                    type="button"
                    key={server.id}
                    onClick={() => void switchServer(server.id)}
                    disabled={server.id === state.servers.activeServerId || state.launch.running}
                  >
                    <strong>{server.name}</strong>
                    <small>{server.backendUrl}</small>
                    <small>
                      MC: {server.minecraft.version} / {server.minecraft.loader}
                      {server.minecraft.loaderVersion ? ` ${server.minecraft.loaderVersion}` : ''}
                      {server.minecraft.address ? ` / ${server.minecraft.address}` : ''}
                    </small>
                  </button>
                ))
              ) : (
                <small>Brak dodanych serwerów.</small>
              )}
            </div>
            <div className="inline-control">
              <input value={newServerUrl} onChange={(event) => setNewServerUrl(event.target.value)} placeholder="https://sync.example.com" />
              <button type="button" onClick={addServer} disabled={!newServerUrl.trim() || state.launch.running}>Dodaj</button>
            </div>
            {serverMessage && <small>{serverMessage}</small>}
          </section>
          <section className="account-box" aria-label="Launcher updates">
            <div>
              <strong>Aktualizacje</strong>
              <p>
                Obecna wersja: {state.update.currentVersion}
                {state.update.available && state.update.latestVersion ? ` / dostępna ${state.update.latestVersion}` : ''}
              </p>
            </div>
            <button type="button" onClick={() => void onCheckUpdates()} disabled={state.update.checking}>
              {state.update.checking ? 'Sprawdzanie...' : 'Sprawdź aktualizacje'}
            </button>
            {state.update.error && <small>{state.update.error}</small>}
          </section>
          <label className="field">
            <span>{copy.backend}</span>
            <input value={draft.backendUrl || 'Brak aktywnego serwera'} readOnly />
            <small>Adres backendu jest ID aktywnej instancji. Dodaj albo przełącz serwer w sekcji wyżej.</small>
          </label>
          <label className="field row-field">
            <input type="checkbox" checked={draft.closeOnLaunch} onChange={(event) => update('closeOnLaunch', event.target.checked)} />
            <span>{copy.closeOnLaunch}</span>
          </label>
          <label className="field">
            <span>Zamknięcie okna</span>
            <select
              value={draft.windowCloseBehavior}
              onChange={(event) => update('windowCloseBehavior', event.target.value as LauncherSettings['windowCloseBehavior'])}
            >
              <option value="ask">Zapytaj przy pierwszym zamknięciu</option>
              <option value="tray">Minimalizuj launcher</option>
              <option value="exit">Zamknij launcher</option>
            </select>
            <small>Decyduje co robi przycisk X w prawym górnym rogu. Ten wybór możesz zmienić później.</small>
          </label>
          <label className="field row-field">
            <input type="checkbox" checked={draft.showLogs} onChange={(event) => update('showLogs', event.target.checked)} />
            <span>{copy.showLogs}</span>
          </label>
          <label className="field">
            <span>{copy.java}</span>
            <div className="inline-control">
              <input value={draft.javaPath} onChange={(event) => update('javaPath', event.target.value)} placeholder="PATH / java.exe" />
              <button type="button" onClick={chooseJava}>{copy.choose}</button>
            </div>
            <div className="java-actions">
              <button type="button" onClick={() => void api.downloadJavaInstaller()}>Pobierz instalator Java {state.system.java.requiredMajor}</button>
              <button type="button" onClick={() => void api.openJavaInstaller()} disabled={state.system.javaInstaller.phase !== 'ready'}>Uruchom instalator</button>
              <button type="button" onClick={() => void api.openJavaDownloadPage()}>Strona Adoptium</button>
              <button type="button" onClick={refreshJava}>Sprawdź ponownie</button>
            </div>
            {state.system.javaInstaller.message && <small>{state.system.javaInstaller.message}</small>}
            <small>{state.system.java.message}</small>
          </label>
          <section className="danger-zone" aria-label="Core reinstall">
            <div>
              <strong>Reinstall core</strong>
              <p>Czyści runtime gry, wersje, biblioteki, assety i stare installery NeoForge. Nie rusza modów, configów ani save'ów.</p>
            </div>
            <button type="button" onClick={handleReinstallCore} disabled={state.launch.running}>
              Reinstall core
            </button>
          </section>
          {settingsMessage && <p className="notice notice-good">{settingsMessage}</p>}
          {coreMessage && <p className="notice notice-warn">{coreMessage}</p>}
        </div>
      )}

      {activeCategory === 'arguments' && (
        <div className="settings-grid settings-section">
          <label className="field">
            <span>{copy.ram}: {draft.ramMb} MB</span>
            <input
              type="range"
              min={2048}
              max={state.system.maxRamMb}
              step={256}
              value={draft.ramMb}
              onChange={(event) => update('ramMb', Number(event.target.value))}
            />
          </label>
          <label className="field row-field">
            <input type="checkbox" checked={draft.autoConnect} onChange={(event) => update('autoConnect', event.target.checked)} />
            <span>{copy.autoConnect}</span>
          </label>
          <label className="field">
            <span>Argumenty JVM</span>
            <input value={draft.jvmArgs} onChange={(event) => update('jvmArgs', event.target.value)} placeholder="-Dexample=true" />
            <small>Dopisuje argumenty do JVM przez MCLC `customArgs`. Nie wpisuj tutaj `-Xmx`, bo RAM jest ustawiany suwakiem.</small>
          </label>
          <label className="field">
            <span>Argumenty gry</span>
            <input value={draft.minecraftArgs} onChange={(event) => update('minecraftArgs', event.target.value)} placeholder="--width 1280 --height 720" />
            <small>Dopisuje argumenty Minecraft przez MCLC `customLaunchArgs`. Nie wymuszamy FOV ani opcji gracza.</small>
          </label>
          {settingsMessage && <p className="notice notice-good">{settingsMessage}</p>}
        </div>
      )}

      {activeCategory === 'mc-options' && (
        <div className="settings-section mc-options-editor">
          <div className="mc-group-tabs">
            {optionCategories.map((category) => (
              <button className={selectedMcCategory.id === category.id ? 'active' : ''} type="button" key={category.id} onClick={() => setMcGroup(category.id)}>
                {category.label}
              </button>
            ))}
          </div>
          <p className="notice">{selectedMcCategory.description}</p>
          <McOptionsForm entries={selectedMcCategory.entries} values={mcDraft} onChange={setMcDraft} />
          <OptionsFileStatus options={mcOptions} message={mcMessage} />
        </div>
      )}
    </section>
  );
}

function settingsCategoryTitle(category: SettingsCategory): string {
  if (category === 'arguments') return 'Argumenty MC';
  if (category === 'mc-options') return 'Ustawienia MC';
  return 'Launcher';
}

function McOptionsForm({
  entries,
  values,
  onChange
}: {
  entries: McOptionEntry[];
  values: Record<string, string>;
  onChange: (values: Record<string, string>) => void;
}): JSX.Element {
  const updateValue = (key: string, value: string): void => {
    onChange({ ...values, [key]: value });
  };

  return (
    <div className="mc-options-list">
      {entries.map((entry) => (
        <label className="mc-option-row" key={entry.key}>
          <span>
            <strong>{entry.label}</strong>
            <small>{entry.key}{entry.unit ? ` · ${entry.unit}` : ''}{entry.restartRequired ? ' · restart gry' : ''}</small>
          </span>
          <McOptionInput entry={entry} value={values[entry.key] ?? entry.default ?? ''} onChange={(value) => updateValue(entry.key, value)} />
          {entry.notes && <em>{entry.notes}</em>}
        </label>
      ))}
    </div>
  );
}

function McOptionInput({
  entry,
  value,
  onChange
}: {
  entry: McOptionEntry;
  value: string;
  onChange: (value: string) => void;
}): JSX.Element {
  if (entry.key.startsWith('soundCategory_')) {
    const percent = optionDecimalToPercent(value);
    const updatePercent = (nextPercent: number): void => {
      onChange(percentToOptionDecimal(nextPercent));
    };

    return (
      <div className="numeric-option-control">
        <input
          type="range"
          min={0}
          max={100}
          step={1}
          value={percent}
          onChange={(event) => updatePercent(Number(event.target.value))}
        />
        <input
          type="number"
          min={0}
          max={100}
          step={1}
          value={percent}
          onChange={(event) => updatePercent(Number(event.target.value))}
        />
      </div>
    );
  }

  if (entry.key === 'fov') {
    const degrees = fovOptionToDegrees(value);
    const updateDegrees = (nextDegrees: number): void => {
      onChange(degreesToFovOption(nextDegrees));
    };

    return (
      <div className="numeric-option-control">
        <input
          type="range"
          min={30}
          max={110}
          step={2}
          value={degrees}
          onChange={(event) => updateDegrees(Number(event.target.value))}
        />
        <input
          type="number"
          min={30}
          max={110}
          step={2}
          value={degrees}
          onChange={(event) => updateDegrees(Number(event.target.value))}
        />
      </div>
    );
  }

  if (entry.type === 'boolean') {
    return (
      <select value={value} onChange={(event) => onChange(event.target.value)}>
        <option value="true">Tak</option>
        <option value="false">Nie</option>
      </select>
    );
  }

  if (entry.options?.length) {
    return (
      <select value={value} onChange={(event) => onChange(event.target.value)}>
        {entry.options.map((option) => (
          <option value={option.value} key={option.value}>{option.label}</option>
        ))}
      </select>
    );
  }

  if ((entry.type === 'integer' || entry.type === 'decimal') && typeof entry.min === 'number' && typeof entry.max === 'number') {
    const step = entry.step ?? (entry.type === 'integer' ? 1 : 0.01);
    const numericValue = getOptionNumber(value, entry.min, entry.max, entry.default);
    const updateNumber = (nextValue: number): void => {
      onChange(formatOptionNumber(nextValue, entry.min as number, entry.max as number, step, entry.type));
    };

    return (
      <div className="numeric-option-control">
        <input
          type="range"
          min={entry.min}
          max={entry.max}
          step={step}
          value={numericValue}
          onChange={(event) => updateNumber(Number(event.target.value))}
        />
        <input
          type="number"
          min={entry.min}
          max={entry.max}
          step={step}
          value={numericValue}
          onChange={(event) => updateNumber(Number(event.target.value))}
        />
      </div>
    );
  }

  if (entry.type === 'integer' || entry.type === 'decimal') {
    return (
      <input
        type="number"
        min={entry.min}
        max={entry.max}
        step={entry.step ?? (entry.type === 'integer' ? 1 : 0.01)}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    );
  }

  return <input value={value} onChange={(event) => onChange(event.target.value)} />;
}

function getOptionNumber(value: string, min: number, max: number, fallback?: string): number {
  const parsed = Number(value);
  if (Number.isFinite(parsed)) return clampNumber(parsed, min, max);
  const parsedFallback = Number(fallback);
  if (Number.isFinite(parsedFallback)) return clampNumber(parsedFallback, min, max);
  return min;
}

function formatOptionNumber(value: number, min: number, max: number, step: number, type: McOptionEntry['type']): string {
  const clamped = clampNumber(value, min, max);
  if (type === 'integer') return String(Math.round(clamped));
  const precision = getStepPrecision(step);
  return clamped.toFixed(precision).replace(/\.?0+$/, '') || '0';
}

function getStepPrecision(step: number): number {
  const normalized = String(step);
  if (!normalized.includes('.')) return 0;
  return normalized.split('.')[1]?.length ?? 0;
}

function fovOptionToDegrees(value: string): number {
  const normalized = clampNumber(Number(value), -1, 1);
  return Math.round((40 * normalized + 70) / 2) * 2;
}

function degreesToFovOption(degrees: number): string {
  const normalized = (clampNumber(degrees, 30, 110) - 70) / 40;
  return normalized.toFixed(2).replace(/\.?0+$/, '') || '0';
}

function clampNumber(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

function optionDecimalToPercent(value: string): number {
  return Math.round(clampNumber(Number(value), 0, 1) * 100);
}

function percentToOptionDecimal(percent: number): string {
  return (clampNumber(percent, 0, 100) / 100).toFixed(2).replace(/\.?0+$/, '') || '0';
}

function OptionsFileStatus({ options, message }: { options: MinecraftOptionsState | null; message: string }): JSX.Element {
  return (
    <footer className="options-file-status">
      <span>{options?.exists ? 'options.txt znaleziony' : 'options.txt zostanie utworzony przy zapisie'}</span>
      <span>Zmiany działają od następnego uruchomienia Minecrafta.</span>
      <code>{options?.path ?? 'minecraft/options.txt'}</code>
      {message && <strong>{message}</strong>}
    </footer>
  );
}

function FilesModal({ state, onClose }: { state: LauncherState; onClose: () => void }): JSX.Element {
  const copy = t(state.settings.language);
  const [updates, setUpdates] = useState<ModrinthAddonUpdate[]>([]);
  const [checking, setChecking] = useState(false);
  const updateByPath = useMemo(() => new Map(updates.map((update) => [update.path, update])), [updates]);
  const refreshAddons = async (): Promise<void> => {
    await api.listPlayerAddons();
  };
  const checkUpdates = async (): Promise<void> => {
    setChecking(true);
    try {
      setUpdates(await api.checkAddonUpdates());
    } finally {
      setChecking(false);
    }
  };

  return (
    <Modal title={copy.files} onClose={onClose} wide>
      <div className="file-actions">
        <button type="button" onClick={() => void api.openMinecraftFolder()}>{copy.openFolder}</button>
        <button type="button" onClick={() => void api.openAddonFolder('mod')}>Mods</button>
        <button type="button" onClick={() => void api.openAddonFolder('resourcepack')}>Resourcepacks</button>
        <button type="button" onClick={() => void api.openAddonFolder('shader')}>Shaderpacks</button>
        <button type="button" onClick={() => void api.runSync()}>{copy.resync}</button>
        <button type="button" onClick={refreshAddons}>Odśwież</button>
        <button type="button" onClick={checkUpdates} disabled={checking}>
          {checking ? 'Sprawdzanie...' : 'Sprawdź update'}
        </button>
      </div>
      <div className="files-sections">
        <section>
          <h3>Pliki serwera</h3>
          <div className="file-table">
            {state.managedFiles.length === 0 ? (
              <p>Brak lokalnych plików zarządzanych.</p>
            ) : (
              state.managedFiles.map((file) => (
                <div className="file-row" key={file.path}>
                  <span>{file.path}</span>
                  <strong>{Math.round(file.size / 1024)} KB</strong>
                  <code>{file.sha256.slice(0, 12)}</code>
                </div>
              ))
            )}
          </div>
        </section>
        <section>
          <h3>Dodatki gracza</h3>
          <div className="file-table">
            {state.playerAddons.length === 0 ? (
              <p>Brak lokalnych resourcepacków, shaderpacków albo modów gracza.</p>
            ) : (
              state.playerAddons.map((file) => (
                <div className="file-row player-addon-row" key={file.path}>
                  <span>{file.path}</span>
                  <strong>{addonKindLabel(file.kind)}</strong>
                  <code>{addonUpdateLabel(updateByPath.get(file.path))}</code>
                </div>
              ))
            )}
          </div>
        </section>
      </div>
    </Modal>
  );
}

function addonKindLabel(kind: LauncherState['playerAddons'][number]['kind']): string {
  if (kind === 'resourcepack') return 'Resourcepack';
  if (kind === 'shader') return 'Shader';
  return 'Mod';
}

function addonUpdateLabel(update: ModrinthAddonUpdate | undefined): string {
  if (!update) return 'nie sprawdzono';
  if (update.status === 'update') return update.versionNumber ? `update ${update.versionNumber}` : 'update';
  if (update.status === 'current') return 'aktualne';
  return 'nieznane';
}

function MapModal({ backendUrl, onClose }: { backendUrl: string; onClose: () => void }): JSX.Element {
  return (
    <Modal title="Mapa" onClose={onClose} wide>
      <iframe className="map-frame" title={`Mapa ${branding.serverName}`} src={`${backendUrl}/map/`} />
    </Modal>
  );
}

function LogsModal({ logs, onClose }: { logs: string[]; onClose: () => void }): JSX.Element {
  const [autoscroll, setAutoscroll] = useState(true);
  const logRef = useRef<HTMLPreElement | null>(null);

  useEffect(() => {
    if (!autoscroll || !logRef.current) return;
    logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [autoscroll, logs]);

  return (
    <Modal title="Logi" onClose={onClose} wide>
      <div className="logs-toolbar">
        <label className="field row-field">
          <input type="checkbox" checked={autoscroll} onChange={(event) => setAutoscroll(event.target.checked)} />
          <span>Autoscroll</span>
        </label>
      </div>
      <pre className="logs-view" ref={logRef}>{logs.length ? logs.join('\n') : 'Brak logów.'}</pre>
    </Modal>
  );
}

function ModrinthModal({ onClose }: { onClose: () => void }): JSX.Element {
  const [query, setQuery] = useState('');
  const [projectType, setProjectType] = useState<ModrinthProjectType>('resourcepack');
  const [sort, setSort] = useState<ModrinthSort>('downloads');
  const [results, setResults] = useState<ModrinthProject[]>([]);
  const [busy, setBusy] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [installed, setInstalled] = useState<InstalledModrinthProject[]>([]);
  const [view, setView] = useState<'browse' | 'installed'>('browse');
  const [message, setMessage] = useState('');
  const loadingResultsRef = useRef(false);
  const userInstalled = installed.filter((item) => !item.managed);
  const serverInstalled = installed.filter((item) => item.managed);

  const refreshInstalled = useCallback(async (): Promise<void> => {
    try {
      setInstalled(await api.listInstalledModrinth());
    } catch {
      setInstalled([]);
    }
  }, []);

  const loadResults = useCallback(async (reset: boolean): Promise<void> => {
    const nextOffset = reset ? 0 : offset;
    if (loadingResultsRef.current || (!reset && (!hasMore || busy || loadingMore))) return;

    loadingResultsRef.current = true;
    if (reset) {
      setBusy(true);
      setMessage('Wyszukiwanie w Modrinth...');
    } else {
      setLoadingMore(true);
    }

    try {
      const next = await api.searchModrinth({
        query,
        projectType,
        sort,
        offset: nextOffset,
        limit: MODRINTH_PAGE_SIZE
      });

      setResults((current) => (reset ? next : [...current, ...next]));
      setOffset(nextOffset + next.length);
      setHasMore(next.length === MODRINTH_PAGE_SIZE);

      setMessage(next.length ? '' : 'Brak wyników dla tych filtrów.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Nie udało się pobrać wyników Modrinth.');
    } finally {
      if (reset) {
        setBusy(false);
      } else {
        setLoadingMore(false);
      }
      loadingResultsRef.current = false;
    }
  }, [busy, hasMore, loadingMore, offset, projectType, query, results.length, sort]);

  useEffect(() => {
    void refreshInstalled();
    void api.getModrinthCache().then((cache) => {
      if (cache?.results.length) {
        setQuery(cache.query);
        setProjectType(cache.projectType);
        setSort(cache.sort);
        setResults(cache.results);
        setOffset(cache.results.length);
        setHasMore(cache.results.length === MODRINTH_PAGE_SIZE);
        setMessage('');
        return;
      }

      void loadResults(true);
    });
  }, []);

  const handleScroll = (event: UIEvent<HTMLDivElement>): void => {
    const target = event.currentTarget;
    const remaining = target.scrollHeight - target.scrollTop - target.clientHeight;
    if (remaining < 120) void loadResults(false);
  };

  const install = async (project: ModrinthProject): Promise<void> => {
    setBusy(true);
    setMessage(`Instalowanie ${project.title}...`);
    try {
      const result = await api.installModrinth({ projectId: project.projectId, projectType: project.projectType, slug: project.slug });
      setMessage(result.message);
      await refreshInstalled();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Nie udało się zainstalować dodatku.');
    } finally {
      setBusy(false);
    }
  };

  const removeInstalled = async (item: InstalledModrinthProject): Promise<void> => {
    if (item.managed) return;

    setBusy(true);
    setMessage(`Usuwanie ${item.fileName}...`);
    try {
      const result = await api.removePlayerAddon(item.path);
      setMessage(result.message);
      await refreshInstalled();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Nie udało się usunąć dodatku.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title="Dodatki Modrinth" onClose={onClose} wide>
      <div className="modrinth-panel">
        <div className="modrinth-controls">
          <label className="field modrinth-search">
            <span>Szukaj</span>
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Sodium, Complementary, Faithful..." />
          </label>
          <div className="modrinth-tabs" role="tablist" aria-label="Widok Modrinth">
            <button className={view === 'browse' ? 'active' : ''} type="button" onClick={() => setView('browse')}>
              Przeglądaj
            </button>
            <button className={view === 'installed' ? 'active' : ''} type="button" onClick={() => setView('installed')}>
              Zainstalowane
            </button>
          </div>
          <label className="field">
            <span>Typ</span>
            <select value={projectType} onChange={(event) => setProjectType(event.target.value as ModrinthProjectType)}>
              <option value="resourcepack">Resourcepack</option>
              <option value="shader">Shaderpack</option>
              <option value="mod">Client-side mod</option>
            </select>
          </label>
          <label className="field">
            <span>Sortuj</span>
            <select value={sort} onChange={(event) => setSort(event.target.value as ModrinthSort)}>
              <option value="relevance">Trafnosc</option>
              <option value="downloads">Pobrania</option>
              <option value="updated">Aktualizowane</option>
              <option value="newest">Najnowsze</option>
            </select>
          </label>
          <button className="play-button compact" type="button" onClick={() => void loadResults(true)} disabled={busy}>
            {busy ? 'Pracuje...' : 'Szukaj'}
          </button>
        </div>

        {message && <p className="notice notice-warn">{message}</p>}

        {view === 'installed' ? (
          <section className="installed-addons">
            <div className="installed-groups">
              <InstalledAddonGroup title="Użytkownika" items={userInstalled} busy={busy} onRemove={removeInstalled} />
              <InstalledAddonGroup title="Serwerowe" items={serverInstalled} busy={busy} onRemove={removeInstalled} />
            </div>
          </section>
        ) : (
          <div className="modrinth-browser">
            <div className="modrinth-results" onScroll={handleScroll}>
              {results.map((project) => {
                const installedAddon = findInstalledAddon(project, installed);

                return (
                  <article className={`modrinth-card ${installedAddon ? 'installed' : ''}`} key={project.projectId}>
                    {project.iconUrl ? <img src={project.iconUrl} alt="" /> : <span className="modrinth-icon-placeholder">{project.title.slice(0, 1)}</span>}
                    <div>
                      <header>
                        <strong>{project.title}</strong>
                        <small>{projectTypeLabel(project.projectType)} · {project.downloads.toLocaleString('pl-PL')} pobran</small>
                      </header>
                      <p>{project.description}</p>
                      {project.projectType === 'mod' && (
                        <small>Client: {project.clientSide || 'unknown'} · Server: {project.serverSide || 'unknown'}</small>
                      )}
                      {installedAddon && (
                        <small className="installed-label">Zainstalowany: {installedAddon.fileName}</small>
                      )}
                    </div>
                    <button type="button" onClick={() => install(project)} disabled={busy || Boolean(installedAddon)}>
                      {installedAddon ? 'Zainstalowany' : 'Instaluj'}
                    </button>
                  </article>
                );
              })}
              {loadingMore && <p className="notice notice-warn">Wczytywanie kolejnych wyników...</p>}
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}

function InstalledAddonGroup({
  title,
  items,
  busy,
  onRemove
}: {
  title: string;
  items: InstalledModrinthProject[];
  busy: boolean;
  onRemove(item: InstalledModrinthProject): Promise<void>;
}): JSX.Element {
  return (
    <section className="installed-group">
      <h4>{title}</h4>
      {items.length ? (
        items.map((item) => (
          <div className="installed-row" key={item.path}>
            <span>
              <strong>{item.fileName}</strong>
              <small>{projectTypeLabel(item.kind === 'resourcepack' ? 'resourcepack' : item.kind === 'shader' ? 'shader' : 'mod')}</small>
            </span>
            {item.managed ? (
              <em>Z serwera</em>
            ) : (
              <button type="button" onClick={() => void onRemove(item)} disabled={busy}>
                Usuń
              </button>
            )}
          </div>
        ))
      ) : (
        <p>Brak.</p>
      )}
    </section>
  );
}

function projectTypeLabel(projectType: ModrinthProjectType): string {
  if (projectType === 'resourcepack') return 'Resourcepack';
  if (projectType === 'shader') return 'Shaderpack';
  return 'Client-side mod';
}

function findInstalledAddon(project: ModrinthProject, installed: InstalledModrinthProject[]): InstalledModrinthProject | null {
  return installed.find((item) => {
    if (item.projectId && item.projectId === project.projectId) return true;
    return item.slug === project.slug || item.slug.startsWith(`${project.slug}-`);
  }) ?? null;
}

function SyncPlanModal({ plan, onClose }: { plan: NonNullable<LauncherState['sync']['plan']>; onClose: () => void }): JSX.Element {
  const [busy, setBusy] = useState(false);
  const topChanges = plan.changes.slice(0, 12);
  const title = plan.highestImpact === 'recommended' ? 'Sync zalecany przed grą' : 'Dostępne pliki opcjonalne';

  const apply = async (): Promise<void> => {
    setBusy(true);
    try {
      await api.applySync();
      onClose();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title={title} onClose={onClose} wide>
      <div className="sync-plan">
        <p className={plan.highestImpact === 'recommended' ? 'notice notice-warn' : 'notice'}>
          {plan.highestImpact === 'recommended'
            ? 'Manifest zawiera mody albo config. To jest mocno zalecane przed wejściem na serwer, bo pliki mogą być wymagane po obu stronach.'
            : 'Manifest zawiera tylko pliki opcjonalne, np. tła albo paczki zasobów.'}
        </p>
        <div className="sync-plan-summary">
          <span>Zmiany: <strong>{plan.changes.length}</strong></span>
          <span>Mocno zalecane: <strong>{plan.recommendedCount}</strong></span>
          <span>Opcjonalne: <strong>{plan.optionalCount}</strong></span>
        </div>
        <div className="sync-plan-list">
          {topChanges.map((change) => (
            <span key={`${change.action}:${change.kind}:${change.path}`}>
              <strong>{syncActionLabel(change)}</strong>
              <small>{change.path}</small>
            </span>
          ))}
          {plan.changes.length > topChanges.length && <em>+{plan.changes.length - topChanges.length} więcej</em>}
        </div>
      </div>
      <footer className="modal-actions">
        <button className="secondary-button" type="button" onClick={onClose}>
          Nie teraz
        </button>
        <button className="play-button compact" type="button" onClick={apply} disabled={busy}>
          {busy ? 'Synchronizacja...' : 'Pobierz i zweryfikuj'}
        </button>
      </footer>
    </Modal>
  );
}

function syncActionLabel(change: SyncPlanChange): string {
  const action = change.action === 'download' ? 'Pobierz' : change.action === 'update' ? 'Aktualizuj' : 'Usuń';
  const impact = change.impact === 'recommended' ? 'zalecane' : change.impact === 'required' ? 'wymagane' : 'opcjonalne';
  return `${action} · ${impact}`;
}

function InstanceRequiredModal({ check, onClose, onDownload }: { check: MinecraftInstanceCheck; onClose: () => void; onDownload: () => void }): JSX.Element {
  return (
    <Modal title="Instancja Minecraft nie jest gotowa" onClose={onClose} wide>
      <div className="sync-plan">
        <p className="notice notice-warn">{check.message}</p>
        <p>Brakuje core/runtime plików instancji. To pobieranie nie jest już uruchamiane po cichu przy kliknięciu Graj.</p>
        <div className="sync-plan-list">
          {check.missing.slice(0, 14).map((item) => (
            <span key={item}>
              <strong>Brakuje</strong>
              <small>{item}</small>
            </span>
          ))}
          {check.missing.length > 14 && <em>+{check.missing.length - 14} więcej</em>}
        </div>
      </div>
      <footer className="modal-actions">
        <button className="secondary-button" type="button" onClick={() => void api.reinstallCore()}>
          Wyczyść core
        </button>
        <button className="play-button compact" type="button" onClick={onDownload}>
          Pobierz instancję Minecraft
        </button>
        <button className="secondary-button compact" type="button" onClick={onClose}>
          Anuluj
        </button>
      </footer>
    </Modal>
  );
}

function UpdateModal({ state, onClose }: { state: LauncherState; onClose: () => void }): JSX.Element {
  const notes = state.update.notes.trim();
  const download = state.update.download;
  const hasUpdate = state.update.available;
  const busy = download.phase === 'downloading' || download.phase === 'verifying';
  const ready = download.phase === 'ready';
  const canDownload = Boolean(state.update.downloadUrl);
  const progressLabel = download.totalBytes
    ? `${formatBytes(download.downloadedBytes)} / ${formatBytes(download.totalBytes)}`
    : download.downloadedBytes > 0
      ? formatBytes(download.downloadedBytes)
      : '';

  const openRelease = async (): Promise<void> => {
    await api.openUpdateDownload();
  };

  const downloadUpdate = async (): Promise<void> => {
    await api.downloadUpdate();
  };

  const showDownloadedUpdate = async (): Promise<void> => {
    await api.showDownloadedUpdate();
  };

  if (!hasUpdate) {
    return (
      <Modal title="Aktualizacje" onClose={onClose}>
        <div className="update-panel compact">
          <p>
            Masz aktualną wersję: <strong>{state.update.currentVersion}</strong>
          </p>
          {state.update.error && <div className="notice notice-warn">{state.update.error}</div>}
        </div>
        <footer className="modal-actions">
          <button className="play-button compact" type="button" onClick={onClose}>
            OK
          </button>
        </footer>
      </Modal>
    );
  }

  return (
    <Modal title="Dostępna aktualizacja" onClose={onClose}>
      <div className="update-panel">
        <p><strong>{state.update.currentVersion}</strong> → <strong>{state.update.latestVersion}</strong></p>
        {notes && <pre>{notes.slice(0, 900)}</pre>}
        <div className="update-download-box">
          <div className="progress-track">
            <span style={{ width: `${download.progress}%` }} />
          </div>
          <small>{download.message || (state.update.sha256Url ? 'SHA256 zostanie sprawdzone po pobraniu.' : 'Ten release nie ma pliku SHA256SUMS.txt.')}</small>
          {progressLabel && <code>{progressLabel}</code>}
          {ready && (
            <p>
              Zamknij launcher, uruchom pobrany plik <strong>{download.fileName}</strong>, a stary `.exe` możesz usunąć po sprawdzeniu, że nowa wersja działa.
            </p>
          )}
          {download.expectedSha256 && <small>SHA256: {download.expectedSha256}</small>}
          <small>Jeśli Windows zablokuje plik: Właściwości pliku - Odblokuj.</small>
        </div>
      </div>
      <footer className="modal-actions">
        <button className="secondary-button" type="button" onClick={onClose}>
          Nie teraz
        </button>
        <button className="secondary-button" type="button" onClick={openRelease}>
          Otwórz release
        </button>
        {ready ? (
          <button className="play-button compact" type="button" onClick={showDownloadedUpdate}>
            Pokaż plik
          </button>
        ) : (
          <button className="play-button compact" type="button" onClick={downloadUpdate} disabled={busy || !canDownload}>
            {busy ? 'Pobieranie...' : canDownload ? 'Pobierz aktualizację' : 'Brak pliku .exe'}
          </button>
        )}
      </footer>
    </Modal>
  );
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function CrashModal({ crash, onClose }: { crash: CrashInfo; onClose: () => void }): JSX.Element {
  const [copied, setCopied] = useState(false);
  const logText = `Exit code: ${crash.exitCode}\n\n${crash.lines.join('\n')}`;

  const copyLog = async (): Promise<void> => {
    try {
      await navigator.clipboard.writeText(logText);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };

  return (
    <Modal title={`Crash gry · exit code ${crash.exitCode}`} onClose={onClose} wide>
      <p className="notice notice-warn">Wklej poniższy log do AI albo wyślij go adminowi.</p>
      <div className="crash-actions">
        <button type="button" onClick={copyLog}>{copied ? 'Skopiowano' : 'Skopiuj log'}</button>
      </div>
      <pre className="logs-view">{crash.lines.join('\n')}</pre>
    </Modal>
  );
}
