---
change_id: async-pr-validation
title: Async PR validation for ai-toolkit package
status: implemented
created: 2026-07-02
updated: 2026-07-02
archived_at: null
---

## Notes

Added a dedicated GitHub Actions workflow that validates the @piotrwrotny/ai-toolkit package on PRs and pushes. Removed the PR trigger from the publish workflow. This was the M5L5 practical exercise: delegate a bounded task with clear scope, no secrets, and explicit review criteria.

## Evidence

- New workflow: `.github/workflows/pr-validate-ai-toolkit.yml`
- Successful run: https://github.com/piotrwrotny/BET/actions/runs/28579654233
- Publish workflow no longer triggers on PRs.
