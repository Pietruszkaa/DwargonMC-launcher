# Contributing

## Workflow

Use pull requests into `main`. Direct pushes to `main` are blocked by the repository ruleset.

Recommended local check before opening a PR:

```bash
npm run launcher:typecheck
npm run launcher:test
npm run launcher:build
```

For sync-server-only changes:

```bash
npm --prefix sync-server install
npm --prefix sync-server run manifest
```

## Branches

Use short topic branch names, for example:

```text
security/electron-update
docs/readme-polish
feature/modrinth-cache
fix/sync-manifest
```

## Runtime Data

Do not commit generated/runtime data:

- `minecraft/`
- `launcher-data/`
- `launcher/release/`
- `sync-server/files/`
- `sync-server/backgrounds/`
- local `.env` files

Use `.env.example` for deploy configuration examples.

## Security

For security-sensitive changes, include:

- affected package/component;
- before/after audit result if applicable;
- verification commands;
- any remaining known risk.
