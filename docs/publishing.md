# Publishing

Releases are automated: when a push to `main` passes the whole CI matrix and the
version in `package.json` has no matching tag, CI creates that tag and starts the
release workflow. After npm publishes successfully, the workflow creates the matching
GitHub Release with generated notes. Only a green build reaches npm.

```bash
npm version 1.0.1 --no-git-tag-version
git add package.json package-lock.json CHANGELOG.md
git commit -m "chore(release): v1.0.1"
git push origin main
```

Tags can still be pushed manually; `release.yml` continues to accept `v*.*.*` tag
pushes and manual dispatches. The automatic path runs the test matrix once in
`ci.yml`; a manually pushed tag runs it from `release.yml` before publishing.
If the reusable CI job is skipped because the main CI already passed, `publish` is
explicitly enabled after a successful release validation so GitHub does not propagate
the skipped state.

## Authentication — trusted publishing (OIDC)

npm can trust a specific GitHub repository and workflow directly, so no long-lived
token exists anywhere. The workflow proves its identity with a short-lived OIDC token
that GitHub mints per run.

1. On npmjs.com open `@didactika/prisma-autoread` →
   **Settings → Trusted publishers**.
2. Add a **GitHub Actions** publisher:
   - Organization or user: `didactika`
   - Repository: `prisma-autoread`
   - Workflow filename: `release.yml`
   - Environment: `npm`
   - Allowed action: **npm publish**
3. Do not create an `NPM_TOKEN` secret. The workflow requests `id-token: write` and
   installs npm 11.5.1 or newer before publishing.

**2FA:** irrelevant here. There is no token to protect, and account 2FA never blocks a
trusted publish. This is the safest option: nothing to leak, nothing to rotate.

Trusted publishing requires Node 22.14 or newer and npm 11.5.1 or newer. The release
job enforces the npm requirement instead of relying on whichever npm version happens
to be bundled with the runner.

## What the workflow validates before publishing

`release.yml` refuses to publish unless every one of these passes:

| Check | Why |
|---|---|
| Full CI matrix (Node 20/22/24 × Express 4/5 × Prisma 5/6/7), either in the preceding main CI or for a manually pushed tag | Nothing ships untested or runs the matrix twice. |
| Tag matches `package.json` version | `v1.0.1` must be version `1.0.1`. |
| Version is valid semver | Catches typos like `1.0` or `v1.0.1`. |
| `CHANGELOG.md` has an entry for it | Every release is documented. |
| Version is not already on npm | npm rejects republishing; fail early and clearly. |
| `dist/index.js`, `.mjs` and `.d.ts` exist and are non-empty | The build really produced something. |
| The package imports as CJS **and** ESM | `createAutoRead` is reachable both ways. |
| The tarball has no `src/`, `tests/`, `docs/`, `examples/` or `AGENTS.md` | Only `dist` ships. |
| GitHub Release creation after npm publish | The tag, npm version and release notes stay aligned. |

It publishes with `--provenance`, so npm shows a verified link from the published
tarball back to the exact commit and workflow run that built it.

## Optional: a manual approval gate

The publish job declares `environment: npm`. Create that environment under
**Settings → Environments** and add yourself as a required reviewer if you want a human
click between "tests passed" and "published". Delete the line if you don't.

## Dry run

```
Actions → Release → Run workflow → dry_run: true
```

Runs every check and `npm publish --dry-run`, without publishing.

## Manual publish (fallback)

```bash
npm login                 # will ask for your OTP if 2FA is on
npm run build
npm publish --access public
```

`prepublishOnly` runs the unit and integration suites and the build first. The `--access
public` flag is required the first time a scoped package is published.

## Checklist for a release

- [ ] `CHANGELOG.md` has a section for the new version.
- [ ] `npm version <major|minor|patch> --no-git-tag-version` (never edit `package.json` by hand).
- [ ] Commit the version and changelog, then push to `main`.
- [ ] Watch the **Release** workflow; approve the `npm` environment if you enabled it.
- [ ] Verify the package page shows the new version and the provenance badge.
