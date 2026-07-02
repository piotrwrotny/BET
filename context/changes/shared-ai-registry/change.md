---
change_id: shared-ai-registry
title: Shared AI Registry — team AI toolkit package
status: planned
created: 2026-07-02
updated: 2026-07-02
archived_at: null
---

## Notes

Built and published a minimal team AI toolkit package `@piotrwrotny/ai-toolkit` to GitHub Packages.
Package distributes team rules and editor/tool configs into the BET repo via an idempotent installer.
Must satisfy 10xChampion criteria: source-of-truth repo, package definition, published versions, and working install in a consumer repo.

## Evidence

- Package source: `packages/ai-toolkit/`
- Publish workflow: `.github/workflows/publish-ai-toolkit.yml`
- Successful publish run: https://github.com/piotrwrotny/BET/actions/runs/28576459187
- GitHub Packages listing: https://github.com/users/piotrwrotny/packages/npm/package/ai-toolkit
- Published versions: `0.1.0`, `0.1.1`
- Consumer install verified in BET: `npx @piotrwrotny/ai-toolkit@0.1.1 install` created the managed rules block and manifest; `uninstall` cleaned them up.
