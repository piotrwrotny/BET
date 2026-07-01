# Research — Phase 2: Admin/Student Access Boundary & Completion Gating

> **Change:** `testing-admin-student-access-boundary`  
> **Goal:** Lock role and ownership checks (Risk #4) and completion gating correctness (Risk #6).  
> **Test types:** API contract / integration tests.  
> **Branch:** `module-4`

---

## Risk #4 — Cross-role / cross-user access

### Failure scenario
A student accesses another student's data or hits an admin endpoint; an admin action leaks or mutates data outside the intended scope.

### Grounded evidence

#### Entry points and guards

| Layer | Check | Location |
|-------|-------|----------|
| Middleware | Resolves `locals.user`/`locals.role`; redirects non-admins from `/admin/*` | `src/middleware.ts:9-35` |
| Admin page | Re-checks `Astro.locals.role !== "admin"` | `src/pages/admin/users.astro:13` (and every other admin `.astro` page) |
| Admin API list | `locals.role !== "admin"` + `requireSameOrigin` | `src/pages/api/admin/users.ts:23-26` |
| Admin API grant | `locals.role !== "admin""` + CSRF + target-role check | `src/pages/api/admin/users/[id]/grant.ts:31-70` |
| Admin API revoke | same pattern | `src/pages/api/admin/users/[id]/revoke.ts:30-67` |
| Student lesson page | RLS protects `lessons` select via `has_lesson_access` | `src/pages/lessons/[id].astro:27-37` |
| Student completion API | Auth + UUID + RLS INSERT policy | `src/pages/api/lessons/[id]/complete.ts:1-43` |

#### Structural observations

- The expression `locals.role !== "admin"` appears in **15 admin `.ts` API routes** (ast-grep) and **11 admin `.astro` pages** (grep), plus `src/middleware.ts:37`.
- `requireSameOrigin` is duplicated in `src/pages/api/admin/users.ts:7`, `grant.ts:17`, and `revoke.ts:17`.
- `createAdminClient()` (service role) is used only in `src/lib/services/user-admin.ts:57` to list auth users.
- Grant/revoke endpoints use the cookie-backed `createClient()` and rely on explicit code-level checks, not RLS, for the admin capability.

#### What currently protects

- Middleware blocks non-admins from `/admin/*` pages and API routes at the URL level.
- Each admin API route re-checks role and same-origin headers.
- Grant/revoke verify the target user role is `"student"` before mutating `user_book_access`.
- Student reads are constrained by RLS policies (`has_lesson_access`, `has_book_access`) and user ownership.

#### What is NOT protected by fast tests

- No API contract test proves a student or anonymous user receives 403 on admin endpoints.
- No contract test proves CSRF origin checks reject cross-origin requests.
- No contract test proves target-role checks reject granting/revoking for non-students.
- No contract test proves invalid UUID / malformed body returns 400 on grant/revoke.
- No unit test isolates `getStudentsWithAccess` edge cases.

#### Prior research

See `context/changes/admin-user-access-analysis/research.md` for the detailed Deep Focus on admin user & book-access management, including end-to-end trace, test-gap analysis, blast radius, and ast-grep verification.

---

## Risk #6 — Completion gating

### Failure scenario
A lesson is marked complete before all closed exercises are solved, or an open-ended exercise wrongly blocks completion, or the server accepts a completion request without verifying exercise state.

### Grounded evidence

| Step | File | Lines | What happens |
|------|------|-------|--------------|
| 1 | `src/pages/lessons/[id].astro` | 76 | `closedExerciseCount = exercises.filter(e => e.type !== "open_ended").length` |
| 2 | `src/pages/lessons/[id].astro` | 84-93 | Server checks existing `lesson_progress`; passes `isAlreadyCompleted` to island |
| 3 | `src/components/lesson/LessonInteractive.tsx` | 15-22 | Receives `closedExerciseCount`; tracks `completedExercises` Set |
| 4 | `src/components/lesson/LessonInteractive.tsx` | 42-58 | `handleMarkRead()` blocks if `completedExercises.size < closedExerciseCount` |
| 5 | `src/components/lesson/LessonInteractive.tsx` | 64-83 | Renders closed exercise components with `onCorrect={handleCorrect}`; `OpenEndedExercise` gets no `onCorrect` |
| 6 | `src/pages/api/lessons/[id]/complete.ts` | 9-43 | POST records `lesson_progress` row; validates auth + UUID + RLS lesson access; **does not verify exercises** |

### Key findings

- The completion gate is **client-side only**. `POST /api/lessons/[id]/complete` trusts the caller.
- Open-ended exercises are explicitly excluded from `closedExerciseCount` (`lessons/[id].astro:76`).
- Unknown exercise types are treated as closed by the page filter, but `verifyExercise` returns `false` for unknown types (`src/lib/verify-exercise.ts`), making such a lesson uncompletable.
- RLS INSERT policy only checks `user_id = auth.uid() AND has_lesson_access(lesson_id)`; it does not enforce exercise completion.

### Current coverage

- `tests/e2e/closed-exercises.spec.ts` — happy path: closed exercise blocks, then all solved → completion.
- `tests/e2e/lesson-completion-persistence.spec.ts` — idempotent completion for a lesson with no exercises.
- `tests/e2e/student-profile.spec.ts` — calls complete endpoint directly without solving exercises (test setup only).

### Missing fast tests

- Server-side verification that completion requires all closed exercises solved.
- Rejection of direct `POST /api/lessons/[id]/complete` when closed exercises are unsolved.
- Handling of lessons that contain only open-ended exercises.
- Handling of unknown exercise types.

---

## Cheapest useful test layers

| Risk | Cheapest layer | Why |
|------|----------------|-----|
| #4 role guards on admin endpoints | API contract tests (Vitest + minimal Astro request stub) | Deterministic, fast, no UI |
| #4 CSRF origin checks | API contract tests | Same; header-driven boundary |
| #4 target-role check | API contract tests | DB state + request, no browser |
| #4 `getStudentsWithAccess` edge cases | Unit tests with mocked Supabase admin client | Pure data transformation |
| #6 completion precondition | Integration test hitting `POST /api/lessons/[id]/complete` with controlled DB state | Catches server-side gap directly |
| #6 open-ended/unknown types | Unit test for `closedExerciseCount` logic or integration test | Fast, behavior-only |

---

## Anti-patterns to avoid

- E2E-only coverage of a single happy path for security boundaries.
- Mocking the exact function under test in unit tests.
- Copying expected answers from implementation into test expectations.
- Testing UI labels instead of behavior.

---

## Open questions

- Should `POST /api/lessons/[id]/complete` enforce exercise completion on the server, or is client-side gating intentional for MVP?
- Is the RLS override `private.has_lesson_access() / has_book_access() = true` temporary? If reverted, access-boundary tests must include real `user_book_access` rows.
- Should the test suite create real Supabase Auth users (service role) or use a stubbed client?
