import { vi } from 'vitest';

vi.mock('electron', () => ({
  app: {
    getPath: vi.fn((name: string) => {
      if (name === 'userData') return '/tmp/dwargonmc-launcher-test/userData';
      if (name === 'temp') return '/tmp';
      return '/tmp/dwargonmc-launcher-test';
    }),
    getVersion: vi.fn(() => '3.0.0'),
    getName: vi.fn(() => 'DwargonMC Launcher'),
    isPackaged: false,
    whenReady: vi.fn(async () => undefined),
    quit: vi.fn()
  },
  shell: {
    openExternal: vi.fn(async () => undefined),
    openPath: vi.fn(async () => '')
  },
  BrowserWindow: vi.fn(() => ({
    loadURL: vi.fn(),
    loadFile: vi.fn(),
    on: vi.fn(),
    once: vi.fn(),
    webContents: {
      send: vi.fn(),
      openDevTools: vi.fn(),
      setWindowOpenHandler: vi.fn()
    },
    show: vi.fn(),
    close: vi.fn(),
    isDestroyed: vi.fn(() => false)
  })),
  ipcMain: {
    handle: vi.fn(),
    on: vi.fn(),
    removeHandler: vi.fn()
  },
  dialog: {
    showErrorBox: vi.fn(),
    showMessageBox: vi.fn(async () => ({ response: 0 }))
  },
  nativeImage: {
    createFromPath: vi.fn(() => ({
      isEmpty: vi.fn(() => true)
    }))
  },
  Tray: vi.fn(() => ({
    setToolTip: vi.fn(),
    setContextMenu: vi.fn(),
    destroy: vi.fn()
  })),
  Menu: {
    buildFromTemplate: vi.fn(() => ({}))
  }
}));
