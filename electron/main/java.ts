import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

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
        message: 'Minecraft 1.21.1 wymaga Java 21 lub nowszej.'
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
