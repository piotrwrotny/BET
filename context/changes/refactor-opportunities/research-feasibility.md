# Refactor Feasibility — Admin User & Book-Access Flow

> **Change:** `refactor-opportunities`  
> **Source analysis:** `context/changes/admin-user-access-analysis/research.md`  
> **Date:** 2026-07-01  
> **Scope:** READ-ONLY exploration. No code changes.

## Executive summary

The admin user/book-access flow has **10 recorded debt items**. After re-reading the current code, tests, and history, only **5 are structural refactor candidates** worth doing incrementally. Two are test-coverage gaps that should be addressed as guard work, one is a large architectural change that should be deferred until product access policy is settled, and one is a business-domain decision that is out of scope for a structural refactor.

The safest first steps are:

1. Extract a shared `BookOption` type/schema (tiny blast radius).
2. Extract DB table/constraint constants (tiny blast radius).
3. Introduce a `requireAdmin` helper and migrate the user/grant/revoke routes first.
4. Replace inline same-origin checks in the remaining admin API routes with `requireSameOrigin`.

The RLS override and the service-role/RLS read split are deliberately **deferred** because their correct shape depends on a product decision about when (and whether) to re-enable book-level access gating.

---

## Current test & gate landscape

| Gate | Command / location | Relevant coverage today |
|------|-------------------|--------------------------|
| Unit tests | `npm run test:unit` → `vitest.config.ts` includes `src/**/*.test.ts` | `src/lib/services/user-admin.test.ts` covers listing/filtering/chunking/unknown-book/errors. `src/lib/guards.test.ts` covers `requireSameOrigin`. No unit tests for API route handlers or React components. |
| Lint | `npm run lint` → ESLint 9 with Astro, React, TypeScript plugins | Will flag the duplicated `BookOption` names only if `no-redeclare` is active; otherwise it is a type-only duplicate and compiles fine. |
| Typecheck | `npm run typecheck` → `astro check` | Catches compile-time type drift but not runtime fetch casts (e.g. `response.json() as { users?: UserWithAccess[] }`). |
| E2E / API contract | `playwright.config.ts` projects: `setup`, `api-contract`, `e2e`, `e2e-student`, `integration` | `tests/api-contract/admin-users.spec.ts` covers role, same-origin, UUID, missing `book_id`, and target-role rejection for grant/revoke. `tests/e2e/admin-users.spec.ts` covers happy-path grant/revoke/pending filter. `tests/e2e/admin-users-unauthorized.spec.ts` covers non-admin redirect. |
| CI workflow | `.github/workflows/` | **No workflow exists.** All gates are local/pre-commit only. |

**Key findings:**

- The prior analysis said `user-admin.ts` and the admin API routes had zero unit tests; that is now **partially outdated** — `user-admin.test.ts` and `guards.test.ts` exist [evidence: `src/lib/services/user-admin.test.ts:1`, `src/lib/guards.test.ts:1`].
- `requireSameOrigin` has already been extracted into `src/lib/guards.ts` and is used by the user/grant/revoke routes [evidence: `src/lib/guards.ts:7`, `src/pages/api/admin/users.ts:2`, `src/pages/api/admin/users/[id]/grant.ts:3`, `src/pages/api/admin/users/[id]/revoke.ts:3`].
- The other admin API routes (books, chapters, lessons, exercises) still inline their own origin check and omit the `sec-fetch-site` header check that `requireSameOrigin` uses [evidence: `src/pages/api/admin/books/index.ts:28-32`, `src/pages/api/admin/books/[id].ts:29-33`].

---

## Candidate-by-candidate feasibility assessment

### Table: candidates → blast radius → coverage → incremental path → prerequisite → recommendation

| # | Candidate | Blast radius | Existing coverage | Incremental migration path | First prerequisite | Recommendation |
|---|-----------|--------------|-------------------|----------------------------|--------------------|----------------|
| 1 | E2E-only coverage for security-critical flow | Files: `src/pages/api/admin/users.ts`, `src/pages/api/admin/users/[id]/grant.ts`, `src/pages/api/admin/users/[id]/revoke.ts`, `src/components/admin/UsersTable.tsx`, `src/lib/services/user-admin.ts`. Routes: `/api/admin/users`, `/api/admin/users/*/grant`, `/api/admin/users/*/revoke`. DB/RLS: `user_roles`, `user_book_access`. | Unit: `user-admin.test.ts` covers the service; `guards.test.ts` covers the helper. API contract: covers role/same-origin/validation/target-role paths for grant/revoke. E2E: covers happy path and unauthorized redirect. **Missing:** 500/503 DB error paths, invalid JSON body, optimistic UI rollback. | **Guard-only / extraction light:** Extract the body of each API handler into a pure function that takes a typed context, then add Vitest cases for each rejection path. Keep Playwright as regression. | Add a unit-testable wrapper for one route (e.g. `grant.ts`) or extend `tests/api-contract/admin-users.spec.ts` with the missing rejection/error cases. | `guard` |
| 2 | Triplicated `locals.role !== "admin"` guard | **29 occurrences** across the admin surface [evidence: `src/middleware.ts:37`, `src/pages/admin/users.astro:13`, `src/pages/api/admin/users.ts:18`, `src/pages/api/admin/users/[id]/grant.ts:19`, `src/pages/api/admin/users/[id]/revoke.ts:19`]: 1 middleware, 13 page checks in 11 `.astro` files, 15 API handler checks. DB table: `user_roles`. RLS: `user_roles_select`/`user_roles_update`. | Middleware redirect tested by `tests/e2e/admin-users-unauthorized.spec.ts`. API role guards tested by `tests/api-contract/admin-users.spec.ts`. Page guards tested by `tests/e2e/admin-users.spec.ts`. No unit tests for a centralized helper. | **Strangler Fig:** Introduce `requireAdmin(locals)` / `requireAdminPage(Astro)` helpers in `src/lib/guards.ts`. Migrate the user/grant/revoke routes first, then one admin resource at a time. Keep middleware fallback until every call site is converted. | Implement `requireAdmin` helper and unit-test it; convert `src/pages/api/admin/users.ts` and the grant/revoke handlers as the pilot. | `extract` |
| 3 | Duplicated same-origin check across API files | The user flow already uses `requireSameOrigin`; **12 inline checks remain** in books/chapters/lessons/exercises API routes [evidence: `src/pages/api/admin/books/index.ts:28-32`, `src/pages/api/admin/books/[id].ts:29-33`, `src/pages/api/admin/books/[id].ts:85-89`]. Routes: all state-changing `/api/admin/*`. | `src/lib/guards.test.ts` covers the helper. `tests/api-contract/admin-users.spec.ts` covers cross-origin grant. **No coverage** for inline checks in other routes, and those inline checks ignore `sec-fetch-site`. | **Extract:** Replace inline origin/referer checks with `requireSameOrigin(request)` route by route. All affected routes already return `Response.json({ error: "Invalid origin" }, { status: 403 })`, so behavior is preserved. | Add an API-contract test for one non-user route (e.g. `POST /api/admin/books`) that asserts cross-origin rejection, then migrate that route. | `extract` |
| 4 | Duplicated `BookOption` interface + manual fetch cast | Files: `src/pages/admin/users.astro:8-11` and `src/components/admin/UsersTable.tsx:15-18`; runtime cast at `UsersTable.tsx:43` [evidence]. Route: `/api/admin/users` response shape. No DB/RLS impact. | TypeScript catches compile-time drift. No runtime validation. E2E would only fail if the API shape changes visibly. | **Extract:** Move `BookOption` to a shared location (e.g. `src/lib/services/user-admin.ts` or a new `src/lib/schemas/admin.ts`). Add a Zod schema for the `/api/admin/users` response and validate it in `refetchUsers` instead of casting. | Move `BookOption` to the shared module and update both consumers; add response schema in the same PR. | `extract` |
| 5 | Fragile service-role auth listing | Files: `src/lib/services/user-admin.ts:61-64` (listUsers + email filter). Consumers: `src/pages/admin/users.astro`, `src/pages/api/admin/users.ts`. DB: `auth.users` (via Supabase admin SDK), `user_roles`, `user_book_access`. RLS not involved because reads use service role. | `user-admin.test.ts` mocks `auth.admin.listUsers` and covers filtering/chunking/unknown book. Does not cover email-less/SSO/phone users. | **Branch by Abstraction:** Define a `UserDirectory` port with `listStudents(options)`. Current implementation becomes `SupabaseAuthUserDirectory`. New implementations (e.g. a `user_profiles` table or SDK filter) can be swapped behind the interface. Run old/new side-by-side with a feature flag. | Extract the interface and migrate `user-admin.ts` to depend on it; add contract tests for the port. | `extract` (behavior change deferred) |
| 6 | Temporary RLS override decouples grants from actual access | Blast radius is **the whole student content surface**: `private.has_book_access()` and `private.has_lesson_access()` return `true`; `books_select` policy allows all authenticated [evidence: `supabase/migrations/20260629000000_open_book_access_for_students.sql:1-14`]. Affects books, chapters, lessons, exercises, and any future access logic. | E2E tests exercise content under open access. No tests for gated access because the gate is disabled. | Not a structural refactor. Requires product decision: revert the override, replace with a feature flag, or keep open access permanently. Engineering can prepare the flag/tests, but the fix is a domain rethink. | Product decision on access-gating timeline and desired fallback behavior. | `out-of-scope` |
| 7 | Hard-coded DB conflict target and table names | Files: `src/pages/api/admin/users/[id]/grant.ts:61-67` (`user_book_access`, `onConflict: "user_id,book_id"`), `src/pages/api/admin/users/[id]/revoke.ts:50-60`, `src/lib/services/user-admin.ts:83-87` (`user_roles`, `user_book_access`) [evidence]. DB tables: `user_roles`, `user_book_access`; composite PK/unique on `(user_id, book_id)`. | Unit tests mock table names; api-contract uses the real DB but does not assert identifiers. Typecheck and lint do not validate string literals against the schema. | **Extract:** Create a `src/lib/db/schema.ts` module exporting table names (`TABLE_USER_ROLES`, `TABLE_USER_BOOK_ACCESS`) and conflict targets. Replace literals incrementally; start with grant/revoke, then the service. | Add the constants module and a single test that asserts the conflict target string matches the migration definition. | `extract` |
| 8 | Mixed client model (reads bypass RLS, writes rely on explicit checks) | Files: `src/lib/services/user-admin.ts:57-60` (service-role reads) vs. `src/pages/api/admin/users/[id]/grant.ts:51-55` and `revoke.ts:49-53` (cookie-backed writes with target-role check). DB: `auth.users`, `user_roles`, `user_book_access`. RLS policies exist and already enforce admin-only writes. | `user-admin.test.ts`, api-contract, and E2E cover current behavior. No dual-read comparison between service-role and RLS-backed reads. | **Branch by Abstraction / Strangler Fig:** Introduce an `AccessReadModel` interface. Implement `ServiceRoleAccessReadModel` (current) and an `RlsAccessReadModel` that uses the cookie client and RLS policies. Run both behind a feature flag, compare outputs, then switch. Writes can later rely on RLS policies as the source of truth. | Define the `AccessReadModel` interface and a feature-flagged dual-read experiment; add one comparison test. | `defer` |
| 9 | Optimistic UI not tested | File: `src/components/admin/UsersTable.tsx:57-136` (grant optimistic update/rollback) and `140-195` (revoke) [evidence]. No DB/RLS impact. | E2E verifies final visible state after grant/revoke; does not exercise failure rollback or race conditions. | **Guard:** Add component-level tests with mocked `fetch`, or extract the optimistic state transitions into a small reducer/hook and unit-test it. | Decide between React Testing Library component tests or extracting an `useOptimisticUsers` reducer; add the first failing test for rollback. | `guard` |
| 10 | Prior delete/restore churn | Historical context only (deleted in `e2884e9`, restored in `f2d8e3c` [evidence]). No direct code blast radius. | No automated test can detect historical churn. | Monitor during review; do not refactor. Ensure any future admin-user changes include API-contract tests so churn is visible. | None. | `defer` |

---

## Detailed migration notes

### 1. Role-guard centralization (#2)

- **Why it is safe:** The check is a pure predicate on `locals.role`. A helper can return the exact same `Response.json({ error: "Forbidden" }, { status: 403 })` for API routes and the same redirect URL for pages.
- **Risk:** Middleware already redirects non-admins from `/admin/*`; if the helper is omitted in a new route, middleware is still a backstop. The refactor therefore does not reduce security while in progress.
- **Order of attack:**
  1. Add `requireAdminApi` and `requireAdminPage` to `src/lib/guards.ts` with unit tests.
  2. Migrate `src/pages/api/admin/users.ts`, `grant.ts`, `revoke.ts`.
  3. Migrate `src/pages/admin/users.astro`.
  4. Migrate remaining admin resources one per PR to keep reviews small.
  5. Once all call sites use the helper, consider tightening middleware to return JSON for `/api/admin/*` instead of redirecting (optional cleanup).

### 3. Same-origin unification (#3)

- **Why it is safe:** The inline checks and `requireSameOrigin` already return the same 403 JSON in the user flow. The remaining routes also return 403 JSON on origin failure, so swapping in the helper is behavior-preserving.
- **Caveat:** The inline checks do **not** look at `sec-fetch-site`. Moving them to `requireSameOrigin` slightly tightens security in browsers that send the header. This is desirable but should be mentioned in the PR.
- **Order of attack:**
  1. Add a cross-origin API-contract test for `POST /api/admin/books` (or another non-user route).
  2. Migrate that route to `requireSameOrigin`.
  3. Repeat for chapters, lessons, exercises routes.

### 4. Shared `BookOption` and response schema (#4)

- **Why it is safe:** The duplicate is type-only; extracting it is a no-op at runtime. Adding a Zod schema for the API response only tightens validation in `refetchUsers`.
- **Shape suggestion:**
  - Move `BookOption` next to `UserWithAccess` in `src/lib/services/user-admin.ts`.
  - Define `AdminUsersResponseSchema = z.object({ users: z.array(UserWithAccessSchema), page: z.number(), perPage: z.number(), hasNextPage: z.boolean() })`.
  - Use it in `refetchUsers` to parse instead of casting.

### 5. Service-role auth listing (#5)

- **Why extract, not rewrite:** The current implementation works for the MVP's email-only seeded users. Rewriting to a `user_profiles` table or a different SDK filter is a behavior change that needs product input on email-less/SSO users.
- **Port shape (suggested):**
  ```ts
  interface UserDirectory {
    listStudents(options: { page: number; perPage: number }): Promise<{ students: StudentProfile[]; hasNextPage: boolean }>;
  }
  ```
- **First step:** Extract the interface and make `user-admin.ts` depend on it, with the existing Supabase implementation. This is pure refactoring with no behavior change and unlocks future swaps.

### 6. RLS override (#6) — out of scope

- This is the clearest example of a **business-domain rethink**. The migration `20260629000000_open_book_access_for_students.sql` intentionally relaxes the model for the MVP. Reverting it changes what students can see, which is a product decision, not a code-structure improvement.
- **Recommendation:** Track it as a separate `access-gating-rethink` change. Do not include it in the refactor backlog.

### 7. DB identifier constants (#7)

- **Why it is safe:** Strings are replaced by constants whose values are identical. Compile-time references remain unchanged.
- **Why it matters:** The composite conflict target `"user_id,book_id"` must match the actual unique constraint/index in the migration. Centralizing it makes schema changes discoverable via a single test.
- **Suggested module:** `src/lib/db/schema.ts` with `export const TABLE_USER_ROLES = "user_roles"; export const CONFLICT_USER_BOOK = "user_id,book_id";`.

### 8. Mixed client model (#8) — defer

- This is the highest-impact architectural change. It intersects directly with #6 (RLS override): there is little value in building an RLS-backed read model while `has_book_access()` returns `true`.
- **Deferred until:** the product decides to re-enable access gating and the `UserDirectory` port from #5 is in place.

### 9. Optimistic UI tests (#9)

- This is a test gap, not a structural problem. If component tests are not wanted, the optimistic logic can be extracted into a reducer/hook and unit-tested with Vitest.
- **First step:** Add a failing unit test for rollback behavior after a mocked 500 grant response.

---

## Ranked recommendation

| Rank | Candidate | Action | Effort | Risk | Value |
|------|-----------|--------|--------|------|-------|
| 1 | #4 Shared `BookOption`/response schema | Extract | Low | Very low | Prevents silent API drift |
| 2 | #7 DB identifier constants | Extract | Low | Very low | Makes schema changes safe |
| 3 | #2 Centralize admin role guard | Extract | Medium | Low | Removes 29 copy-pasted checks |
| 4 | #3 Unify same-origin checks | Extract | Medium | Low | Closes 12 inconsistent guards |
| 5 | #5 User directory port | Extract | Medium | Low | Unlocks future listing changes |
| 6 | #1 Missing unit/API-contract tests | Guard | Medium | Low | Catches regressions |
| 7 | #9 Optimistic UI tests | Guard | Low | Low | Component/hook coverage |
| 8 | #8 RLS-backed read model | Defer | High | High | Wait for #6 decision |
| 9 | #6 RLS override / access gating | Out-of-scope | N/A | N/A | Business-domain rethink |
| 10 | #10 Delete/restore churn | Defer | None | None | Historical context only |

---

## Evidence / inference / unknown tags

- `[evidence: file:line]` — directly observed in the repo.
- `[inference]` — derived from the observed code/test structure.
- `[unknown]` — cannot be answered from the repo; requires product or ops input.

Key unknowns retained from the prior analysis:

- Are email-less Supabase Auth users (SSO/phone) expected? [unknown]
- Is the `books limit 100` in `users.astro` sufficient for production? [unknown]
- Do production proxies/CDNs preserve `sec-fetch-site`/`origin` headers required by `requireSameOrigin`? [unknown]
- Will the RLS override be reverted before or after MVP? [unknown — drives #6/#8]
