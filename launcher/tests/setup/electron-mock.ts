import { vi } from 'vitest';

vi.mock('electron', () => ({
  app: {
    isPackaged: false,
    getVersion: () => '3.0.0',
    getPath: (name: string) => `/tmp/dwargon-launcher-test/${name}`,
    getName: () => 'Dwargon Launcher',
    getAppPath: () => '/tmp/dwargon-launcher-test'
  },
  safeStorage: {
    isEncryptionAvailable: () => false,
    encryptString: (value: string) => Buffer.from(value, 'utf8'),
    decryptString: (value: Buffer) => value.toString('utf8')
  }
}));
