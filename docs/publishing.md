# Publishing

Releases are automated: when a push to `main` passes the whole CI matrix and the
version in `package.json` has no matching tag, CI creates that tag and starts the
release workflow. Only a green build reaches npm.

```bash
npm version 1.0.1 --no-git-tag-version
git add package.json package-lock.json CHANGELOG.md
git commit -m "chore(release): v1.0.1"
git push origin main
```

Tags can still be pushed manually; `release.yml` continues to accept `v*.*.*` tag
pushes and manual dispatches. The automatic path runs the test matrix once in
`ci.yml`; a manually pushed tag runs it from `release.yml` before publishing.

## How to authenticate — two options

### Option A · Trusted publishing (OIDC) — recommended, no secret

npm can trust a specific GitHub repository and workflow directly, so no long-lived
token exists anywhere. The workflow proves its identity with a short-lived OIDC token
that GitHub mints per run.

1. On npmjs.com open the package → **Settings → Trusted publishers** (for a brand-new
   package, publish once manually first, then configure this).
2. Add a **GitHub Actions** publisher:
   - Organisation / repository: `didactika/prisma-autoread`
   - Workflow filename: `release.yml`
   - Environment: `npm` *(only if you keep the `environment: npm` line in the workflow)*
3. Remove the `NODE_AUTH_TOKEN` line from the publish step. Nothing else changes —
   the workflow already requests `permissions: id-token: write`, which is what OIDC needs.

**2FA:** irrelevant here. There is no token to protect, and account 2FA never blocks a
trusted publish. This is the safest option: nothing to leak, nothing to rotate.

### Option B · Granular access token

1. npmjs.com → your avatar → **Access Tokens** → **Generate New Token** →
   **Granular Access Token**.
2. Configure it:
   | Field | Value |
   |---|---|
   | Expiration | 90 days (set a reminder; max is 365) |
   | Packages and scopes | **Only select packages** → `@didactika/prisma-autoread` |
   | Permissions | **Read and write** |
   | Organisations | read-only, or none |
   | IP allowlist | leave empty (GitHub runners have no stable IPs) |
3. GitHub → repository → **Settings → Secrets and variables → Actions →
   New repository secret**:

   > **Name:** `NPM_TOKEN`
   > **Secret:** the token you just generated

That is the only secret the release workflow needs.

## Does 2FA get in the way?

**No — and you should turn it on.**

| Setting | Where | What to choose |
|---|---|---|
| Account 2FA | npm → Account → Two-Factor Authentication | **Authorization and writes** |
| Package publish requirement | package → Settings → Publishing access | **Two-factor authentication or automation/granular tokens** |

The reason it works: **granular** and **automation** tokens are designed for CI and are
exempt from the interactive OTP prompt. What 2FA protects is *you* — logging in and
changing settings from a browser.

What **does** break CI:

- A **classic “Publish” token** — it still asks for a one-time password, which no
  workflow can answer. Use a granular token (or Option A) instead.
- Setting the package's publishing access to **“Two-factor authentication only”** — that
  deliberately forbids tokens. Leave it on the option that also allows tokens.

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
