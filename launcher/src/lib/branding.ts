export const branding = {
  serverName: import.meta.env.VITE_DWARGON_SERVER_NAME || 'DwargonMC',
  launcherName: import.meta.env.VITE_DWARGON_LAUNCHER_NAME || 'DwargonMC Launcher',
  primaryColor: import.meta.env.VITE_DWARGON_PRIMARY_COLOR || '#4caf50',
  primaryHoverColor: import.meta.env.VITE_DWARGON_PRIMARY_HOVER_COLOR || '#45a049'
};

export const brandingStyle = {
  '--primary': branding.primaryColor,
  '--primary-hover': branding.primaryHoverColor
};
