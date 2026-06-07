let keytarModule: typeof import('keytar') | null = null;

const KEYTAR_SERVICE = 'DwargonMC-Launcher';
const MICROSOFT_TOKEN_PREFIX = 'microsoft-refresh-token';

async function getKeytar(): Promise<typeof import('keytar')> {
  if (keytarModule) return keytarModule;

  try {
    keytarModule = await import('keytar');
    return keytarModule;
  } catch (error) {
    throw new Error(
      error instanceof Error
        ? `Nie można użyć systemowego magazynu poświadczeń: ${error.message}`
        : 'Nie można użyć systemowego magazynu poświadczeń.'
    );
  }
}

function microsoftTokenAccount(uuid: string): string {
  const normalizedUuid = String(uuid).trim();

  if (!normalizedUuid) {
    throw new Error('Nie można zapisać tokena Microsoft bez UUID profilu.');
  }

  return `${MICROSOFT_TOKEN_PREFIX}:${normalizedUuid}`;
}

export async function saveMicrosoftRefreshToken(uuid: string, refreshToken: string): Promise<void> {
  const token = String(refreshToken).trim();

  if (!token) {
    throw new Error('Microsoft login nie zwrócił refresh tokena.');
  }

  const keytar = await getKeytar();
  await keytar.setPassword(KEYTAR_SERVICE, microsoftTokenAccount(uuid), token);
}

export async function getMicrosoftRefreshToken(uuid: string): Promise<string | null> {
  const keytar = await getKeytar();
  return keytar.getPassword(KEYTAR_SERVICE, microsoftTokenAccount(uuid));
}

export async function deleteMicrosoftRefreshToken(uuid: string): Promise<void> {
  const keytar = await getKeytar();
  await keytar.deletePassword(KEYTAR_SERVICE, microsoftTokenAccount(uuid));
}