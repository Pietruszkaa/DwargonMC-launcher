import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type UIEvent } from 'react';
import { Modal } from '~components/Modal';
import { getLauncherApi } from '@/lib/mockLauncher';
import { t } from '@/lib/i18n';
import type { Announcement, CrashInfo, InstalledModrinthProject, LauncherSettings, LauncherState, ModrinthAddonUpdate, ModrinthProject, ModrinthProjectType, ModrinthSort } from '@/types/launcher';

type Popup = 'settings' | 'files' | 'map' | 'logs' | 'modrinth' | null;

const api = getLauncherApi();
const MODRINTH_PAGE_SIZE = 20;

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

    return () => {
      offState();
      offCrash();
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

  const handlePlay = useCallback(async () => {
    await api.launchGame({ nickname });
  }, [nickname]);

  const handleSync = useCallback(async () => {
    await api.runSync();
  }, []);

  const handleWindowAction = useCallback((action: 'minimize' | 'maximize' | 'close') => {
    void api.windowAction(action);
  }, []);

  const handleCompleteSetup = useCallback(async () => {
    await api.completeSetup();
  }, []);

  if (!state) {
    return <div className="boot">DwargonMC Launcher</div>;
  }

  const syncPercent =
    state.sync.totalFiles > 0 ? Math.round((state.sync.completedFiles / state.sync.totalFiles) * 100) : 0;
  const isNickValid = /^[A-Za-z0-9_]{3,16}$/.test(nickname);
  const syncLabel = getSyncLabel(state.sync);
  const showUpdatePrompt = state.update.available && !updateDismissed;
  const showAccountPrompt = !accountPromptDismissed && state.profile.accountMode === 'offline' && !state.profile.nickname;
  const showJavaPrompt =
    !javaPromptDismissed &&
    !state.system.java.ok &&
    state.setup.complete &&
    !showUpdatePrompt &&
    !showAccountPrompt &&
    !popup &&
    !crash;

  if (state.setup.required && !state.setup.complete) {
    return <SetupWizard state={state} onComplete={handleCompleteSetup} onWindowAction={handleWindowAction} />;
  }

  return (
    <main className="shell">
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
        <div className="status-left">
          <span className={`server-state ${state.health.serverOnline ? 'server-state-online' : 'server-state-offline'}`}>
            <span aria-hidden="true" />
            {state.health.serverOnline ? 'Online' : 'Offline'}
          </span>
          <span className="status-divider">|</span>
          <label className="top-nick">
            <span>{state.profile.accountMode === 'microsoft' ? 'Microsoft:' : 'Nick:'}</span>
            <input
              value={nickname}
              onChange={(event) => setNickname(event.target.value)}
              placeholder="Wpisz nick..."
              disabled={state.profile.accountMode === 'microsoft'}
            />
          </label>
          <button className="top-sync" type="button" onClick={handleSync}>
            Sync
          </button>
          <div className="top-sync-progress" title={state.sync.message}>
            <span className={state.sync.verified ? 'notice-good' : 'notice-warn'}>{syncLabel}</span>
            <div className="progress-track top-progress-track" aria-label="Postęp synchronizacji">
              <span style={{ width: `${syncPercent}%` }} />
            </div>
          </div>
        </div>
        <div className="top-bar-right">
          <span className="version-right">v{state.update.currentVersion}</span>
          <div className="window-controls" aria-label="Window controls">
            <button className="win-btn" type="button" onClick={() => handleWindowAction('minimize')} aria-label="Minimalizuj">−</button>
            <button className="win-btn" type="button" onClick={() => handleWindowAction('maximize')} aria-label="Maksymalizuj">□</button>
            <button className="win-btn close" type="button" onClick={() => handleWindowAction('close')} aria-label="Zamknij">×</button>
          </div>
        </div>
      </div>

      <div className="launcher-container">
        <aside className="sidebar">
          <h1 className="logo">DwargonMC</h1>

          <nav className="main-menu" aria-label="Launcher actions">
            <button className="menu-btn active" type="button" disabled={!isNickValid || state.launch.running} onClick={handlePlay}>
              {copy.play}
            </button>
            <button className="menu-btn" type="button" onClick={() => setPopup('settings')}>
              {copy.settings}
            </button>
            <button className="menu-btn" type="button" onClick={() => setPopup('logs')}>
              {copy.logs}
            </button>
            <button className="menu-btn" type="button" onClick={() => setPopup('modrinth')}>
              Dodatki
            </button>
            <div className="spacer" />
            <PreflightPanel state={state} />
            <div className="sidebar-stats">
              <span>Ostatnia sesja</span>
              <strong>{formatLastSessionClose(state.profile.lastPlayedAt, timeTick)}</strong>
              <span>Łączny czas gry</span>
              <strong>{formatDuration(state.profile.totalPlaySeconds)}</strong>
            </div>
            <button className="icon-btn" type="button" onClick={() => void api.openMinecraftFolder()} title="Pliki gry">
              Pliki gry
            </button>
          </nav>
        </aside>

        <section className="content-area">
          <aside className="right-rail">
            {state.health.ok && <MapPanel backendUrl={state.settings.backendUrl} onToggle={() => setMapFullscreen(true)} />}

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

          <AnnouncementsPanel items={state.announcements.items} cached={state.announcements.cached} error={state.announcements.error} />

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

      {mapFullscreen && state.health.ok && (
        <div className="map-overlay">
          <MapPanel backendUrl={state.settings.backendUrl} fullscreen onToggle={() => setMapFullscreen(false)} />
        </div>
      )}

      {popup === 'settings' && <SettingsModal state={state} onClose={() => setPopup(null)} />}
      {popup === 'files' && <FilesModal state={state} onClose={() => setPopup(null)} />}
      {popup === 'map' && <MapModal backendUrl={state.settings.backendUrl} onClose={() => setPopup(null)} />}
      {popup === 'logs' && <LogsModal logs={state.logs} onClose={() => setPopup(null)} />}
      {popup === 'modrinth' && <ModrinthModal onClose={() => setPopup(null)} />}
      {showUpdatePrompt && (
        <UpdateModal state={state} onClose={() => setUpdateDismissed(true)} />
      )}
      {showAccountPrompt && (
        <AccountChoiceModal onClose={() => setAccountPromptDismissed(true)} />
      )}
      {showJavaPrompt && (
        <JavaHelpModal state={state} onClose={() => setJavaPromptDismissed(true)} />
      )}
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
  if (!items.length && !error) return null;

  return (
    <section className="announcements-panel">
      <header>
        <h2>Komunikaty</h2>
        {cached && <span>cache</span>}
      </header>
      {items.length ? (
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
      ) : (
        <p className="muted">{error}</p>
      )}
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
  const crowdedPreview = state.setup.crowdedEntries.slice(0, 6);

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
        <h1>DwargonMC Launcher</h1>
        {state.setup.reason === 'crowded-folder' ? (
          <p>
            Launcher wykryl, ze plik `.exe` lezy w folderze z innymi plikami. Dane gry zostana utworzone w osobnym
            folderze instancji, zeby nie zrobic balaganu obok launchera.
          </p>
        ) : (
          <p>Launcher przygotuje lokalna instancje Minecrafta, ustawienia i foldery robocze.</p>
        )}

        <div className="setup-paths">
          <div>
            <span>Folder bazowy</span>
            <code>{state.setup.baseInstallDir}</code>
          </div>
          <div>
            <span>Folder instancji</span>
            <code>{state.setup.activeInstallDir}</code>
          </div>
        </div>

        {crowdedPreview.length > 0 && (
          <div className="setup-detected">
            <span>Wykryte pliki/foldery obok launchera</span>
            <div>
              {crowdedPreview.map((entry) => (
                <code key={entry}>{entry}</code>
              ))}
              {state.setup.crowdedEntries.length > crowdedPreview.length && (
                <code>+{state.setup.crowdedEntries.length - crowdedPreview.length} wiecej</code>
              )}
            </div>
          </div>
        )}

        <footer className="setup-actions">
          <button className="play-button compact" type="button" onClick={finish} disabled={busy}>
            {busy ? 'Zapisywanie...' : 'Uzyj tego folderu'}
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
    <section className={`map-panel ${fullscreen ? 'map-panel-fullscreen' : ''}`} aria-label="Mapa serwera">
      <header>
        <span>Mapa</span>
        <button type="button" onClick={onToggle}>
          {fullscreen ? 'Zamknij' : 'Fullscreen'}
        </button>
      </header>
      <iframe title="Mapa DwargonMC" src={`${backendUrl}/map/`} />
    </section>
  );
}

function getSyncLabel(sync: LauncherState['sync']): string {
  if (sync.phase === 'downloading') return `Sync ${sync.completedFiles}/${sync.totalFiles}`;
  if (sync.phase === 'checking') return 'Sprawdzanie';
  if (sync.phase === 'complete') return 'Pliki OK';
  if (sync.phase === 'warning') return 'Sync serwer offline.';
  if (sync.phase === 'error') return 'Sync error';
  return 'Sync gotowy';
}

function PreflightPanel({ state }: { state: LauncherState }): JSX.Element {
  const items = [
    {
      label: 'Java',
      value: state.system.java.ok ? `OK ${state.system.java.version ?? ''}`.trim() : 'Problem',
      kind: state.system.java.ok ? 'good' : 'bad'
    },
    {
      label: 'RAM',
      value: `${state.settings.ramMb} MB`,
      kind: state.settings.ramMb <= state.system.maxRamMb ? 'good' : 'bad'
    },
    {
      label: 'Sync',
      value: state.sync.verified ? 'OK' : state.sync.phase === 'warning' ? 'Ostrzeżenie' : state.sync.phase,
      kind: state.sync.verified ? 'good' : 'warn'
    },
    {
      label: 'Serwer',
      value: state.health.serverOnline ? 'Online' : 'Offline',
      kind: state.health.serverOnline ? 'good' : 'warn'
    }
  ];

  return (
    <section className="preflight-panel" aria-label="Preflight">
      {items.map((item) => (
        <span className={`preflight-item preflight-${item.kind}`} key={item.label}>
          <small>{item.label}</small>
          <strong>{item.value}</strong>
        </span>
      ))}
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

function JavaHelpModal({ state, onClose }: { state: LauncherState; onClose: () => void }): JSX.Element {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(state.system.java.message);

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
    <Modal title="Java wymagana" onClose={onClose}>
      <div className="java-help">
        <p>{message}</p>
        <div className="java-help-actions">
          <button type="button" onClick={() => void api.openJavaDownload()} disabled={busy}>
            Pobierz Java 21
          </button>
          <button type="button" onClick={refresh} disabled={busy}>
            Sprawdź ponownie
          </button>
          <button type="button" onClick={chooseJava} disabled={busy}>
            Wskaż ręcznie
          </button>
        </div>
        <small>Po instalacji uruchom sprawdzenie ponownie. Launcher nie instaluje Javy po cichu i nie zmienia PATH.</small>
      </div>
    </Modal>
  );
}

function SettingsModal({ state, onClose }: { state: LauncherState; onClose: () => void }): JSX.Element {
  const [draft, setDraft] = useState<LauncherSettings>(state.settings);
  const [coreMessage, setCoreMessage] = useState('');
  const [accountMessage, setAccountMessage] = useState('');
  const [accountBusy, setAccountBusy] = useState(false);
  const copy = t(draft.language);

  const update = <K extends keyof LauncherSettings>(key: K, value: LauncherSettings[K]): void => {
    setDraft((current) => ({ ...current, [key]: value }));
  };

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
    await api.saveSettings(draft);
    onClose();
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
    <Modal title={copy.settings} onClose={onClose}>
      <div className="settings-grid">
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
        <label className="field">
          <span>{copy.backend}</span>
          <input value={draft.backendUrl} onChange={(event) => update('backendUrl', event.target.value)} />
        </label>
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
          <input type="checkbox" checked={draft.closeOnLaunch} onChange={(event) => update('closeOnLaunch', event.target.checked)} />
          <span>{copy.closeOnLaunch}</span>
        </label>
        <label className="field row-field">
          <input type="checkbox" checked={draft.autoConnect} onChange={(event) => update('autoConnect', event.target.checked)} />
          <span>{copy.autoConnect}</span>
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
            <button type="button" onClick={() => void api.openJavaDownload()}>Pobierz Java 21</button>
            <button type="button" onClick={refreshJava}>Sprawdź ponownie</button>
          </div>
          <small>{state.system.java.message}</small>
        </label>
        <label className="field">
          <span>Język / Language</span>
          <select value={draft.language} onChange={(event) => update('language', event.target.value === 'en' ? 'en' : 'pl')}>
            <option value="pl">Polski</option>
            <option value="en">English</option>
          </select>
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
        {coreMessage && <p className="notice notice-warn">{coreMessage}</p>}
      </div>
      <footer className="modal-actions">
        <button className="play-button compact" type="button" onClick={save}>{copy.save}</button>
      </footer>
    </Modal>
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
      <iframe className="map-frame" title="Mapa serwera" src={`${backendUrl}/map/`} />
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
      <pre className="logs-view" ref={logRef}>{logs.length ? logs.join('\n') : 'Brak logów JVM.'}</pre>
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
  const [message, setMessage] = useState('Wyszukuj resourcepacki, shaderpacki i opcjonalne client-side mody dla Minecraft 1.21.1.');
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

      const total = reset ? next.length : results.length + next.length;
      setMessage(total ? `Wczytano ${total} wynikow.` : 'Brak wynikow dla tych filtrow.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Nie udalo sie pobrac wynikow Modrinth.');
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
    void loadResults(true);
  }, [projectType, sort]);

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
      setMessage(error instanceof Error ? error.message : 'Nie udalo sie zainstalowac dodatku.');
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
      setMessage(error instanceof Error ? error.message : 'Nie udalo sie usunac dodatku.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title="Dodatki Modrinth" onClose={onClose} wide>
      <div className="modrinth-panel">
        <div className="modrinth-controls">
          <div className="modrinth-tabs" role="tablist" aria-label="Widok Modrinth">
            <button className={view === 'browse' ? 'active' : ''} type="button" onClick={() => setView('browse')}>
              Przeglądaj
            </button>
            <button className={view === 'installed' ? 'active' : ''} type="button" onClick={() => setView('installed')}>
              Zainstalowane ({installed.length})
            </button>
          </div>
          <label className="field">
            <span>Szukaj</span>
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Sodium, Complementary, Faithful..." />
          </label>
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

        <p className="notice notice-warn">{message}</p>

        {view === 'installed' ? (
          <section className="installed-addons">
            <div className="installed-groups">
              <InstalledAddonGroup title="Użytkownika" items={userInstalled} busy={busy} onRemove={removeInstalled} />
              <InstalledAddonGroup title="Serwerowe" items={serverInstalled} busy={busy} onRemove={removeInstalled} />
            </div>
          </section>
        ) : (
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
            {loadingMore && <p className="notice notice-warn">Wczytywanie kolejnych wynikow...</p>}
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

function UpdateModal({ state, onClose }: { state: LauncherState; onClose: () => void }): JSX.Element {
  const notes = state.update.notes.trim();

  const handleDownload = async (): Promise<void> => {
    await api.openUpdateDownload();
    onClose();
  };

  return (
    <Modal title="Dostępna aktualizacja" onClose={onClose}>
      <div className="update-panel">
        <p>
          Aktualna wersja: <strong>{state.update.currentVersion}</strong>
        </p>
        <p>
          Nowa wersja: <strong>{state.update.latestVersion}</strong>
        </p>
        {notes && <pre>{notes.slice(0, 900)}</pre>}
        {state.update.sha256Url && <small>SHA256 jest dostępne w plikach release.</small>}
      </div>
      <footer className="modal-actions">
        <button className="secondary-button" type="button" onClick={onClose}>
          Nie teraz
        </button>
        <button className="play-button compact" type="button" onClick={handleDownload}>
          Zaktualizuj
        </button>
      </footer>
    </Modal>
  );
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
