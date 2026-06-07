import launcherPackage from '../../package.json';

type ElectronApp = Pick<import('electron').App, 'isPackaged' | 'getVersion'>;

export function getElectronApp(): ElectronApp {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const electron = require('electron') as string | { app: ElectronApp };
  if (typeof electron === 'object' && electron.app) {
    return electron.app;
  }

  throw new Error('Electron runtime is not available.');
}

export function getLauncherVersion(): string {
  try {
    return getElectronApp().getVersion();
  } catch {
    return launcherPackage.version ?? '0.0.0';
  }
}
