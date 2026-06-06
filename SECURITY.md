# Security Policy

## Supported Scope

Security fixes are handled for the current `main` branch and the latest GitHub Release.

## Reporting

Do not open a public issue for sensitive vulnerabilities. Use GitHub private vulnerability reporting if it is enabled for the repository, or contact the repository owner directly.

Include:

- affected component: `launcher`, `sync-server`, `admin-site`, or CI/release;
- reproduction steps;
- impact;
- affected version/commit;
- logs or proof-of-concept details with secrets removed.

## Dependency Alerts

Dependabot is configured for:

- npm dependencies in `launcher/`;
- npm dependencies in `sync-server/`;
- GitHub Actions.

Known unresolved npm audit findings may remain from `minecraft-launcher-core -> request`. Those require replacing, patching, or forking the launcher core dependency rather than a normal package update.

## Secrets

Never commit:

- `ADMIN_TOKEN`;
- `SERVER_PASSWORD`;
- `VIRUSTOTAL_API_KEY`;
- Microsoft account tokens;
- local launcher profiles;
- Minecraft runtime folders;
- server pack files unless they are intentionally published.

## Runtime Security Notes

- Public sync-server endpoints are intended to be read-only.
- Admin write endpoints require a bearer token when `ADMIN_TOKEN` is set.
- The launcher should keep Electron preload APIs narrow and avoid exposing generic filesystem or shell access to the renderer.
- External links opened by the launcher should be limited to expected HTTP/HTTPS URLs.
