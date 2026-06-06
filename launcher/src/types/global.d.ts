import type { LauncherApi } from './launcher';

declare global {
  interface ImportMetaEnv {
    readonly VITE_DWARGON_BACKEND_URL?: string;
    readonly VITE_DWARGON_BRAND_ID?: string;
    readonly VITE_DWARGON_LAUNCHER_NAME?: string;
    readonly VITE_DWARGON_PRIMARY_COLOR?: string;
    readonly VITE_DWARGON_PRIMARY_HOVER_COLOR?: string;
    readonly VITE_DWARGON_SERVER_ADDRESS?: string;
    readonly VITE_DWARGON_SERVER_NAME?: string;
  }

  interface ImportMeta {
    readonly env: ImportMetaEnv;
  }

  interface Window {
    launcher: LauncherApi;
  }
}

export {};
