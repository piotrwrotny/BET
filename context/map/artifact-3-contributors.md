# M4L2 Contributors Artifact — BET, branch `module-4`

## 1. Scope & method

- **Branch:** `module-4`
- **Analysis window:** full available history (2026-05-23 → 2026-07-01). The repository is younger than 12 months, so the full history is used instead of a 12-month window.
- **Total commits:** 134
- **Contributor count:** 1 human author; 0 bots or CI users detected.
- **Noise handling:**
  - Mass-formatting commit `df48440` ("enforce LF line endings and fix global lint errors") is noted where it touches an area but excluded from thematic activity counts.
  - Initial bootstrap commit `86f87c88` ("10x do m1l4") is excluded from area-specific thematic activity.
  - No lockfiles, generated assets, or archive bookkeeping commits are used for area-level contributor interpretation.

## 2. Overall contributor concentration

| Contributor | Commits | Share |
|-------------|---------|-------|
| Piotr Wrotny (`Piotr.Wrotny@asseco.pl`) | 134 | 100% |

**Knowledge concentration:** Extremely concentrated. All domain knowledge is tacit and held by a single author. There is no secondary maintainer for any active area.

## 3. Contributors per active area

The five areas below are derived from the hottest surfaces identified in `artifact-1-territory.md`: admin user/access management, student lesson consumption, exercise verification, admin exercise content CRUD, and auth/middleware/role guards.

---

### 3.1 Admin user & book-access management

**Why it matters:** This is the hottest surface in the repo. It covers user listing, granting/revoking book access, role and CSRF guards, and the admin UI table. Files in this cluster co-change tightly (`user-admin.ts`, `users.ts`, `grant.ts`, `revoke.ts`, `users.astro`, `UsersTable.tsx`).

**Key contributors:**
- Piotr Wrotny — 14 commits touching this area (13 thematic, excluding the mass-formatting commit).

**Thematic commit activity for Piotr Wrotny:**
- Backend service & pagination: `88208fdb`, `735c4e83`, `86717518` — student scope filtering, chunking, pagination cap, and error masking.
- Frontend build-out: `46de5b53`, `2fadf07a` — `UsersTable.tsx` island and `admin/users.astro` page.
- Scope split & restore: `5c84abb6`, `f2d8e3c4` — extracted user management from S-02, then restored as a standalone module.
- Security fixes: `21f4f63c` (accept `Sec-Fetch-Site: same-origin` in CSRF guard), `19074971` (impl-review findings for user management).
- E2E coverage: `8b2a68df` — admin user management Playwright tests.
- Logging/infra: `ffb58333` — introduced server logger and relaxed `no-console` for server code.

**Knowledge concentration:** Concentrated. The deletion/restoration cycle (`e2884e9` → `f2d8e3c`) means the post-restore commits (`f2d8e3c` and later) are the authoritative version of this module.

**Commits/PRs to read before changing this area:**
- `f2d8e3c` — restore user management panel
- `19074971` — impl-review findings for user management
- `21f4f63c` — CSRF guard relaxation
- `8b2a68df` — E2E tests for admin user management
- `ffb58333` — server logger introduction

---

### 3.2 Student lesson consumption

**Why it matters:** The core student-facing flow: SSR lesson page, interactive exercise island, completion gating, and the dashboard. Changes here directly affect learning progress and UX.

**Key contributors:**
- Piotr Wrotny — 19 commits touching this area (17 thematic, excluding bootstrap and mass-formatting).

**Thematic commit activity for Piotr Wrotny:**
- First lesson page & dashboard: `8f046596`, `01a6f6e0` — route, markdown render, exercises list, dashboard rework.
- MC island + verify/complete API: `47f97ddb`, `cf90a57c` — first exercise island and review mode.
- Sequential navigation & chapter completion: `62f650ea`, `8ad055c5`, `5d9f3568` — lesson nav, chapter badges, dashboard chapter progress.
- Student renderers & completion gating: `abb45e62`, `a3706a34` — renderers and wiring completion button to solved-exercise state.
- Open-ended / sentence transformation: `0aac517f`, `e0d193bb`, `83e06587` — data schema, student components, `set:html` safety note.
- Completion error handling: `9dd481c5` — stop swallowing completion errors + E2E regression test.

**Knowledge concentration:** Concentrated. The area was built in rapid parallel slices, so the lesson page, components, and completion API share implicit assumptions.

**Commits/PRs to read before changing this area:**
- `9dd481c5` — completion error fix + E2E regression
- `a3706a34` — completion button wiring
- `e0d193bb` — sentence transformation / open-ended student components
- `47f97ddb` — first verify/complete API
- `8f046596` — initial lesson page SSR

---

### 3.3 Exercise verification engine

**Why it matters:** The correctness chokepoint between admin-authored answer keys and student progress. A bug here corrupts lesson completion and analytics.

**Key contributors:**
- Piotr Wrotny — 4 commits.

**Thematic commit activity for Piotr Wrotny:**
- Initial verify API: `47f97ddb` — MC exercise island + verify + complete API.
- Matching verification: `a9a8dbc` — Phase 3 matching verification and review answers.
- Refactor into service: `1e33b0c` — extracted verification logic from API into `src/lib/verify-exercise.ts`.
- Impl-review cleanup: `e2884e9b` — cross-cutting S-02 fixes touching this area.

**Knowledge concentration:** Concentrated. Small file count but high correctness risk; the refactor into `verify-exercise.ts` is the current authoritative structure.

**Commits/PRs to read before changing this area:**
- `1e33b0c` — extract verify logic to `verify-exercise.ts`
- `a9a8dbc` — matching verification + review answers
- `47f97ddb` — first verify API

---

### 3.4 Admin exercise content CRUD

**Why it matters:** Admin creates books, chapters, lessons, exercises, and answer keys. The territory artifact shows tight coupling between edit pages and API routes, making this a natural change-propagation risk.

**Key contributors:**
- Piotr Wrotny — 8 commits touching this area (7 thematic, excluding mass-formatting).

**Thematic commit activity for Piotr Wrotny:**
- Lessons CRUD: `d5979561` — lessons CRUD with `MarkdownEditor` island.
- Exercises & answer keys: `0259e73e` — `ExerciseForm` island + exercises API.
- Schema/validation & matching editor: `06800496` — S-06 Phase 1 schema and API validation.
- Open-ended / sentence transformation: `0aac517f`, `2a262df0` — data schema, admin API, and edit form.
- Completion wiring: `a3706a34` — wired completion button to solved-exercise state.

**Knowledge concentration:** Concentrated. Editor islands (`ExerciseForm`, `MarkdownEditor`) and their API routes evolve together; changes to one usually require changes to the other.

**Commits/PRs to read before changing this area:**
- `0259e73e` — exercises & answer keys CRUD
- `2a262df0` — sentence transformation / open-ended admin form
- `06800496` — schema, API validation and matching editor
- `d5979561` — lessons CRUD with MarkdownEditor

---

### 3.5 Auth / middleware / role guards

**Why it matters:** A security chokepoint. `src/middleware.ts` appears across admin and student route changes; small edits propagate to every protected page.

**Key contributors:**
- Piotr Wrotny — 5 commits touching this file (4 thematic, excluding bootstrap).

**Thematic commit activity for Piotr Wrotny:**
- Initial role/locals plumbing: `4539ac0f` — dependencies, Astro `Locals` role, middleware foundation.
- Admin guard & layout: `acf45413` — middleware guard, `AdminLayout`, shadcn primitives.
- Student route protection: `d0b5ff85` — add `/student/profile` route and protect `/student` paths.
- Impl-review cleanup: `e2884e9b` — S-02 fixes touching middleware.

**Knowledge concentration:** Concentrated. Because middleware is cross-cutting, any change here should be paired with both admin and student route tests.

**Commits/PRs to read before changing this area:**
- `d0b5ff85` — student route protection
- `acf45413` — admin middleware guard and layout
- `4539ac0f` — initial middleware and role plumbing

## 4. Bot / agent-generated commit filter notes

- **Bots/CI:** None found. `git log --pretty='format:%an <%ae>'` returns only `Piotr Wrotny <Piotr.Wrotny@asseco.pl>`.
- **Agent-generated messages:** No commit subjects are obviously auto-generated (no `Co-authored-by: agent`, `Auto-generated`, `AI:`, etc.).
- **Noise excluded:**
  - `df48440` — mass-formatting / line-ending cleanup (touched 39 files) is treated as tooling noise.
  - `86f87c88` — initial bootstrap commit ("10x do m1l4") is treated as setup noise.
  - Context/archive bookkeeping commits (e.g., `b08ae37` "jednak copilot", archive moves) are not used for source-area contributor interpretation.

## 5. Cross-area observations

- **Single point of knowledge:** Every active area is owned by the same author. There is no natural code-review or knowledge-redundancy safety net.
- **Parallel June delivery:** Most thematic commits landed between 2026-06-25 and 2026-06-30. Areas were built concurrently, so shared assumptions (e.g., role names, exercise schema shape, completion state machine) may not be explicit.
- **Largest structural churn:** The admin user module was deleted (`e2884e9`) and then restored (`f2d8e3c`) as a separate change. Earlier commits in this cluster are historical context only.

## Appendix — exact commands used

All commands were run from the repo root on branch `module-4`.

```bash
# overall contributor list (name only)
git log --pretty='format:%an' | sort | uniq -c | sort -rn

# overall contributor list (name + email)
git log --pretty='format:%an <%ae>' | sort | uniq -c | sort -rn

# 3.1 Admin user & book-access management
git log --pretty='format:%H|%ad|%an|%s' --date=short -- \
  src/lib/services/user-admin.ts \
  src/pages/api/admin/users.ts \
  "src/pages/api/admin/users/[id]/grant.ts" \
  "src/pages/api/admin/users/[id]/revoke.ts" \
  src/pages/admin/users.astro \
  src/components/admin/UsersTable.tsx

# 3.2 Student lesson consumption
git log --pretty='format:%H|%ad|%an|%s' --date=short -- \
  src/pages/lessons/[id].astro \
  src/components/lesson/LessonInteractive.tsx \
  src/pages/dashboard.astro \
  "src/pages/api/lessons/[id]/complete.ts"

# 3.3 Exercise verification engine
git log --pretty='format:%H|%ad|%an|%s' --date=short -- \
  src/pages/api/exercises/verify.ts \
  src/lib/verify-exercise.ts

# 3.4 Admin exercise content CRUD
git log --pretty='format:%H|%ad|%an|%s' --date=short -- \
  src/pages/admin/exercises \
  src/pages/api/admin/exercises \
  src/components/admin/ExerciseForm.tsx \
  src/components/admin/MarkdownEditor.tsx \
  src/components/admin/DeleteButton.tsx

# 3.5 Auth / middleware / role guards
git log --pretty='format:%H|%ad|%an|%s' --date=short -- \
  src/middleware.ts
```
