import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { Modal } from '~components/Modal';
import { getLauncherApi } from '@/lib/mockLauncher';
import { t } from '@/lib/i18n';
import type { CrashInfo, LauncherSettings, LauncherState } from '@/types/launcher';

type Popup = 'settings' | 'files' | 'map' | 'logs' | null;

const api = getLauncherApi();

export function App(): JSX.Element {
  const [state, setState] = useState<LauncherState | null>(null);
  const [popup, setPopup] = useState<Popup>(null);
  const [crash, setCrash] = useState<CrashInfo | null>(null);
  const [nickname, setNickname] = useState('');
  const [logsExpanded, setLogsExpanded] = useState(false);
  const [mapFullscreen, setMapFullscreen] = useState(false);
  const [backgroundIndex, setBackgroundIndex] = useState(0);
  const [updateDismissed, setUpdateDismissed] = useState(false);

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
            <span>Nick:</span>
            <input value={nickname} onChange={(event) => setNickname(event.target.value)} placeholder="Wpisz nick..." />
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
          <span className="version-right">v1.1.2</span>
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
            <div className="spacer" />
            <button className="icon-btn" type="button" onClick={() => void api.openMinecraftFolder()} title="Folder z grą">
              Folder
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
                <p>Ostatnio grałeś: {formatLastPlayed(state.profile.lastPlayedAt)}</p>
                <p>Ostatnia sesja: {formatDuration(state.profile.lastSessionSeconds)}</p>
                <p>Łącznie: {formatDuration(state.profile.totalPlaySeconds)} · starty: {state.profile.launchCount}</p>
              </section>
            </div>
          </aside>

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
      {state.update.available && !updateDismissed && (
        <UpdateModal state={state} onClose={() => setUpdateDismissed(true)} />
      )}
      {crash && <CrashModal crash={crash} onClose={() => setCrash(null)} />}
    </main>
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

function formatLastPlayed(value: string | null): string {
  if (!value) return 'brak';

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'brak';

  return new Intl.DateTimeFormat('pl-PL', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  }).format(date);
}

function formatDuration(totalSeconds: number): string {
  const seconds = Math.max(0, Math.round(totalSeconds || 0));
  if (seconds === 0) return 'brak';

  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);

  if (hours > 0 && minutes > 0) return `${hours}h ${minutes}min`;
  if (hours > 0) return `${hours}h`;
  if (minutes > 0) return `${minutes}min`;
  return '<1min';
}

function SettingsModal({ state, onClose }: { state: LauncherState; onClose: () => void }): JSX.Element {
  const [draft, setDraft] = useState<LauncherSettings>(state.settings);
  const [coreMessage, setCoreMessage] = useState('');
  const copy = t(draft.language);

  const update = <K extends keyof LauncherSettings>(key: K, value: LauncherSettings[K]): void => {
    setDraft((current) => ({ ...current, [key]: value }));
  };

  const chooseJava = async (): Promise<void> => {
    const selected = await api.chooseJavaPath();
    if (selected) update('javaPath', selected);
  };

  const save = async (): Promise<void> => {
    await api.saveSettings(draft);
    onClose();
  };

  const handleReinstallCore = async (): Promise<void> => {
    const result = await api.reinstallCore();
    setCoreMessage(result.message);
  };

  return (
    <Modal title={copy.settings} onClose={onClose}>
      <div className="settings-grid">
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

  return (
    <Modal title={copy.files} onClose={onClose} wide>
      <div className="file-actions">
        <button type="button" onClick={() => void api.openMinecraftFolder()}>{copy.openFolder}</button>
        <button type="button" onClick={() => void api.runSync()}>{copy.resync}</button>
      </div>
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
    </Modal>
  );
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
  return (
    <Modal title={`Crash gry · exit code ${crash.exitCode}`} onClose={onClose} wide>
      <p className="notice notice-warn">Wklej poniższy log do AI albo wyślij go adminowi.</p>
      <pre className="logs-view">{crash.lines.join('\n')}</pre>
    </Modal>
  );
}
