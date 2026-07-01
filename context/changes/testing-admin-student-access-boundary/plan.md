# Plan — Phase 2: Admin/Student Access Boundary & Completion Gating

> **Change:** `testing-admin-student-access-boundary`  
> **Research:** `context/changes/testing-admin-student-access-boundary/research.md`  
> **Test-plan risk coverage:** #4 (cross-role/cross-user access), #6 (completion gating)  
> **Branch:** `module-4`

## Overview

Phase 2 adds fast, deterministic tests for the two highest-risk boundaries identified in the test plan: who can call admin endpoints and when a lesson can be marked complete. The phase avoids E2E-only coverage by extracting testable units where possible and using Playwright API-request contexts only where the boundary requires real HTTP semantics (auth cookies, RLS, CSRF headers).

## Risks covered

| Risk | What must be proven | Tests that prove it |
|------|---------------------|---------------------|
| #4 Student/anonymous hits admin endpoint | Admin API routes return 403 for non-admin | API contract tests for `/api/admin/users`, `/grant`, `/revoke` |
| #4 Cross-origin state-changing request | `requireSameOrigin` rejects missing/bad origin headers | API contract tests for `/api/admin/users/[id]/grant` |
| #4 Grant/revoke to non-student | Target-role check returns 403 | API contract tests |
| #4 Invalid input reaches DB | UUID and body validation return 400 | API contract tests |
| #6 Lesson completes without solving | Server rejects `POST /api/lessons/[id]/complete` when closed exercises unsolved | Integration test |
| #6 Open-ended blocks completion | `closedExerciseCount` excludes `open_ended`; only-mark-read lesson with only open-ended completes | Integration + unit test |
| #6 Unknown type makes lesson uncompletable | `verifyExercise` returns `false` for unknown types; completion precondition fails | Unit/contract test |

## Sub-phases

### Phase 1 — Extract and unit-test `requireSameOrigin`

Extract the duplicated same-origin check into a shared helper so it can be unit-tested without an Astro request context.

**Files:**
- Create `src/lib/guards.ts` with `requireSameOrigin(request): Response | null`.
- Update `src/pages/api/admin/users.ts`, `grant.ts`, `revoke.ts` to import it.
- Add `src/lib/guards.test.ts`.

**Contract:**
- Returns `null` for `sec-fetch-site: same-origin`.
- Returns `null` for matching `origin`.
- Returns `null` for matching `referer` when `origin` is absent.
- Returns 403 JSON response otherwise.

### Phase 2 — Unit tests for `getStudentsWithAccess`

Test `src/lib/services/user-admin.ts` with a mocked `createAdminClient` (or directly inject a mock Supabase admin client). Cover edge cases that E2E cannot cheaply exercise.

**Cases:**
- Empty auth user list → `{ users: [], hasNextPage: false }`.
- `perPage+1` fetch correctly infers `hasNextPage = true/false`.
- Users without email are filtered out before pagination.
- Role rows missing for some users → those users are excluded.
- Student with multiple books → books aggregated.
- Chunking >200 user IDs (batch query split).
- `books` null in access row → fallback title "Unknown book".

### Phase 3 — API contract tests for admin access boundary

Use Playwright's `request` context plus the existing `admin.json` storage state. Tests run against the local dev server; they verify real HTTP semantics (cookies, role, origin headers).

**Setup per test:**
- Start with authenticated admin or freshly signed-up student context.
- Use a seeded student user (real Supabase Auth user).

**Tests:**
- `GET /api/admin/users` returns 200 for admin, 403 for student, 401/403 for anonymous.
- `POST /api/admin/users/<student-id>/grant` returns 403 for student caller, 403 for anonymous, 400 for invalid UUID, 400 for missing/invalid `book_id`, 403 when target user is admin.
- Same pattern for `DELETE /api/admin/users/<student-id>/revoke?book_id=<id>`.
- Cross-origin `POST /api/admin/users/<id>/grant` (no `origin`/`referer`/`sec-fetch-site`) returns 403.

### Phase 4 — Integration tests for lesson completion gating

Use Playwright `request` with a student auth context. Seed a lesson with controlled exercises via the admin UI helpers (reuse patterns from `tests/e2e/closed-exercises.spec.ts`).

**Tests:**
- `POST /api/lessons/<id>/complete` returns 200 when all closed exercises are solved.
- `POST /api/lessons/<id>/complete` returns 4xx when at least one closed exercise is unsolved (until server enforces this; if server does not enforce, the test documents the gap and is marked `todo`).
- Lesson containing only `open_ended` exercises can be completed without solving.
- Idempotent completion (calling twice returns success without duplicate rows).

### Phase 5 — Update test-plan cookbook

After tests land, fill `context/foundation/test-plan.md` §6 subsections:
- 6.2 Adding an integration / API contract test
- 6.5 Adding a test for a new admin endpoint
- 6.6 Per-rollout-phase notes for Phase 2

## Verification commands

```bash
npm run test:unit
npx playwright test tests/api-contract/  # new contract tests
npx playwright test tests/integration/   # new integration tests
npm run lint
npm run typecheck
```

## Progress

### Automated

- [x] 1.1 Extract `requireSameOrigin` to `src/lib/guards.ts` and migrate three API routes
- [x] 1.2 Add `src/lib/guards.test.ts` with origin-header cases
- [x] 2.1 Add `src/lib/services/user-admin.test.ts` covering pagination, filtering, chunking, fallback
- [x] 3.1 Add API contract spec for `/api/admin/users`, `/grant`, `/revoke` boundary cases
- [x] 4.1 Add integration spec for `POST /api/lessons/[id]/complete` gating
- [x] 5.1 Update `context/foundation/test-plan.md` §6 cookbook
- [x] 6.1 Run lint + typecheck + unit tests green
- [ ] 6.2 Run Playwright contract + integration tests green (blocked: local Supabase Docker unavailable in this environment)

### Manual

- [x] M.1 Review that no real email addresses or secrets are used in seeded test data
- [ ] M.2 Confirm contract tests run green against a fresh dev server + clean DB seed (blocked: local Supabase Docker unavailable)
