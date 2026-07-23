# Contributing

Thanks for helping improve **prisma-autoread**.

## Getting started

```bash
npm install
npx prisma generate      # required: the engine reads Prisma's DMMF
npm run build
```

## Tests

```bash
npm run test:unit          # pure logic, mocked DMMF
npm run test:integration   # full pipeline via supertest + mocked DMMF
npm run test:e2e           # against a real SQLite database (prisma db push + seed)
npm test                   # everything
```

- Unit and integration tests mock `@prisma/client`, so they don't need a database.
- e2e tests generate the client and reset a local SQLite `test.db` (removed on teardown).

## Architecture

Read [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) first. The engine is layered:

```
Transport → InputAdapter → QuerySpec → QueryBuilder → Executor → OutputAdapter
```

Guidelines:

- **Don't touch `src/legacy/`** — it is frozen for backward compatibility.
- Add a new **input protocol** or **output format** by implementing the adapter
  interface and registering it; the core stays untouched (open/closed).
- Keep every change covered by a test at the appropriate level.
- Match the surrounding code style; run `npm run build` (it type-checks via `tsup`/DTS).

## Pull requests

1. Branch from `main`.
2. Add tests and update `CHANGELOG.md` under an *Unreleased* heading.
3. Ensure `npm test` and `npm run build` pass.
4. Open the PR with a clear description of the change and its motivation.

## Releases

Versioning follows [SemVer](https://semver.org/). The public surface is
`createAutoRead`, its options, the exported types, and the client-facing query
grammar. Breaking any of those is a **major** bump.

Releases are automated — `npm version <patch|minor|major>` then
`git push --follow-tags`. See [`docs/publishing.md`](docs/publishing.md) for the
authentication setup and the checks the release workflow enforces.
