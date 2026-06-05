import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import axios from 'axios';

const execFileAsync = promisify(execFile);
const ORACLE_JAVA_21_WINDOWS_INSTALLER_URL = 'https://download.oracle.com/java/21/latest/jdk-21_windows-x64_bin.exe';
const ORACLE_JAVA_21_DOWNLOAD_PAGE_URL = 'https://www.oracle.com/pl/java/technologies/downloads/#jdk21-windows';
const ORACLE_JAVA_21_INSTALLER_NAME = 'jdk-21_windows-x64_bin.exe';

export type JavaCheckResult = {
  ok: boolean;
  path: string;
  version: string | null;
  message: string;
};

export async function checkJava(javaPath: string): Promise<JavaCheckResult> {
  const executable = javaPath.trim() || 'java';

  try {
    const result = await execFileAsync(executable, ['-version']);
    const output = `${result.stderr}\n${result.stdout}`;
    const version = parseJavaVersion(output);

    if (version === null) {
      return {
        ok: false,
        path: executable,
        version: null,
        message: 'Nie udało się odczytać wersji Java.'
      };
    }

    if (version < 21) {
      return {
        ok: false,
        path: executable,
        version: String(version),
        message: 'Wykryto starą Java. Do Minecraft 1.21.1 zalecana jest Java 21 lub nowsza.'
      };
    }

    return {
      ok: true,
      path: executable,
      version: String(version),
      message: version === 21 ? 'Java 21 gotowa.' : `Java ${version} wykryta. Zalecana dla Minecraft 1.21.1 jest Java 21.`
    };
  } catch {
    return {
      ok: false,
      path: executable,
      version: null,
      message: 'Nie znaleziono Java. Zainstaluj Java 21 albo wskaż java.exe w ustawieniach.'
    };
  }
}

export function parseJavaVersion(output: string): number | null {
  const match = output.match(/version "(?<version>\d+)(?:\.\d+)?(?:\.\d+)?/);
  const version = match?.groups?.version;
  return version ? Number(version) : null;
}

export function javaDownloadUrl(platform = process.platform): string {
  return platform === 'win32' ? ORACLE_JAVA_21_WINDOWS_INSTALLER_URL : ORACLE_JAVA_21_DOWNLOAD_PAGE_URL;
}

export function javaDownloadPageUrl(): string {
  return ORACLE_JAVA_21_DOWNLOAD_PAGE_URL;
}

export type JavaInstallerResult = {
  started: boolean;
  path: string | null;
  message: string;
};

export async function downloadJavaInstaller(launcherDataDir: string, platform = process.platform): Promise<JavaInstallerResult> {
  if (platform !== 'win32') {
    return {
      started: false,
      path: null,
      message: 'Automatyczne pobieranie instalatora Java jest przygotowane dla Windows. Otwórz stronę ręcznie.'
    };
  }

  const installersDir = path.join(launcherDataDir, 'installers');
  const destination = path.join(installersDir, ORACLE_JAVA_21_INSTALLER_NAME);
  await fs.mkdir(installersDir, { recursive: true });

  const response = await axios.get<ArrayBuffer>(ORACLE_JAVA_21_WINDOWS_INSTALLER_URL, {
    responseType: 'arraybuffer',
    timeout: 120000,
    validateStatus: (code) => code === 200
  });

  await fs.writeFile(destination, Buffer.from(response.data));

  return {
    started: false,
    path: destination,
    message: 'Pobrano instalator Java 21. Uruchom instalator, a potem kliknij „Sprawdź ponownie”.'
  };
}
