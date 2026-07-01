# Research — Refactor opportunities for admin user & book-access flow

> **Change:** `refactor-opportunities`  
> **Source analysis:** `context/changes/admin-user-access-analysis/research.md`  
> **Branch:** `module-4`  
> **Date:** 2026-07-01  
> **Tags:** refactor-opportunities, verified

## 1. Intention of this change

The previous analysis (`admin-user-access-analysis`) documented technical debt and
structural risks in the admin user/book-access flow. It deliberately left open
the question: **which of those problems are worth fixing, in what target shape,
and in what order?** This report answers that question.

Scope is strictly research and ranking. No code was refactored during this
phase; the decision on what to implement will be recorded in `plan.md`.

## 2. Candidate list and classification

The prior analysis listed 10 debt items. Only items that require a change to
*production code structure* are treated as refactor candidates here. Missing
tests, RLS timing, and historical churn are supporting evidence, not refactor
targets.

| # | Debt item | Classification | Why |
|---|-----------|--------------|-----|
| 1 | E2E-only coverage | Supporting evidence | Test gap; partially closed by Phase 2 (`user-admin.test.ts`, `guards.test.ts`, `tests/api-contract/admin-users.spec.ts`). |
| 2 | Triplicated `locals.role === "admin"` guard | **Candidate** | Inline authorization logic repeated across the admin surface. |
| 3 | Duplicated same-origin / CSRF guard | Partially addressed | Already extracted to `src/lib/guards.ts` for the user/grant/revoke routes in Phase 2. |
| 4 | Duplicated `BookOption` + manual fetch cast | **Candidate** | Shared projection type missing; runtime API response unchecked. |
| 5 | Fragile service-role auth listing | **Candidate** | One function mixes SDK pagination, filtering, chunking, joining, and sorting. |
| 6 | Temporary RLS override | Supporting evidence / domain decision | Conscious MVP policy; not a code-structure refactor. |
| 7 | Hard-coded table names and conflict target | **Candidate** | Schema identifiers scattered as string literals. |
| 8 | Mixed client model (reads bypass RLS, writes rely on explicit checks) | Architectural risk / defer | Split forced by Supabase Auth capabilities; changing it is a security-model decision. |
| 9 | Optimistic UI not tested | Supporting evidence | Test gap, not production structure. |
| 10 | Prior delete/restore churn | Historical context | Informs risk assessment, not a refactor target. |

## 3. Per-candidate findings

### 3.1 Centralize the admin-role guard

**Current shape (evidence):**
- `src/middleware.ts:37` redirects non-admins from `/admin/*`.
- `src/pages/admin/users.astro:13` re-checks `Astro.locals.role !== "admin"`.
- `src/pages/api/admin/users.ts:18`, `grant.ts:19`, `revoke.ts:19` each return 403 for the same condition.
- ast-grep verification (§7) found **16 occurrences in `.ts` files** and **12 occurrences in `.astro` admin pages** — **28 total across the admin surface**.

**History / intentionality (evidence):**
- The guard was introduced as defense-in-depth in commit `e2884e9` ("Add local admin role guards to all admin pages").
- No shared helper was created at that time; the restore commit `f2d8e3c` preserved the copy-paste pattern.
- **Verdict:** accidental complexity. The repetition is a speed/MVP artifact, not an intentional design.

**Feasibility (inference):**
- Safe to extract: the predicate is pure (`locals.role !== "admin"`).
- Two helpers are needed because API routes return `Response.json(..., 403)` while Astro pages return `Astro.redirect("/dashboard")`.
- Middleware remains a backstop during migration, so security is not weakened while the refactor is in progress.
- Blast radius: 28 call sites, but migration can happen route-by-route (Strangler Fig).

### 3.2 Share `BookOption` and validate the refetch response

**Current shape (evidence):**
- `src/pages/admin/users.astro:8-11` declares `interface BookOption { id: string; title: string; }`.
- `src/components/admin/UsersTable.tsx:15-18` declares the identical interface.
- `UsersTable.tsx:42` casts `response.json()` to `{ users?: UserWithAccess[] }` with no runtime validation.

**History / intentionality (evidence):**
- Both declarations were introduced in the same restore commit `f2d8e3c`.
- No design reason to keep them separate; the type is a trivial projection of the `books` table.
- **Verdict:** accidental complexity.

**Feasibility (evidence + inference):**
- Type-only extraction is a no-op at runtime.
- `zod` is already used for request validation in `grant.ts`/`revoke.ts`; the same dependency can validate the `GET /api/admin/users` response.
- Blast radius: 2 declaration sites + 1 fetch cast; very low risk.

### 3.3 Split the fragile service-role auth listing

**Current shape (evidence):**
- `src/lib/services/user-admin.ts:56-148` is a single transaction script:
  - `auth.admin.listUsers({ page, perPage: perPage + 1 })` at line 60.
  - Client-side email filtering at line 64.
  - `hasNextPage` computed after filtering at line 65.
  - Chunked batch queries against `user_roles`/`user_book_access` at lines 73-90.
  - Manual joining/aggregation/sorting at lines 103-147.
- It is the only production caller of `createAdminClient()` and `auth.admin.listUsers()`.

**History / intentionality (evidence):**
- Original implementation (`2fadf07`) had no pagination.
- `1907497` retrofitted `page/perPage` after an impl-review finding; email filtering remained client-side because the Supabase Auth SDK does not filter by email presence.
- **Verdict:** accidental complexity. The current shape is a quick retrofit, not an intentional architecture.

**Feasibility (inference):**
- Behavior must stay unchanged for email-only seeded users.
- A `UserDirectory` port (interface + Supabase implementation) isolates the Supabase Auth dependency and unlocks future swaps.
- Blast radius is small (2 call sites), but the function is security-sensitive, so a characterization test is needed before extraction.

### 3.4 Centralize table names and conflict targets

**Current shape (evidence):**
- `"user_roles"` literals in `src/middleware.ts:17`, `src/lib/services/user-admin.ts:83`, `grant.ts:52`, `revoke.ts:50`.
- `"user_book_access"` literals in `src/lib/services/user-admin.ts:87`, `grant.ts:61`, `revoke.ts:60`.
- `onConflict: "user_id,book_id"` in `grant.ts:67`.
- A similar pattern exists outside the flow at `src/pages/api/lessons/[id]/complete.ts:31` (`onConflict: "user_id,lesson_id"`).

**History / intentionality (evidence):**
- Direct Supabase SDK string usage is the dominant pattern across S-02 admin APIs.
- No schema rename has occurred, so the risk is latent, not active.
- **Verdict:** accidental complexity.

**Feasibility (evidence):**
- Replacing literals with constants is behavior-preserving.
- A single `src/lib/db/schema.ts` module can own table names and conflict targets; tests can assert that constant values match the generated schema.
- Blast radius: 4 production files, 7 table-name literals, 1 conflict target in the immediate flow.

### 3.5 Reconcile the mixed client authorization model

**Current shape (evidence):**
- Reads (`getStudentsWithAccess`) use `createAdminClient()` at `src/lib/services/user-admin.ts:58` and bypass RLS.
- Writes (`grant.ts`, `revoke.ts`) use `createClient()` with explicit admin + target-student checks.

**History / intentionality (evidence):**
- Supabase `auth.admin.listUsers()` requires a service-role key; it cannot be called through RLS.
- Writes use the cookie-backed client so RLS policies enforce admin-only mutations on `user_book_access`.
- **Verdict:** intentional constraint. The split is forced by Supabase Auth capabilities.

**Feasibility (inference):**
- Refactoring this means changing the security model, not just the code structure.
- It should be deferred until the product decides to re-enable access gating (related to the RLS override decision).

### 3.6 Same-origin guard (status after Phase 2)

- `src/lib/guards.ts:7` defines `requireSameOrigin(request)`.
- The user/grant/revoke routes already import it (`src/pages/api/admin/users.ts:2`, `grant.ts:3`, `revoke.ts:3`).
- **11 inline same-origin blocks remain** in books/chapters/lessons/exercises admin API routes (verified in §7).
- This is a related, smaller extraction opportunity, but it sits outside the user/book-access flow.

## 4. Refactor opportunities (ranked)

### 1. Extract shared `BookOption` + response schema

- **Current → target shape:** duplicated `BookOption` interface + unchecked `response.json()` cast → single shared type plus a Zod schema for `GET /api/admin/users`.
- **Why rank #1:** tiny blast radius, zero runtime risk, prevents silent API drift.
- **Blast radius:** `src/pages/admin/users.astro`, `src/components/admin/UsersTable.tsx`, `src/lib/services/user-admin.ts`.
- **Incremental path:**
  1. Move `BookOption` next to `UserWithAccess` in `src/lib/services/user-admin.ts` (or a new `src/lib/schemas/admin.ts`).
  2. Add `AdminUsersResponseSchema` with `zod`.
  3. Replace the cast in `UsersTable.tsx` with `schema.parse()`.
- **First prerequisite:** none; pure extraction.

### 2. Centralize DB table names and conflict targets

- **Current → target shape:** hard-coded `"user_roles"`, `"user_book_access"`, `"user_id,book_id"` literals → constants exported from `src/lib/db/schema.ts`.
- **Why rank #2:** very low risk, makes future schema changes discoverable, pairs naturally with #1 as a "schema constants" commit.
- **Blast radius:** `src/middleware.ts`, `src/lib/services/user-admin.ts`, `grant.ts`, `revoke.ts`.
- **Incremental path:**
  1. Create `src/lib/db/schema.ts` with `TABLE_USER_ROLES`, `TABLE_USER_BOOK_ACCESS`, `CONFLICT_USER_BOOK_ACCESS`.
  2. Replace literals in the user/book-access flow first.
  3. Add a test asserting constant values match the generated `database.types.ts` keys.
- **First prerequisite:** decide whether to scope the constants to the user/book-access flow or to all admin tables.

### 3. Centralize the admin-role guard

- **Current → target shape:** 28 inline `locals.role !== "admin"` checks → `requireAdmin(locals)` / `requireAdminPage(Astro)` helpers in `src/lib/guards.ts`.
- **Why rank #3:** high leverage (28 call sites), but touches more files and needs two helper shapes (API vs page).
- **Blast radius:** full admin surface (middleware + pages + API routes).
- **Incremental path:**
  1. Add `requireAdminApi` and `requireAdminPage` helpers with unit tests.
  2. Migrate the user/book-access flow first (`users.ts`, `grant.ts`, `revoke.ts`, `users.astro`).
  3. Migrate remaining admin routes one resource at a time.
- **First prerequisite:** add unit tests for the helpers before touching call sites.

## 5. Candidates considered and rejected

| Candidate | Reason for rejection |
|-----------|---------------------|
| Same-origin guard duplication | Already resolved in Phase 2 for the user flow; remaining inline checks are in other admin routes and can be handled as a follow-up to #3 above. |
| Fragile service-role auth listing | Worth doing, but behavior-sensitive; recommended as **#4 follow-up** after the smaller extractions land and test coverage is stable. |
| Temporary RLS override | Business-domain decision, not a structural refactor. Track separately. |
| Mixed client model | Intentional constraint forced by Supabase Auth. Defer until access-gating product decision is made. |
| Optimistic UI not tested | Test gap, not production code structure. |
| Prior delete/restore churn | Historical context only. |

## 6. Unknowns requiring product/ops input

- Are email-less Supabase Auth users (SSO/phone-only) expected in production? This affects whether #5 (service-role listing) needs a different query strategy.
- Is the `books limit 100` in `users.astro` a permanent cap or a temporary MVP guard?
- Will the RLS override be reverted before or after MVP? This gates any work on #8 (mixed client model).
- Do production proxies/CDNs preserve `sec-fetch-site`/`origin` headers required by `requireSameOrigin`?

## 7. Verification of structural claims (ast-grep)

Selected structural claims from the three exploration reports were verified with
`ast-grep` and cross-checked with `grep` where ast-grep returned zero matches.

| Claim | Verification method | Result |
|-------|--------------------|--------|
| `locals.role !== "admin"` occurs 28 times across admin surface | `npx ast-grep -p 'locals.role !== "admin"' -l ts src` → 16 hits; `grep 'Astro\.locals\.role !== "admin"' src/pages/admin` → 12 hits | **Confirmed: 28 total** (report had 29; recheck found 28). |
| Inline same-origin checks remain outside user flow | `grep 'Invalid origin' src/pages/api/admin` | **Confirmed: 11 inline blocks** in books/chapters/lessons/exercises routes (report had 12; recheck found 11). |
| `BookOption` interface is duplicated | `npx ast-grep -p 'interface BookOption { $$$ }'` | **Confirmed:** `src/pages/admin/users.astro:8` and `src/components/admin/UsersTable.tsx:15`. |
| Hard-coded `user_roles` / `user_book_access` literals | `grep -R 'user_roles\|user_book_access\|onConflict: "user_id,book_id"' src` | **Confirmed:** 7 production literals plus generated types. |
| `createAdminClient()` is only used in `user-admin.ts` | `grep -R 'createAdminClient()' src` | **Confirmed:** single production call site at `src/lib/services/user-admin.ts:58`. |
| `requireSameOrigin` already imported by user/grant/revoke | `grep 'requireSameOrigin' src/pages/api/admin/users*.ts` | **Confirmed:** used in `users.ts`, `grant.ts`, `revoke.ts`. |

### Reproduction commands

```bash
# role checks in .ts files
npx ast-grep -p 'locals.role !== "admin"' -l ts src

# role checks in .astro pages
grep -R 'Astro\.locals\.role !== "admin"' src/pages/admin

# inline same-origin checks outside user flow
grep -R 'Invalid origin' src/pages/api/admin

# duplicated BookOption
npx ast-grep -p 'interface BookOption { $$$ }' src

# hard-coded DB identifiers
grep -R 'user_roles\|user_book_access\|onConflict: "user_id,book_id"' src

# service-role client usage
grep -R 'createAdminClient()' src
```

## 8. Methodology notes

- Three sub-agents explored in parallel: current shape, history/intentionality, and feasibility.
- All claims are tagged `[evidence]`, `[inference]`, or `[unknown]`.
- No code changes were made during exploration.
- The ranking deliberately stops at structural extraction; security-model and business-domain decisions are excluded.
