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

  if (!state) {
    return <div className="boot">DwargonMC Launcher</div>;
  }

  const syncPercent =
    state.sync.totalFiles > 0 ? Math.round((state.sync.completedFiles / state.sync.totalFiles) * 100) : 0;
  const isNickValid = /^[A-Za-z0-9_]{3,16}$/.test(nickname);
  const syncLabel = getSyncLabel(state.sync);

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
      {crash && <CrashModal crash={crash} onClose={() => setCrash(null)} />}
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
        <label className="field">
          <span>{copy.fov}: {draft.fov}</span>
          <input type="range" min={30} max={110} value={draft.fov} onChange={(event) => update('fov', Number(event.target.value))} />
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

function CrashModal({ crash, onClose }: { crash: CrashInfo; onClose: () => void }): JSX.Element {
  return (
    <Modal title={`Crash gry · exit code ${crash.exitCode}`} onClose={onClose} wide>
      <p className="notice notice-warn">Wklej poniższy log do AI albo wyślij go adminowi.</p>
      <pre className="logs-view">{crash.lines.join('\n')}</pre>
    </Modal>
  );
}
