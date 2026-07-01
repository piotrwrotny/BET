# M4L2 Territory Artifact — Git History (BET, branch `module-4`)

## 1. Scope & method

- **Branch:** `module-4`
- **Window:** full available history (2026-05-23 → 2026-07-01). A 12-month window would have hidden the project’s entire active phase, so the analysis uses all commits.
- **Total commits:** 134
- **Filtered commits used for file/directory stats:** 103
- **Noise filters applied:**
  - `package-lock.json`, any `*.lock`, `*.snap`, `*.min.js/css`
  - `.env`, `.env.*` files
  - `public/*` generated assets
  - `dist/*`
  - `.gitignore`, `.gitattributes`, `.10x-cli-manifest.json`
  - `supabase/seed.sql`
  - `.omp/*` local skill copies
  - `context/archive/*` archived change artifacts
  - `.vscode/*`, `.github/config-templates/*`
- **Mass-formatting commits excluded:**
  - `df48440` — "enforce LF line endings and fix global lint errors" (39 files, line-normalization + lint:fix)
  - `f2c8ffc` — "enforce LF line endings via .gitattributes"
  - Any commit whose subject contains "LF", "line endings", "lint errors", "global lint", "prettier", or "format"
  - Any commit touching >30 files
- **Author concentration:** 100% of commits by Piotr Wrotny.

## 2. Top active directories / modules

Source directories ranked by number of distinct filtered commits that touched them:

| Rank | Directory | Commits | What lives there |
|------|-----------|---------|------------------|
| 1 | `src/components/admin` | 11 | Admin UI components (UsersTable, ExerciseForm, MarkdownEditor, DeleteButton) |
| 2 | `src/lib` | 10 | Shared libraries and service layer |
| 3 | `src/pages/lessons` | 8 | Student lesson SSR routes |
| 3 | `src/pages/api/admin` | 8 | Admin REST API routes |
| 3 | `src/pages/api/admin/users/[id]` | 8 | Grant/revoke user book access endpoints |
| 3 | `src/pages/admin` | 8 | Admin Astro pages |
| 7 | `src/lib/services` | 7 | Domain services (user-admin, exercise verification) |
| 8 | `tests/e2e` | 7 | Playwright end-to-end specs |
| 9 | `src/pages/api/exercises` | 4 | Exercise verification API |
| 9 | `src/components/lesson` | 4 | Student lesson interactive components |
| 9 | `src/layouts` | 4 | Astro layouts (AdminLayout) |

Interpretation: the highest heat is in the **admin user/access management** cluster (`components/admin`, `pages/admin`, `pages/api/admin`, `lib/services`) and the **student lesson** cluster (`pages/lessons`, `components/lesson`). The app has evolved as two-sided platform: admin content/user management and student lesson consumption.

## 3. Top active files

### Source files (filtered)

| Rank | File | Commits | Notes |
|------|------|---------|-------|
| 1 | `src/pages/lessons/[id].astro` | 8 | Core student lesson page |
| 1 | `src/pages/api/admin/users.ts` | 8 | Admin user list API |
| 1 | `src/pages/api/admin/users/[id]/grant.ts` | 8 | Grant book access |
| 1 | `src/pages/api/admin/users/[id]/revoke.ts` | 8 | Revoke book access |
| 5 | `src/lib/services/user-admin.ts` | 7 | User admin domain service |
| 5 | `src/pages/admin/users.astro` | 7 | Admin user management UI |
| 7 | `src/components/admin/UsersTable.tsx` | 5 | User table React island |
| 8 | `src/pages/dashboard.astro` | 5 | Student dashboard |
| 9 | `src/components/lesson/LessonInteractive.tsx` | 4 | Lesson exercise container |
| 10 | `src/middleware.ts` | 4 | Auth/role guards |
| 10 | `src/layouts/AdminLayout.astro` | 4 | Admin shell |
| 10 | `src/pages/api/exercises/verify.ts` | 4 | Exercise answer verification |

### Context / project files (filtered)

| File | Commits | Notes |
|------|---------|-------|
| `context/changes/testing-unit-contract-runner/plan.md` | 11 | Most recent test-plan rollout |
| `context/changes/cleanup-lint-warnings/plan.md` | 6 | Lint-hygiene cleanup plan |
| `context/foundation/roadmap.md` | 6 | Living roadmap |
| `context/foundation/test-plan.md` | 5 | Phased test strategy |

## 4. Monthly trend summary

Because the repo is only ~5 weeks old, trends are shown per month rather than quarterly.

| Month | Commits (all) | Dominant themes |
|-------|---------------|-----------------|
| 2026-05 | 6 | Repo bootstrap, README, tsconfig, early tooling setup |
| 2026-06 | 123 | Main build phase: data foundation, first lesson E2E, admin CRUDs, user/access management, closed exercise types, student profile, sentence-transformation/open-ended, test plan + unit/contract runner, lint cleanup |
| 2026-07 | 5 | Context hardening (M4L1), archive moves, MVP check prompt, sync from `origin/main` |

### Source-area heat within 2026-06

| Area | Commits touching it | Description |
|------|---------------------|-------------|
| Admin | 21 | Users, books, chapters, lessons, exercises CRUD + access control |
| Lessons / student | 17 | Lesson page, dashboard, profile, completion |
| Exercises / verify | 11 | MC, matching, fill-in-blank, true/false, sentence transformation, open-ended |
| Infra / middleware | 4 | Auth guards, middleware, eslint config |

The entire product was built in a compressed ~1-week burst at the end of June; July commits are almost exclusively documentation, archive bookkeeping, and context scaffolding.

## 5. Co-change clusters

Clusters were computed from filtered commits that touched more than one source directory.

### Strongest directory-level co-change pairs

| Co-changes | Directories |
|------------|-------------|
| 6 | `src/lib/services` ↔ `src/pages/api/admin` |
| 6 | `src/pages/api/admin` ↔ `src/pages/api/admin/users/[id]` |
| 5 | `src/pages/admin` ↔ `src/pages/api/admin` |
| 4 | `src/lib/services` ↔ `src/pages/api/admin/users/[id]` |
| 4 | `src/components/admin` ↔ `src/pages/admin` |
| 4 | `src/components/admin` ↔ `src/pages/api/admin/users/[id]` |
| 4 | `src/lib/services` ↔ `src/pages/admin` |
| 3 | `src/components/lesson` ↔ `src/pages/lessons` |
| 3 | `src/components/admin` ↔ `src/pages/admin/exercises/[id]` |
| 3 | `src/components/admin` ↔ `src/pages/api/admin/exercises` |
| 3 | `src/pages/admin/exercises/[id]` ↔ `src/pages/api/admin/exercises` |

### Strongest file-level co-change pairs

| Co-changes | Files |
|------------|-------|
| 8 | `grant.ts` ↔ `revoke.ts` |
| 6 | `user-admin.ts` ↔ `users.ts` |
| 6 | `users.ts` ↔ `grant.ts` |
| 6 | `users.ts` ↔ `revoke.ts` |
| 5 | `users.astro` ↔ `users.ts` |
| 4 | `user-admin.ts` ↔ `grant.ts` / `revoke.ts` / `users.astro` |
| 3 | `LessonInteractive.tsx` ↔ `pages/lessons/[id].astro` |
| 3 | `admin/exercises/[id]/edit.astro` ↔ `api/admin/exercises/[id].ts` / `api/admin/exercises/index.ts` |

Interpretation: **admin user book access** is the most tightly coupled cluster — service, API, and page evolve together. **Exercise admin** also shows tight front-end/back-end coupling (edit page + API). These are natural coupling points but also change-propagation risks.

## 6. Cross-cutting files

Files that repeatedly appear alongside commits touching multiple source directories:

| File | Why it is cross-cutting |
|------|-------------------------|
| `src/middleware.ts` | Role/auth guards; every route change that needs protection co-changes it |
| `src/lib/utils.ts` | Shared utilities (`cn`, `uuidSchema`, decode helpers) used by admin, lesson, and API code |
| `src/lib/supabase.ts` | Single database client imported across all server code |
| `src/lib/exercise-schemas.ts` | Zod schemas shared by admin exercise forms and student verification |
| `src/pages/api/exercises/verify.ts` | Central verification endpoint used by all exercise types |
| `src/pages/api/lessons/[id]/complete.ts` | Lesson completion touches progress, auth, and lesson state |
| `package.json` | Dependency changes span every feature area |
| `eslint.config.js` | Lint rules affect all source files |
| `AGENTS.md` / `README.md` | Living conventions docs touched by many context commits |

## 7. Deleted / moved files that were once hot

### True deletions

| File | Last hot activity | Deletion commit | Reason |
|------|-------------------|-----------------|--------|
| `CLAUDE.md` | 2 commits (early setup) | `b08ae37` "jednak copilot" | Replaced by `.github/copilot-instructions.md` when switching AI assistant |
| `src/test-eslint.tsx` | 2 commits | `df48440` "enforce LF…fix global lint errors" | Obsolete test file removed during lint cleanup |

### Deleted then restored

| File | Deletion commit | Restoration commit | Notes |
|------|-----------------|--------------------|-------|
| `src/pages/admin/users.astro` | `e2884e9` "fix(admin): impl-review fixes for S-02" | `f2d8e3c` "feat(admin): restore user management panel" | Extracted out of admin-content-creation scope, then rebuilt as separate change |
| `src/pages/api/admin/users.ts` | `e2884e9` | `f2d8e3c` | Same as above |
| `src/pages/api/admin/users/[id]/grant.ts` | `e2884e9` | `f2d8e3c` | Same as above |
| `src/pages/api/admin/users/[id]/revoke.ts` | `e2884e9` | `f2d8e3c` | Same as above |
| `src/components/admin/UsersTable.tsx` | `e2884e9` | `f2d8e3c` | Same as above |
| `src/lib/services/user-admin.ts` | `e2884e9` | `f2d8e3c` | Same as above |

The deletion/restoration of the whole admin-user management module in commits `e2884e9` → `f2d8e3c` is the most significant structural churn in the history. It suggests an explicit scope split rather than a discard.

### Bulk moves (archival)

- 46 `context/changes/*` artifacts were renamed into `context/archive/YYYY-MM-DD-*` between 2026-06-25 and 2026-07-01.
- `.github/workflows/ci.yml` → `.omp/workflows/ci.yml` (tooling migration).
- These are excluded from activity counts but documented here because they explain why some paths appear with low counts while their archived counterparts exist.

## 8. Initial risk hypotheses

Based on high activity + contact with runtime/auth/data/build surfaces:

1. **Admin user/access management is the hottest, highest-risk surface.**
   - Files `user-admin.ts`, `users.ts`, `grant.ts`, `revoke.ts`, `users.astro`, `UsersTable.tsx` are all in the top 10 and co-change tightly.
   - It touches **auth roles**, **data authorization** (book grants), and **admin UI**.
   - The module was deleted and rebuilt once; verify the rebuild matches the original security intent.

2. **Exercise verification is a correctness chokepoint.**
   - `src/pages/api/exercises/verify.ts` and `src/lib/verify-exercise.ts` (extracted in the testing-unit-contract-runner change) sit between admin-authored answer keys and student progress.
   - A bug here corrupts lesson completion and student analytics.

3. **`src/middleware.ts` is a security chokepoint.**
   - Appears in auth/CSRF/role-guard changes across admin and student routes.
   - Small changes propagate to all protected pages; it should be treated as a high-coupling file.

4. **Lint/tooling config changes are broad but under-reported in source heat.**
   - `eslint.config.js`, `package.json`, `.gitattributes` changes affect build and CI health.
   - The mass-formatting commit `df48440` touched 39 files; similar future cleanups risk masking real diffs.

5. **Rapid June delivery compressed multiple slices into the same week.**
   - 123 of 134 commits are in June, many on a single day.
   - Areas built in parallel (admin CRUD, student profile, closed exercises, sentence transformation) may share implicit assumptions that a static map should surface.

---

## Appendix — exact commands used

All analysis was run against the `module-4` branch at repo root.

```bash
# branch / root verification
git branch --show-current
git rev-parse --show-toplevel

# full commit list with dates and subjects
git log --pretty='format:%H|%ad|%s' --date=short

# commit list with files (used for file/directory stats)
git log --pretty='format:COMMIT|%H|%ad|%s' --date=short --name-only > /tmp/gitlog.txt

# rename / delete detection
git log --pretty='format:%H|%ad|%s' --date=short --name-status > /tmp/gitlog-status.txt

# deleted files summary
git log --diff-filter=D --summary

# deleted files filtered to specific paths
git log --diff-filter=D --summary -- src/pages/api/admin/users.ts

# commit stat for a specific mass-formatting commit
git show --stat df48440

# file-specific history
git log --oneline -- src/pages/api/admin/users.ts
```

The Python aggregation applied the noise and mass-formatting filters described in §1 to `/tmp/gitlog.txt`.
