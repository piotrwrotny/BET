# Research History — Why the admin user/book-access code has its current shape

> **Target:** `refactor-opportunities`  
> **Source:** `context/changes/admin-user-access-analysis/research.md`  
> **Branch:** `module-4`  
> **Date:** 2026-07-01

## 1. Executive summary

The admin user & book-access cluster was **built in S-03, hardened in a pagination hotfix, deleted as S-02 scope drift, then restored as a stand-alone change** — all within three days (2026-06-26 to 2026-06-29). That churn explains why several "duplicated" patterns exist: the code was rebuilt quickly from the pre-deletion version, and some S-02 hardening rules (local admin guard, same-origin check) were applied uniformly without first extracting shared helpers.

Of the technical-debt items flagged in the prior analysis:

- **Same-origin guard duplication** is already fixed in `HEAD` (`ea70cf0` extracted `requireSameOrigin` into `src/lib/guards.ts`).
- **Role-guard duplication**, **duplicated `BookOption`**, **fragile auth listing**, and **hard-coded DB identifiers** are refactor candidates rooted in speed/MVP pragmatism, not architecture.
- **Mixed client model** (service-role reads vs. cookie-client writes) is an **intentional constraint** forced by Supabase Auth.
- **Open-access RLS override** is an **intentional MVP constraint** documented in the S-02 implementation review.
- **Missing tests** and **untested optimistic UI** are test gaps, not structural refactor candidates.

## 2. Timeline of the delete/restore churn

| Commit | Date | What happened | Why |
|--------|------|---------------|-----|
| `2fadf07` | 2026-06-26 14:51 | Backend for S-03 admin-user-and-access-mgmt | Original implementation: `createAdminClient()`, `GET /api/admin/users`, `grant.ts`, `revoke.ts` |
| `46de5b5` | 2026-06-26 15:24 | Frontend: `UsersTable.tsx`, `/admin/users.astro` | TanStack Table island, inline Select grant/revoke |
| `88208fd` | 2026-06-26 17:10 | Pagination fix p1: full `listUsers()` loop + student scope | Fixed "51+ users silently cut off" and "admins visible" bugs |
| `735c4e8` | 2026-06-26 19:28 | Pagination fix p2: hard error UX on `/admin/users` | SSR page fails closed instead of showing partial data |
| `8671751` | 2026-06-26 20:00 | Review fixes: error masking, chunking, pagination cap | Added `MAX_AUTH_PAGES`, `chunk()` helper, generic error messages |
| `e2884e9` | 2026-06-29 13:05 | **Deleted** `users.astro`, `users.ts`, `grant.ts`, `revoke.ts`, `user-admin.ts` | S-02 implementation review ruled user management was scope drift (see `context/archive/2026-06-26-admin-content-creation/reviews/impl-review.md:F2`) |
| `5c84abb` | 2026-06-29 13:05 | Created new change folder for admin-user-book-access-management | Context-only commit recording the extraction from S-02 |
| `f2d8e3c` | 2026-06-29 13:36 | **Restored** the entire cluster as `feat(admin): restore user management panel` | Restored from pre-deletion state; commit message says "restore user management panel" |
| `1907497` | 2026-06-29 13:48 | Addressed impl-review findings: pagination, skip users without role, target-role check | Converted `getStudentsWithAccess()` from "fetch all" to `page/perPage` with `perPage + 1` lookahead |
| `21f4f63` | 2026-06-29 14:48 | Added `Sec-Fetch-Site: same-origin` to CSRF guard | Browsers omit `Origin` on same-origin fetch; this keeps legitimate React-island calls working |
| `8b2a68d` | 2026-06-29 15:59 | E2E tests for admin user management | Playwright coverage only |
| `ea70cf0` | 2026-07-01 21:02 | Extracted `requireSameOrigin` to `src/lib/guards.ts` + added `src/lib/services/user-admin.test.ts` + `tests/api-contract/admin-users.spec.ts` | Post-analysis cleanup that closed the same-origin duplication |

## 3. Verdict table

| Candidate from prior analysis | Verdict | Evidence | Why this shape exists |
|------------------------------|---------|----------|----------------------|
| **2. Triplicated `locals.role === "admin"` guard** | accidental complexity | `src/middleware.ts:37` (`acf4541`); `src/pages/admin/users.astro:13` (`f2d8e3c`); `src/pages/api/admin/users.ts:18`, `grant.ts:19`, `revoke.ts:19` (`f2d8e3c`) | Defense-in-depth pattern introduced in S-02 (`e2884e9` message: "Add local admin role guards to all admin pages"). No shared helper was created at the time, so every admin surface repeats the inline check. |
| **3. Duplicated same-origin check** | accidental complexity (already refactored in `HEAD`) | Before `ea70cf0`: inline `function requireSameOrigin(...)` existed in `users.ts`, `grant.ts`, `revoke.ts` (visible in `ea70cf0^`). After `ea70cf0`: single `src/lib/guards.ts` imported by all three. | The S-02 impl-review (`e2884e9`) added Origin/Referer CSRF protection to every admin API route by copy-paste. `ea70cf0` later recognized the duplication and extracted it, adding unit tests in `src/lib/guards.test.ts`. |
| **4. Duplicated `BookOption` interface + manual fetch cast** | accidental complexity | `src/pages/admin/users.astro:8-11` (`f2d8e3c`); `src/components/admin/UsersTable.tsx:15-18` (`f2d8e3c`); `refetchUsers` casts `response.json()` to `{ users?: UserWithAccess[] }` | The Astro frontmatter fetches books for the grant dropdown and the React island needs the same lightweight `{ id, title }` shape. There is no shared DTO for "book option"; the type is trivial and was duplicated during the restore. |
| **5. Fragile service-role auth listing** | accidental complexity | `src/lib/services/user-admin.ts:55-64` (`1907497`); original full-iteration version at `e2884e9^:src/lib/services/user-admin.ts:35-94` (`8671751`) | Pagination was retrofitted in `1907497` after the impl-review flagged "loads all users without pagination" as critical. The current `perPage + 1` lookahead is a quick server-page implementation; email filtering still happens client-side because `auth.admin.listUsers` does not support filtering by email presence. |
| **6. Temporary RLS override decouples grants from access** | intentional constraint | `supabase/migrations/20260629000000_open_book_access_for_students.sql` (no git blame — single-file migration); S-02 impl-review `context/archive/2026-06-26-admin-content-creation/reviews/impl-review.md:F9` | Conscious MVP decision. The S-02 impl-review required opening book access so newly created books would be visible on the student dashboard without seeding `user_book_access`. `admin-user-book-access-management/plan.md` explicitly states: "Nie przywracamy `user_book_access` jako gate'a dostępu". |
| **7. Hard-coded DB conflict target and table names** | accidental complexity | `grant.ts:67-69` (`onConflict: "user_id,book_id"`, `f2d8e3c`); `grant.ts:61` `from("user_book_access")` (`f2d8e3c`); `revoke.ts:60-63` (`f2d8e3c`); `user-admin.ts:83,87` (`f2d8e3c`) | Direct Supabase SDK usage without a repository/schema abstraction layer. This is the dominant pattern in the codebase (all S-02 admin APIs use string table names). Introduced for speed, not for correctness. |
| **8. Mixed client model (reads bypass RLS, writes rely on explicit checks)** | intentional constraint | `user-admin.ts:58` uses `createAdminClient()` (`f2d8e3c`); `grant.ts:46` and `revoke.ts:44` use `createClient()` (`f2d8e3c`); target-role check added in `1907497` | Supabase `auth.users` cannot be listed through RLS with an anon/session key — only `service_role` can enumerate all users (`Context7` + Supabase docs, captured in `context/archive/2026-06-26-admin-user-and-access-mgmt/research.md`). Writes use the cookie-backed client so RLS enforces admin-only `INSERT/DELETE` on `user_book_access`; the extra target-student check is defense-in-depth added after impl-review F3. |
| **9. Optimistic UI not tested** | test gap (not refactor) | `src/components/admin/UsersTable.tsx` has no unit/component tests; covered only by `tests/e2e/admin-users.spec.ts` (`8b2a68d`) | Out of scope for MVP; plan explicitly said "Testy jednostkowe — brak (MVP, main_goal=speed)". |
| **10. Prior delete/restore churn** | historical context (not candidate) | `e2884e9` deleted files; `f2d8e3c` restored them | Provides context that the current code is a rebuild of the S-03 implementation, not a fresh design. |
| **1. E2E-only coverage** | test gap (not refactor) | `src/lib/services/user-admin.test.ts` was added in `ea70cf0`, but API-route role/CSRF/unit paths and component tests are still missing | This is a coverage gap, not a structural shape decision. |

## 4. Evidence details by candidate

### 4.1 Triplicated admin role guard (accidental)

- `src/middleware.ts:37` — blame `acf4541` `2026-06-26 12:52` (`feat(admin-content-creation): infrastructure — middleware guard ...`).
- `src/pages/admin/users.astro:13` — blame `f2d8e3c`.
- `src/pages/api/admin/users.ts:18`, `grant.ts:19`, `revoke.ts:19` — blame `f2d8e3c`.
- The pattern is also repeated across every other S-02 admin API (`books`, `chapters`, `lessons`, `exercises`).
- Commit `e2884e9` message explicitly says: "Add local admin role guards to all admin pages" — the intent was defense-in-depth, not duplication.

**Verdict:** accidental complexity. The repeated guard is a copy-paste artifact of the S-02 hardening. A single `requireAdmin(locals)` helper in `src/lib/guards.ts` would remove the duplication without weakening security.

### 4.2 Duplicated same-origin check (accidental, fixed in `HEAD`)

- Before `ea70cf0`, each of `users.ts`, `grant.ts`, `revoke.ts` contained an inline `function requireSameOrigin(request: Request): Response | null`.
- `ea70cf0` extracted it to `src/lib/guards.ts` and added `src/lib/guards.test.ts`.
- `21f4f63` added `Sec-Fetch-Site` support; that fix lives in the shared guard after `ea70cf0`.

**Verdict:** accidental complexity. The duplication was recognized and resolved after the prior analysis.

### 4.3 Duplicated `BookOption` (accidental)

- `src/pages/admin/users.astro:8-11` defines `interface BookOption { id: string; title: string; }`.
- `src/components/admin/UsersTable.tsx:15-18` defines the identical interface.
- Both originate from `f2d8e3c` (restore commit) and were not unified afterward.

**Verdict:** accidental complexity. The type is a trivial projection of the `books` table with no business behavior; it was duplicated because the page and the island were authored in the same restore commit.

### 4.4 Fragile service-role auth listing (accidental)

- `src/lib/services/user-admin.ts:55-64` calls `supabaseAdmin.auth.admin.listUsers({ page, perPage: perPage + 1 })`, filters email-less users, and slices to `perPage`.
- Earlier shape (`8671751`, visible at `e2884e9^`) iterated all pages with `MAX_AUTH_PAGES` cap and threw on missing roles.
- `1907497` replaced the full iteration with per-page pagination after impl-review F1 ("loads all users without pagination").
- `1907497` also removed the "missing role" throw and made users without role silently skipped.

**Verdict:** accidental complexity. The current pagination is a quick retrofit to satisfy the impl-review. Email filtering after pagination is a leftover edge case, not an intentional design.

### 4.5 Temporary RLS override (intentional)

- Migration `20260629000000_open_book_access_for_students.sql` redefines `private.has_book_access()` and `private.has_lesson_access()` to return `true`, and drops/re-creates `books_select` policy with `using (true)`.
- S-02 impl-review F9 (`context/archive/2026-06-26-admin-content-creation/reviews/impl-review.md:F9`) states: dashboard was filtering books through `user_book_access`; the fix was to open access for all authenticated students.
- `admin-user-book-access-management/plan.md` explicitly excludes reverting the open-access model.

**Verdict:** intentional constraint. It is a documented, time-bounded MVP decision. Refactoring it means reversing a product decision, not just cleaning code.

### 4.6 Hard-coded DB identifiers (accidental)

- `grant.ts:61-69`: `supabase.from("user_book_access").upsert(..., { onConflict: "user_id,book_id" })`.
- `revoke.ts:59-63`: `supabase.from("user_book_access").delete().eq("user_id", ...).eq("book_id", ...)`.
- `user-admin.ts:83,87`: selects from `"user_roles"` and `"user_book_access"`.

**Verdict:** accidental complexity. These identifiers are stable (the schema has not changed), but there is no single source of truth for table/constraint names. This mirrors the rest of the S-02 admin APIs.

### 4.7 Mixed client model (intentional)

- Reads require `createAdminClient()` because `supabase.auth.admin.listUsers()` is only available with the service-role key.
- Writes use `createClient()` because the admin's session has RLS policies allowing `INSERT/DELETE` on `user_book_access`.
- `1907497` added an explicit target-role check (`grant.ts:51-58`, `revoke.ts:49-56`) to ensure the API cannot mutate an admin's access rows.

**Verdict:** intentional constraint. The split is not accidental — it is the only way to list `auth.users` in Supabase while keeping mutations under RLS. A refactor here would need a strong reason to change the security model.

## 5. Unknowns

- Whether SSO/phone-only users are expected in production remains unknown (`user-admin.ts:71` silently drops email-less users).
- Whether the `books limit 100` in `users.astro:36` is a permanent cap or a temporary MVP guard is documented only as a warning-fix in the impl-review (F5).
- The exact reason the restore in `f2d8e3c` did not also extract a shared admin guard is unknown; the commit message focuses on restoring the panel, not on code-quality follow-ups.

## 6. Recommendations for the refactor-opportunities plan

1. **Safe to refactor (accidental):**
   - Extract a shared `requireAdmin(locals)` guard and apply it to middleware, Astro pages, and API routes.
   - Move `BookOption` to a shared type (e.g., derive it from `src/lib/database.types.ts` or a small `src/lib/admin.ts` module).
   - Centralize table/constraint identifiers behind a schema-constant module.
   - Improve `getStudentsWithAccess` pagination edge cases (email filtering, empty-page handling) — but keep the service-role read path.

2. **Do not refactor without product decision:**
   - The open-access RLS override.
   - The mixed client model (service-role reads + cookie-client writes).

3. **Not refactor candidates:**
   - Test gaps should be addressed by adding tests, not by restructuring code.
   - Optimistic UI behavior should be unit-tested, not removed.
