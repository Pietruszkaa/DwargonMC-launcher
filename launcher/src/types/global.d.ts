import type { LauncherApi } from './launcher';

declare global {
  interface Window {
    launcher: LauncherApi;
  }
}

export {};
