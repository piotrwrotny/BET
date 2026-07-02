# @piotrwrotny/ai-toolkit

Team AI artifacts distributed through GitHub Packages.

## What it installs

- A managed block of team rules appended to `AGENTS.md` in the consumer repo.
- Optional editor/tool configuration templates (only when the file does not already exist).
- A manifest at `.claude/.ai-toolkit-manifest.json` tracking installed files.

## Install in a consumer repo

1. Add the GitHub Packages registry mapping to `.npmrc` (commit this line):

   ```
   @piotrwrotny:registry=https://npm.pkg.github.com
   ```

2. Authenticate locally:

   ```bash
   npm login --scope=@piotrwrotny --registry=https://npm.pkg.github.com
   ```

   Or set a `GH_PKG_TOKEN` environment variable with `read:packages` scope.

3. Run the installer:

   ```bash
   npx @piotrwrotny/ai-toolkit install
   ```

The installer is idempotent: running it again updates the managed block instead of duplicating it.

## Uninstall

```bash
npx @piotrwrotny/ai-toolkit uninstall
```

This removes the managed block from `AGENTS.md`, deletes installed templates, and removes the manifest.

## Publish a new version

1. Bump `version` in `package.json`.
2. Commit and push.
3. Create and push a semver tag:

   ```bash
   git tag v0.2.0
   git push origin v0.2.0
   ```

GitHub Actions publishes the package to GitHub Packages.

## Consumer CI authentication

For external CI systems, set `GH_PKG_TOKEN` with `read:packages` and add this preinstall helper to `package.json`:

```json
{
  "scripts": {
    "preinstall": "[ -n \"$GH_PKG_TOKEN\" ] && echo '//npm.pkg.github.com/:_authToken=${GH_PKG_TOKEN}' >> .npmrc || true"
  }
}
```

Never commit an `_authToken` line to the repository.
