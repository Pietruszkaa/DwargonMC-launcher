import brandingJson from './branding.json';

type BrandingConfig = {
  id: string;
  serverName: string;
  launcherName: string;
  backendUrl: string;
  serverAddress: string;
  mapPath: string;
  colors: {
    primary: string;
    primaryHover: string;
  };
  links: {
    releases: string | null;
    discord: string | null;
  };
};

const config = brandingJson as BrandingConfig;

export const branding = {
  id: import.meta.env.VITE_DWARGON_BRAND_ID || config.id,
  serverName: import.meta.env.VITE_DWARGON_SERVER_NAME || config.serverName,
  launcherName: import.meta.env.VITE_DWARGON_LAUNCHER_NAME || config.launcherName,
  backendUrl: import.meta.env.VITE_DWARGON_BACKEND_URL || config.backendUrl,
  serverAddress: import.meta.env.VITE_DWARGON_SERVER_ADDRESS || config.serverAddress,
  mapPath: config.mapPath,
  releasesUrl: config.links.releases,
  discordUrl: config.links.discord,
  primaryColor: import.meta.env.VITE_DWARGON_PRIMARY_COLOR || config.colors.primary,
  primaryHoverColor: import.meta.env.VITE_DWARGON_PRIMARY_HOVER_COLOR || config.colors.primaryHover
};

export const brandingStyle = {
  '--primary': branding.primaryColor,
  '--primary-hover': branding.primaryHoverColor
};
