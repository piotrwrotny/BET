# Plan — Refactor opportunities for admin user & book-access flow

> **Change:** `refactor-opportunities`  
> **Research:** `context/changes/refactor-opportunities/research.md`  
> **Decision:** Implement the two smallest, behavior-preserving extractions first (shared `BookOption`/response schema + DB identifier constants), then centralize the admin-role guard for the user/book-access flow. Defer security-model and business-domain decisions.

## Overview

This plan executes the top-ranked refactor opportunities from `research.md`. It does **not** change authorization semantics, RLS policies, or the service-role read model. The goal is to remove duplication and hard-coded strings that have no design justification, while adding tests before touching production code.

## What we're NOT doing

- Reverting or modifying the open-access RLS override (business-domain decision).
- Replacing the service-role `auth.admin.listUsers()` read path with an RLS-backed model (security-model decision, blocked on RLS override).
- Rewriting the optimistic UI in `UsersTable.tsx` (test gap, not structural refactor).
- Migrating the remaining 11 inline same-origin checks in books/chapters/lessons/exercises routes (out of scope for this change; can be a follow-up after the role guard lands).

## Risks covered

| Risk from research | How this plan addresses it |
|--------------------|----------------------------|
| Silent API response drift between `/api/admin/users` and `UsersTable.tsx` | Phase 1 adds a Zod schema and replaces the cast with `parse()`. |
| Schema identifiers scattered as string literals | Phase 1 centralizes table names and conflict targets; tests assert values match generated types. |
| Authorization guard duplication creating update holes | Phase 2 extracts `requireAdmin` helpers and migrates the user/book-access flow first. |
| Refactor accidentally changes behavior | Each phase starts with a characterization/guard test; changes are small and reversible. |

## Phases

### Phase 1 — Extract shared schema types and constants

**Goal:** Remove duplicated `BookOption`, add runtime validation of the `/api/admin/users` response, and centralize the table/constraint identifiers used by the user/book-access flow.

**Order is test-first:**
1. Add a characterization test for the current `/api/admin/users` JSON response shape.
2. Add `src/lib/db/schema.test.ts` asserting constant values match `src/lib/database.types.ts` keys.
3. Only then create `src/lib/db/schema.ts` and migrate the user/book-access flow literals.
4. Only then replace the `response.json()` cast with the new Zod schema.

**Files touched:**
- `src/lib/services/user-admin.ts` — add `BookOption` export and `AdminUsersResponseSchema`.
- `src/components/admin/UsersTable.tsx` — import shared `BookOption`; replace cast with schema parse.
- `src/pages/admin/users.astro` — import shared `BookOption`.
- `src/lib/db/schema.ts` — new file with table-name and conflict-target constants.
- `src/middleware.ts`, `src/lib/services/user-admin.ts`, `src/pages/api/admin/users/[id]/grant.ts`, `src/pages/api/admin/users/[id]/revoke.ts` — replace literals with constants.
- `src/lib/db/schema.test.ts` — new test asserting constants match generated types.
- `tests/api-contract/admin-users-response-shape.spec.ts` (or inline in `src/lib/services/user-admin.test.ts`) — characterization test for the JSON shape.

**Contract / acceptance:**
- `BookOption` is declared in exactly one place.
- `refetchUsers` validates the API response with Zod instead of casting.
- No `"user_roles"`, `"user_book_access"`, or `"user_id,book_id"` string literals remain in the immediate user/book-access flow.
- `npm run test:unit`, `npm run lint`, and `npm run typecheck` pass.

**Verification:**
- Automated: `npm run test:unit`, `npm run lint`, `npm run typecheck`.
- Manual: run `node -e "const fs=require('fs'); const re=/user_roles|user_book_access|onConflict:\s*['\"]user_id,book_id['\"]/g; const hits=[]; for (const f of ['src/middleware.ts','src/lib/services/user-admin.ts','src/pages/api/admin/users.ts','src/pages/api/admin/users/[id]/grant.ts','src/pages/api/admin/users/[id]/revoke.ts']) { const m=fs.readFileSync(f,'utf8').match(re); if (m) hits.push(...m.map(x=>f+': '+x)); } console.log(hits.join('\n') || 'no hard-coded identifiers')"` and confirm only the new constants file remains as a source (generated types excluded).

### Phase 2 — Characterization tests for existing role-guard behavior

**Goal:** Pin the current behavior of the admin-role checks in the user/book-access flow before replacing them with a helper.

**Files touched:**
- `src/lib/guards.test.ts` — extend with `requireAdminApi` / `requireAdminPage` unit tests.
- `tests/api-contract/admin-users.spec.ts` — ensure existing role-rejection cases still pass (already covers most).
- `tests/e2e/admin-users-unauthorized.spec.ts` — ensure non-admin redirect still passes.

**Contract / acceptance:**
- New helpers return the exact same status/message/redirect as the inline checks they replace.
- Existing API contract and E2E tests remain green.

**Verification:**
- Automated: `npm run test:unit`.

### Phase 3 — Centralize admin-role guard in user/book-access flow

**Goal:** Replace inline role checks with shared helpers in middleware, page, and the three API routes of the user/book-access flow.

**Helper contract:**
- `requireAdminApi(locals)` returns `Response.json({ error: "Forbidden" }, { status: 403 })` when `locals.role !== "admin"`; otherwise returns `null`. The caller must do `if (const denied = requireAdminApi(locals)) return denied;`.
- `requireAdminPage(Astro)` returns `Astro.redirect("/dashboard")` when `Astro.locals.role !== "admin"`; otherwise returns `null`. The caller must do `if (const redirect = requireAdminPage(Astro)) return redirect;` so page execution stops immediately.

**Files touched:**
- `src/lib/guards.ts` — add `requireAdminApi(locals)` and `requireAdminPage(Astro)` helpers.
- `src/middleware.ts` — optional: keep using inline check or switch to helper (see notes).
- `src/pages/admin/users.astro` — use `requireAdminPage`.
- `src/pages/api/admin/users.ts`, `grant.ts`, `revoke.ts` — use `requireAdminApi`.

**Contract / acceptance:**
- No inline `role !== "admin"` check remains in the user/book-access flow.
- Behavior is unchanged: non-admins get 403 from APIs and redirect from the page.
- `npm run test:unit`, `npm run lint`, `npm run typecheck` pass.

**Verification:**
- Automated: `npm run test:unit`, `npm run lint`, `npm run typecheck`, `npx playwright test --project=api-contract` (requires local Supabase).
- Manual: `grep 'role !== "admin"' src/pages/admin/users.astro src/pages/api/admin/users.ts src/pages/api/admin/users/*/*.ts` returns empty.

### Phase 4 — Roll out `requireAdmin` to remaining admin surface (optional follow-up)

**Goal:** Remove the remaining inline role checks across the four other admin resources.

**Scope (from research verification):**
- `src/pages/api/admin/books/*.ts` — 3 occurrences.
- `src/pages/api/admin/chapters/*.ts` — 3 occurrences.
- `src/pages/api/admin/lessons/*.ts` — 3 occurrences.
- `src/pages/api/admin/exercises/*.ts` — 3 occurrences.
- `src/pages/admin/books/**/*.astro`, `chapters/**/*.astro`, `lessons/**/*.astro`, `exercises/**/*.astro` — 11 occurrences.
- Total: ~23 occurrences outside the user/book-access flow.

**Notes:**
- This phase is deliberately kept out of this change's scope. It can be opened as a separate, narrow change once Phase 3 is green.
- Each resource (books, chapters, lessons, exercises) should be migrated in its own commit to keep reviews small.

## Verification commands

```bash
npm run test:unit
npm run lint
npm run typecheck
npx playwright test --project=api-contract   # blocked if local Supabase is unavailable
```

## Rollback strategy

Each phase is a separate commit. If anything breaks:
- Phase 1: revert the constants/types commit; string literals are restored.
- Phase 2: revert test additions only.
- Phase 3: revert the helper migration commit; inline checks are restored.

## Progress

### Automated

- [x] 1.1 Add a characterization test for the current `/api/admin/users` JSON response shape. — 60b1924
- [x] 1.2 Add `src/lib/db/schema.test.ts` asserting constant values match generated types. — 60b1924
- [x] 1.3 Add `BookOption` export and `AdminUsersResponseSchema` to `src/lib/services/user-admin.ts`. — 60b1924
- [x] 1.4 Create `src/lib/db/schema.ts` and migrate user/book-access flow literals. — 60b1924
- [x] 1.5 Replace `BookOption` declarations in `users.astro` and `UsersTable.tsx` with shared import. — 60b1924
- [x] 1.6 Replace `response.json()` cast in `UsersTable.tsx` with Zod parse. — 60b1924
- [x] 1.7 Run lint + typecheck + unit tests. — 60b1924
- [x] 2.1 Add unit tests for `requireAdminApi` / `requireAdminPage` in `src/lib/guards.test.ts`. — a082651
- [x] 3.1 Add `requireAdminApi` / `requireAdminPage` to `src/lib/guards.ts`.
- [x] 3.2 Migrate user/book-access flow role checks to helpers.
- [x] 3.3 Run lint + typecheck + unit tests.

### Manual

- [x] M.1 Review that the Zod schema does not reject extra fields the UI currently ignores. — 60b1924
- [x] M.2 Confirm `schema.ts` constant values match the production migrations. — 60b1924
- [x] M.3 Verify API contract tests still reject non-admin callers after Phase 3.

## Decision log

| Decision | Why |
|----------|-----|
| Start with #1 and #2 (BookOption + schema constants) | Smallest blast radius, zero behavior change, builds a shared `lib/db/schema.ts` home for later phases. |
| Add role-guard centralization only for the user/book-access flow | Keeps the change narrow; remaining admin surface gets its own follow-up change. |
| Defer service-role listing extraction | Behavior-sensitive; needs a characterization test and a product decision on email-less/SSO users. |
| Defer RLS override and mixed-client model | Business/security-model decisions, not code-structure refactors. |
