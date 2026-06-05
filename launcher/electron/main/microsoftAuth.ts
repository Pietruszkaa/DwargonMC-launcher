export type MclcAuthorization = {
  access_token: string;
  client_token?: string;
  uuid: string;
  name?: string;
  user_properties?: unknown;
  meta?: {
    refresh?: string;
    exp?: number;
    type: 'mojang' | 'msa' | 'legacy';
    xuid?: string;
    demo?: boolean;
  };
};

export type MicrosoftAuthProfile = {
  name: string;
  uuid: string;
  refreshToken: string;
  xuid: string | null;
  expiresAt: number | null;
};

type AuthEvents = {
  onLog(line: string): void;
};

type MsmcMinecraft = {
  mclc(refreshable?: boolean): MclcAuthorization;
};

type MsmcXbox = {
  getMinecraft(): Promise<MsmcMinecraft>;
  save(): string;
};

type MsmcAuth = {
  on(event: 'load', listener: (asset: string, message: string) => void): void;
  launch(framework: 'electron', windowProperties?: Record<string, unknown>): Promise<MsmcXbox>;
  refresh(refreshToken: string): Promise<MsmcXbox>;
};

type MsmcModule = {
  Auth: new (prompt: 'select_account' | 'none') => MsmcAuth;
};

const { Auth } = require('msmc') as MsmcModule;

export async function loginMicrosoft(events: AuthEvents): Promise<{
  authorization: MclcAuthorization;
  profile: MicrosoftAuthProfile;
}> {
  const auth = createAuth(events, 'select_account');
  const xbox = await auth.launch('electron', {
    width: 520,
    height: 720,
    resizable: false
  });

  return minecraftProfileFromXbox(xbox);
}

export async function refreshMicrosoft(
  refreshToken: string,
  events: AuthEvents
): Promise<{
  authorization: MclcAuthorization;
  profile: MicrosoftAuthProfile;
}> {
  const auth = createAuth(events, 'none');
  const xbox = await auth.refresh(refreshToken);
  return minecraftProfileFromXbox(xbox);
}

function createAuth(events: AuthEvents, prompt: 'select_account' | 'none'): MsmcAuth {
  const auth = new Auth(prompt);
  auth.on('load', (_asset, message) => {
    if (message) events.onLog(`Microsoft auth: ${message}`);
  });
  return auth;
}

async function minecraftProfileFromXbox(xbox: MsmcXbox): Promise<{
  authorization: MclcAuthorization;
  profile: MicrosoftAuthProfile;
}> {
  const minecraft = await xbox.getMinecraft();
  const authorization = minecraft.mclc(true);
  const refreshToken = authorization.meta?.refresh ?? xbox.save();

  if (!authorization.name || !authorization.uuid || !refreshToken) {
    throw new Error('Microsoft login nie zwrócił kompletnego profilu Minecraft.');
  }

  return {
    authorization,
    profile: {
      name: authorization.name,
      uuid: authorization.uuid,
      refreshToken,
      xuid: authorization.meta?.xuid ?? null,
      expiresAt: authorization.meta?.exp ?? null
    }
  };
}
