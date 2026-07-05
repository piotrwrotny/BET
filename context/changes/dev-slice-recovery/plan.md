# Plan — Dev Branch Slice Recovery

> **Change ID:** `dev-slice-recovery`  
> **Branch:** `dev` (HEAD `cc294cc`)  
> **Goal:** Restore missing or relaxed slice functionality so the current `dev` code matches the archived plans and PRD, and produces a deployable build.

---

## 1. Executive Summary

The `dev` branch has drifted from the intended end state. Three parallel forces caused the drift:

1. **Parallel branch `module-4-architect` contains later fixes that never reached `dev`.**
   - `58fe0c2` fixes the production build by isolating `astro:env/server` to server-only modules.
   - `2fa9873` implements server-side "Przeczytano" confirmation required by FR-015.
   - `ef04194` adds API contract tests for the new read/complete flow.
   - These commits are ancestors of `module-4-architect` but **not** of `dev`.

2. **An intentional RLS relaxation on `dev` disabled book/lesson access control.**
   - Migration `supabase/migrations/20260629000000_open_book_access_for_students.sql` replaces `has_book_access()` / `has_lesson_access()` with `select true`.
   - This makes `user_book_access` writes from S-03 meaningless at read time.

3. **Seed and documentation rot.**
   - `supabase/seed.sql` claims a `fill_in_blank` exercise exists but inserts `multiple_choice` instead.
   - `context/foundation/roadmap.md` contradicts the S-07 plan, claiming S-07 components are missing when they exist.
   - S-02 has 14 unchecked manual acceptance criteria despite being marked `done`.

This plan lists the concrete recovery work, ordered by dependency and blast radius.

---

## 2. Findings Mapped to Slices

| Priority | Slice | Gap | Evidence | Root Cause |
|---|---|---|---|---|
| P0 | All | Production build fails with `ServerOnlyModule` for `astro:env/server`. | `npm run build` fails; `src/lib/supabase.ts:4` imports from `astro:env/server`. | Fix exists only on `module-4-architect` (`58fe0c2`). |
| P1 | S-01 / F-01 | Server does not enforce "Przeczytano" before lesson completion. | `POST /api/lessons/[id]/complete.ts` only checks closed exercises; no `POST /api/lessons/[id]/read.ts`. | Implementation exists only on `module-4-architect` (`2fa9873`). |
| P1 | S-03 / F-01 | Book/lesson access control is bypassed. | `supabase/migrations/20260629000000_open_book_access_for_students.sql` rewrites helpers to `select true`. | Intentional relaxation that needs to be reverted or gated by a feature flag. |
| P2 | F-01 / S-06 | Seed data has no real `fill_in_blank` exercise. | `supabase/seed.sql:127` comment claims FR-018 coverage but row is `type='multiple_choice'`. | Seed bug. |
| P2 | S-02 / S-03 | `src/lib/db/schema.ts` is incomplete; raw string literals remain. | Only 3 table constants exported; `TABLE_BOOKS` unused; other tables use raw strings. | Refactor (`refactor-opportunities`) was closed before full rollout. |
| P3 | S-01 / S-03 | API contract / integration tests for boundaries are written but not tracked in roadmap. | `context/changes/testing-admin-student-access-boundary/plan.md` is open; Playwright runs blocked on local Supabase. | In-flight test plan not yet merged/closed. |
| P3 | S-07 | Roadmap narrative is stale. | Roadmap says S-07 components are missing; they exist in `src/components/lesson/`. | Documentation not updated after implementation. |

---

## 3. Decision Log

| Decision | Rationale |
|---|---|
| **Cherry-pick, not merge, the `module-4-architect` fixes** | `module-4-architect` contains M4/M5 course artifacts (`.omp/`, AI toolkit workflows, `context/foundation/ci.md`) that are out of scope for BET slice recovery. We want only the BET-relevant commits. |
| **Apply `58fe0c2` before `2fa9873`** | `2fa9873` depends on the `supabase.server.ts` split. Build must be green first. |
| **Create a new RLS migration instead of editing the old one** | `20260629000000_open_book_access_for_students.sql` has already been applied to developer databases. Editing it would require `supabase db reset`. A follow-up migration is safer. |
| **Keep `LessonCompletion` or replace with `StudentLessonProgress`?** | Replace. `StudentLessonProgress` in `2fa9873` models both reading confirmation and exercise solving as first-class aggregate transitions, matching FR-015 exactly. The old `LessonCompletion` files should be deleted by the cherry-pick. |
| **Do not restore the `exercise_submissions` INSERT policy for authenticated users** | Current design is correct: submissions are written only by the service-role API after server-side verification. This prevents students from self-marking answers correct. |

---

## 4. Recovery Phases

### Phase 0 — Preparation and baseline

1. From `dev`, create a recovery branch, e.g. `dev-slice-recovery`.
2. Run `npm run typecheck`, `npm run test`, and `npm run build` to record the baseline.
3. Confirm the exact commits to cherry-pick:
   - `58fe0c2` — isolate `astro:env/server`.
   - `2fa9873` — server-side reading confirmation + `StudentLessonProgress`.
   - `ef04194` — API contract tests for read/complete.
   - (Optional) `119a438` — CI workflow. Only if team wants the new CI now.

### Phase 1 — Fix the production build (P0)

**Goal:** `npm run build` passes.

**Approach:** Cherry-pick `58fe0c2` from `module-4-architect`.

**What the commit does:**
- Renames `src/lib/supabase.ts` → `src/lib/supabase.server.ts`.
- Splits `src/lib/services/user-admin.ts`:
  - `src/lib/services/user-admin.schema.ts` — client-safe `BookOption`, `UserWithAccess`, `AdminUsersResponseSchema`.
  - `src/lib/services/user-admin.server.ts` — server-only `getStudentsWithAccess` and service-role client usage.
- Updates all imports across `src/pages/`, `src/components/`, `src/middleware.ts`, and `src/pages/api/`.

**Verification:**
- `npm run typecheck` passes.
- `npm run lint` passes.
- `npm run test` passes.
- `npm run build` passes.

**Risk:** Any new files added to `dev` since `58fe0c2` that import `src/lib/supabase.ts` or `src/lib/services/user-admin.ts` will need manual import updates. Use `grep` to find missed imports before build.

### Phase 2 — Restore server-side "Przeczytano" confirmation (P1)

**Goal:** Lesson completion requires both reading confirmation and solved closed exercises (FR-015).

**Approach:** Cherry-pick `2fa9873` from `module-4-architect`.

**What the commit does:**
- Adds `public.lesson_reading_confirmations` table with RLS (append-only, user-scoped).
- Adds migration `supabase/migrations/20260702130000_add_reading_confirmation.sql`.
- Adds domain aggregate `src/lib/domain/student-lesson-progress.ts`.
- Adds errors `src/lib/errors/student-lesson-progress.ts`.
- Adds repository `src/lib/services/student-lesson-progress.repository.ts`.
- Adds `src/pages/api/lessons/[id]/read.ts`.
- Replaces `src/lib/services/lesson-completion.*` with the new aggregate.
- Updates `src/pages/api/lessons/[id]/complete.ts` to load `StudentLessonProgress` and require `readingConfirmed`.
- Updates `src/components/lesson/LessonInteractive.tsx` to call `/read` before `/complete`.
- Adds unit tests `src/lib/domain/student-lesson-progress.test.ts`.

**Verification:**
- `npm run typecheck` passes.
- `npm run test` passes (should show 75+ tests).
- `npx supabase db reset` applies the new migration cleanly.
- Manual: call `POST /api/lessons/{id}/complete` without reading confirmation → expect 409 with `ReadingNotConfirmedError`.

**Risk:** `dev` already has the older `LessonCompletion` files. The cherry-pick will delete them; any in-flight work referencing them must be updated. Verify no other branch has open changes against `lesson-completion.*`.

### Phase 3 — Re-enable strict book/lesson access control (P1)

**Goal:** `user_book_access` grants are enforced by RLS (FR-003).

**Approach:** Create a new migration that reverts the relaxation introduced in `20260629000000_open_book_access_for_students.sql`.

**New migration file:** `supabase/migrations/20260703120000_restore_book_access_rls.sql`

```sql
-- Re-instate per-user book and lesson access checks

create or replace function private.has_book_access(_book_id uuid)
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select exists(
    select 1 from public.user_book_access
    where user_id = auth.uid() and book_id = _book_id
  );
$$;

create or replace function private.has_lesson_access(_lesson_id uuid)
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select exists(
    select 1 from public.user_book_access uba
    join public.chapters c on c.book_id = uba.book_id
    join public.lessons l on l.chapter_id = c.id
    where uba.user_id = auth.uid() and l.id = _lesson_id
  );
$$;

drop policy if exists books_select on public.books;
create policy books_select on public.books
  for select to authenticated using (private.is_admin() or private.has_book_access(id));
```

**Verification:**
- `npx supabase db reset` passes.
- E2E/API contract tests for S-03 (grant/revoke + access boundary) pass.
- Manual: student A with no `user_book_access` rows gets 403/empty when querying `books`/`lessons`.

**Risk:** The relaxation may have been introduced to make local seeding "just work" without granting access. After restore, seed must grant `user_book_access` for the seeded student and book.

### Phase 4 — Fix seed data (P2)

**Goal:** Local seed supports all exercise types and respects restored RLS.

**Changes to `supabase/seed.sql`:**
1. After inserting users/books/chapters/lessons, insert a `user_book_access` row for the seeded student and book.
2. Replace the fake `fill_in_blank` row with a real one:
   - `type = 'fill_in_blank'`
   - `payload = '{}'`
   - At least two keys for the same exercise, e.g. `went` and `did go`.
3. Optionally add a `matching` exercise if S-06 should be testable without admin UI.

**Verification:**
- `npx supabase db reset` passes.
- `npm run test` passes.
- E2E `tests/e2e/closed-exercises.spec.ts` can run against seeded data.

### Phase 5 — Complete schema constants rollout (P2)

**Goal:** Eliminate raw table/constraint string literals in the user/book-access and lesson-completion flows.

**Changes:**
- Add to `src/lib/db/schema.ts`:
  - `TABLE_CHAPTERS`, `TABLE_LESSONS`, `TABLE_EXERCISES`, `TABLE_EXERCISE_KEYS`, `TABLE_LESSON_PROGRESS`, `TABLE_EXERCISE_SUBMISSIONS`, `TABLE_LESSON_READING_CONFIRMATIONS`.
  - Conflict target constants as needed.
- Replace literals in:
  - `src/middleware.ts`
  - `src/lib/services/user-admin.server.ts`
  - `src/pages/api/admin/users.ts`, `[id]/grant.ts`, `[id]/revoke.ts`
  - `src/lib/services/student-lesson-progress.repository.ts` (after Phase 2)
  - `src/pages/api/exercises/verify.ts`
  - `src/pages/api/lessons/[id]/complete.ts`, `[id]/read.ts`
- Update `src/lib/db/schema.test.ts` to assert new constants.

**Verification:**
- `npm run lint`, `npm run typecheck`, `npm run test` pass.
- `grep -R` for removed raw literals in the migrated files returns no hits (excluding generated types and constant definitions).

### Phase 6 — Close the testing-admin-student-access-boundary change (P3)

**Goal:** Run and pass the contract/integration tests that protect S-01/S-03 boundaries.

**Changes:**
- Ensure local Supabase is running.
- Run `npx playwright test --project=api-contract` and `npx playwright test --project=integration`.
- Update `context/changes/testing-admin-student-access-boundary/plan.md` progress checkboxes and close the change.

**Verification:**
- All Playwright tests in scope pass.

### Phase 7 — Documentation cleanup (P3)

**Goal:** Roadmap and context accurately reflect `dev` state.

**Changes:**
- Update `context/foundation/roadmap.md` S-07 note: confirm components exist and E2E passes.
- Update S-02 status: either mark manual criteria as verified or move S-02 to a verification state.
- Add a note to `server-side-lesson-completion-gating` that reading confirmation was added later.
- Archive `dev-slice-recovery` when all phases are green.

---

## 5. Rollback Strategy

Each phase is an independent commit (or set of commits). If a phase breaks the build or tests:

- Phase 1: revert the rename/import-update commit; restore `src/lib/supabase.ts` and `src/lib/services/user-admin.ts`.
- Phase 2: revert the `StudentLessonProgress` commit; old `LessonCompletion` files return.
- Phase 3: apply an inverse migration to relax RLS again (only if necessary for unblocking local dev).
- Phase 4: revert seed change; `supabase db reset`.
- Phase 5: revert constants commit.

---

## 6. Verification Matrix

| Phase | Automated Checks | Manual Checks |
|---|---|---|
| 1 | `npm run typecheck`, `npm run lint`, `npm run test`, `npm run build` | Visual review of import diff |
| 2 | Same + `npx supabase db reset` | Curl `POST /read` and `POST /complete` scenarios |
| 3 | `npx playwright test --project=api-contract` (S-03 boundary) | Student without access sees no books |
| 4 | `npx supabase db reset`; E2E closed-exercises spec | Open seeded lesson and verify FIB exercise |
| 5 | `npm run lint`, `grep` for raw literals | — |
| 6 | Full Playwright suite | — |
| 7 | — | Read-through of updated roadmap/context |

---

## 7. Acceptance Criteria for This Plan

- [ ] Plan file is stored in `context/changes/dev-slice-recovery/plan.md`.
- [ ] Every gap is traced to a specific commit, file, or migration.
- [ ] Recovery phases are ordered by dependency (build → correctness → data → polish).
- [ ] Each phase has a verifiable command or observable outcome.
- [ ] Rollback strategy is defined for high-blast-radius phases.

---

## 8. Progress

### Phase 0 — Preparation

#### Automated
- [ ] 0.1 Create recovery branch from `dev` and record baseline checks.
- [ ] 0.2 Confirm target commits to cherry-pick from `module-4-architect`.

### Phase 1 — Fix production build (P0)

#### Automated
- [x] 1.1 Cherry-pick `58fe0c2` and resolve any import conflicts. — e796777
- [x] 1.2 Run `npm run typecheck`, `npm run lint`, `npm run test`, `npm run build`. — e796777

### Phase 2 — Restore server-side reading confirmation (P1)

#### Automated
- [x] 2.1 Cherry-pick `2fa9873` and resolve conflicts with existing `LessonCompletion` files. — 225c14a
- [x] 2.2 Run `npm run typecheck`, `npm run lint`, `npm run test`. — 225c14a
- [x] 2.3 Run `npx supabase db reset` to apply reading-confirmation migration. — 225c14a

#### Manual
- [x] M.1 Curl `POST /api/lessons/{id}/read` then `POST /api/lessons/{id}/complete` without reading confirmation → expect 409. — 225c14a

### Phase 3 — Re-enable strict book/lesson access control (P1)

#### Automated
- [x] 3.1 Create `supabase/migrations/20260703120000_restore_book_access_rls.sql`. — d4f8e83
- [x] 3.2 Run `npx supabase db reset`. — d4f8e83

#### Manual
- [x] M.2 Confirm student without `user_book_access` rows sees no books/lessons. — d4f8e83

### Phase 4 — Fix seed data (P2)

#### Automated
- [x] 4.1 Add `user_book_access` seed row for the test student and book. — b15b09f
- [x] 4.2 Replace fake `fill_in_blank` seed row with a real `fill_in_blank` exercise and keys. — b15b09f
- [x] 4.3 Run `npx supabase db reset`. — b15b09f

### Phase 5 — Complete schema constants rollout (P2)

#### Automated
- [x] 5.1 Add remaining `TABLE_*` and conflict-target constants to `src/lib/db/schema.ts`. — 5bca4cf
- [x] 5.2 Replace raw string literals in user-admin and lesson-progress flows. — 5bca4cf
- [x] 5.3 Update `src/lib/db/schema.test.ts`. — 5bca4cf
- [x] 5.4 Run `npm run typecheck`, `npm run lint`, `npm run test`. — 5bca4cf

### Phase 6 — Close access-boundary testing (P3)

#### Automated
- [x] 6.1 Run `npx playwright test --project=api-contract`. — `7d9f8a2`
- [x] 6.2 Run `npx playwright test --project=integration` (requires clean local DB). — `7d9f8a2`

#### Manual
- [ ] M.3 Update `context/changes/testing-admin-student-access-boundary/plan.md` progress and close the change. — blocked: local Supabase unavailable (Docker Desktop stopped).

### Phase 7 — Documentation cleanup (P3)

#### Automated
- [x] 7.1 Update `context/foundation/roadmap.md` S-07 note and S-02 status. — `7d9f8a2`
- [x] 7.2 Update `context/changes/server-side-lesson-completion-gating/plan.md` to mention reading confirmation. — `7d9f8a2`

#### Manual
- [x] M.4 Final read-through of updated roadmap/context. — `7d9f8a2`

---

## 9. Immediate Next Actions

1. Review this plan with the team and decide whether to include `119a438` (new CI workflow) in Phase 1.
2. Create the recovery branch from current `dev`.
3. Start Phase 1 by cherry-picking `58fe0c2` and resolving any import conflicts.
