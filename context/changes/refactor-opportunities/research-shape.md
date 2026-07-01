# Current-shape exploration — refactor candidates for admin user/book-access flow

> Source: `context/changes/admin-user-access-analysis/research.md`  
> Branch: `module-4` · Date: 2026-07-01

## 1. How the technical-debt items were classified

The prior analysis listed 10 technical-debt items. Only the ones that require a *change to code structure* are treated as refactor candidates here. Missing tests, RLS policy timing, and prior churn are supporting evidence, not refactor work.

| # | Debt item | Classification | Why |
|---|-----------|----------------|-----|
| 1 | E2E-only coverage | **Supporting evidence** | Test gap; does not change production code structure. Partially closed in Phase 2 (see §7). |
| 2 | Triplicated admin-role guard | **Refactor candidate** | Inline authorization logic repeated across many files. |
| 3 | Duplicated same-origin check | **Partially addressed** | Already extracted to `src/lib/guards.ts` in Phase 2. |
| 4 | Duplicated `BookOption` + manual fetch cast | **Refactor candidate** | Shared type missing; runtime boundary is unchecked. |
| 5 | Fragile service-role auth listing | **Refactor candidate** | One function mixes SDK pagination, filtering, chunking, joining, sorting. |
| 6 | Temporary RLS override | **Supporting evidence** | Policy decision / timing issue; not a code-structure refactor. |
| 7 | Hard-coded table names and conflict target | **Refactor candidate** | Schema identifiers scattered as string literals. |
| 8 | Mixed client model | **Refactor candidate / architectural risk** | Reads bypass RLS while writes rely on explicit checks; authorization intent is split. |
| 9 | Optimistic UI not tested | **Supporting evidence** | Component-level test gap; no production code restructure needed. |
| 10 | Prior delete/restore churn | **Supporting evidence** | Historical context; informs risk, not a refactor target. |

---

## 2. Refactor candidates — current shape

### Candidate 1 — Centralize the admin-role guard

**Current shape:** every protected location repeats the same inline `if`.

- `src/middleware.ts:37` checks `context.locals.role !== "admin"` for all `/admin/*` routes and redirects to `/dashboard`.
- `src/pages/admin/users.astro:13` re-checks `Astro.locals.role !== "admin"` and redirects.
- `src/pages/api/admin/users.ts:18`, `grant.ts:19`, and `revoke.ts:19` each return `Response.json({ error: "Forbidden" }, { status: 403 })` for the same condition.
- The pattern is duplicated across the rest of the admin surface: `grep` found **29 occurrences in 25 files** `[evidence]`:
  - `src/middleware.ts:37` (1)
  - `src/pages/admin/**/*.astro` role re-checks (12 occurrences across the 12 guarded admin pages; `src/pages/admin/index.astro` only redirects and has no explicit role check `[evidence]`)
  - `src/pages/api/admin/**/*.ts` role checks (15 occurrences across 11 API files) `[evidence]`

**Existing abstractions / helpers that could be reused:**

- `src/lib/guards.ts` already hosts the cross-origin helper, so a sibling `requireAdmin(locals)`/`requireAdmin(Astro.locals)` helper would fit the same module `[inference]`.
- Astro `APIRoute` and page `Astro.locals` share the same `locals` shape, so one helper can return either a `Response` or a redirect instruction depending on the call site `[inference]`.

**Call sites / blast radius:**

- Directly in the user/book-access flow: 5 files, 5 occurrences (middleware, page, 3 API routes).
- Full admin surface: 25 files, 29 occurrences.

**Refactor leverage:** high. A single change to role logic (e.g., adding `teacher`) would otherwise have to touch ~25 files.

---

### Candidate 2 — Same-origin / CSRF guard (already extracted)

**Current shape:** the guard is no longer copy-pasted. It lives in one place and is imported.

- `src/lib/guards.ts:7` defines `requireSameOrigin(request: Request): Response | null`.
- Imported and used at:
  - `src/pages/api/admin/users.ts:22`
  - `src/pages/api/admin/users/[id]/grant.ts:23`
  - `src/pages/api/admin/users/[id]/revoke.ts:23`
- Unit tests exist in `src/lib/guards.test.ts`.

**Existing abstractions:** `requireSameOrigin` + tests.

**Status:** partially addressed in Phase 2 (commit `ea70cf0` added `src/lib/guards.ts`, `src/lib/guards.test.ts`, and switched the three admin user API routes to the shared helper) `[evidence]`. The remaining opportunity is to compose it with the admin-role guard into a single `requireAdminRequest(request, locals)` wrapper `[inference]`, not to re-extract it.

---

### Candidate 3 — Share `BookOption` and validate the refetch response

**Current shape:** the book-option shape is declared twice and the API response is cast, not validated.

- `src/pages/admin/users.astro:8-11` declares `interface BookOption { id: string; title: string; }`.
- `src/components/admin/UsersTable.tsx:15-18` declares the same interface again `[evidence]`.
- `src/pages/admin/users.astro:38` loads the catalog with `.select("id, title")` and assigns it to `BookOption[]`.
- `src/components/admin/UsersTable.tsx:42` casts `response.json()` to `{ users?: UserWithAccess[] }`:
  ```ts
  const payload = (await response.json()) as { users?: UserWithAccess[] };
  ```
  There is no runtime validation that `payload.users` is actually an array of `UserWithAccess` `[evidence]`.
- `src/lib/services/user-admin.ts:88` embeds the same `books(id, title)` projection when loading access rows, but the resulting type is shaped inside the service, not shared `[evidence]`.

**Existing abstractions / helpers that could be reused:**

- The generated Supabase types expose `Database["public"]["Tables"]["books"]["Row"]`; a shared `BookOption` can be derived from that or exported from `src/lib/services/user-admin.ts` alongside `UserWithAccess` `[inference]`.
- `zod` is already used in `grant.ts`/`revoke.ts`; the same dependency can validate the refetch payload `[evidence]`.

**Call sites / blast radius:**

- 2 declaration sites (`users.astro`, `UsersTable.tsx`).
- 1 fetch-and-cast site (`UsersTable.tsx:42`).
- 1 catalog query site (`users.astro:38`).

---

### Candidate 4 — Split the fragile service-role auth listing

**Current shape:** `getStudentsWithAccess` in `src/lib/services/user-admin.ts` is a single transaction script that does everything.

- Lines `56-148` contain `[evidence]`:
  - Supabase Auth admin SDK pagination (`auth.admin.listUsers` at line 60) `[evidence]`.
  - Client-side email filtering (`data.users.filter(...)` at line 64) `[evidence]`.
  - `hasNextPage` computation after the filter (line 65) `[evidence]`.
  - Chunking of `userIds` and parallel batch queries against `user_roles` and `user_book_access` (lines 73-90) `[evidence]`.
  - Manual joining, aggregation, and sorting (lines 103-147) `[evidence]`.
- It is the **only** production caller of `createAdminClient()` and `auth.admin.listUsers()` `[evidence]`.

**Existing abstractions / helpers:**

- A local `chunk<T>` helper (lines 39-44) is already extracted inside the file `[evidence]`.
- `createAdminClient()` and the Supabase typed client exist, but there is no repository layer for `user_roles`, `user_book_access`, or auth users `[evidence]`.

**Call sites / blast radius:**

- Runtime production call sites: `src/pages/admin/users.astro:28` and `src/pages/api/admin/users.ts:28` `[evidence]`.
- Tests: `src/lib/services/user-admin.test.ts` (added in Phase 2) `[evidence]`.

**Risks worth noting:**

- Filtering email-less users *after* pagination means page sizes can shrink unexpectedly; SSO/phone-only users are invisible to admins `[evidence]`.
- The function mixes read authorization policy (service role) with data shaping; a future policy change (e.g., teacher sees only their students) would require rewriting this function `[inference]`.

---

### Candidate 5 — Centralize table names and conflict targets

**Current shape:** schema identifiers are hard-coded string literals in the admin flow.

- `user_roles` literals `[evidence]`:
  - `src/middleware.ts:17` (role resolution)
  - `src/lib/services/user-admin.ts:83` (batch role load)
  - `src/pages/api/admin/users/[id]/grant.ts:52` (target role check)
  - `src/pages/api/admin/users/[id]/revoke.ts:50` (target role check)
- `user_book_access` literals `[evidence]`:
  - `src/lib/services/user-admin.ts:87` (batch access load)
  - `src/pages/api/admin/users/[id]/grant.ts:61` (upsert)
  - `src/pages/api/admin/users/[id]/revoke.ts:60` (delete)
- Conflict target `[evidence]`:
  - `src/pages/api/admin/users/[id]/grant.ts:67`: `onConflict: "user_id,book_id"`.
  - A similar pattern exists outside the flow at `src/pages/api/lessons/[id]/complete.ts:31` (`onConflict: "user_id,lesson_id"`) `[evidence]`.

**Existing abstractions / helpers:**

- `src/lib/database.types.ts` defines the generated table shapes but not runtime table-name constants `[evidence]`.
- No repository layer currently owns these identifiers `[evidence]`.

**Call sites / blast radius:**

- 4 production files, 7 table-name literals, 1 conflict target in the user/book-access flow.
- Similar literals appear in middleware and other admin routes, but the immediate scope is the 4 files above.

---

### Candidate 6 — Reconcile the mixed client authorization model

**Current shape:** reads and writes use different authorization mechanisms.

- Reads (`getStudentsWithAccess`) use `createAdminClient()` (service role) at `src/lib/services/user-admin.ts:58` and bypass RLS entirely `[evidence]`.
- Writes (`grant.ts`, `revoke.ts`) use `createClient(request.headers, cookies)` (cookie-backed, RLS-aware anon key) at `grant.ts:46` and `revoke.ts:44`, then add explicit checks: admin role, same-origin, target user is student `[evidence]`.
- Other admin API routes follow the write pattern (`createClient` + inline admin checks) `[evidence]`.

**Existing abstractions / helpers:**

- `createClient` and `createAdminClient` in `src/lib/supabase.ts` are the two primitives `[evidence]`.
- No policy object or authorization service unifies the two paths `[inference]`.

**Call sites / blast radius:**

- Read path: 1 service, 2 page/API call sites.
- Write path: 2 routes in the user/book-access flow; the same pattern repeats in the broader admin API surface.

**Refactor note:** this is more architectural than mechanical. Options include moving the list read behind RLS (if feasible) or formalizing the service-role read path with a dedicated authorization check, but either choice touches the security model and should be planned separately from the smaller helpers above `[inference]`.

---

## 3. Summary table

| Candidate | Current shape | Files affected (flow) | Key file:line anchors | Existing abstractions | Status |
|-----------|---------------|----------------------|-----------------------|----------------------|--------|
| 1. Centralize admin-role guard | Inline `if` repeated in middleware, pages, and API routes | 5 direct, 25 across admin surface | `src/middleware.ts:37`; `src/pages/admin/users.astro:13`; `src/pages/api/admin/users.ts:18`; `grant.ts:19`; `revoke.ts:19` (plus 24 other admin files) | None for role; `src/lib/guards.ts` is a natural home `[inference]` | Open |
| 2. Same-origin guard | Extracted to shared helper, imported by 3 API routes | 3 API routes + helper + tests | `src/lib/guards.ts:7`; `src/pages/api/admin/users.ts:22`; `grant.ts:23`; `revoke.ts:23` | `requireSameOrigin` + unit tests in `src/lib/guards.test.ts` | Partially addressed in Phase 2 |
| 3. Share `BookOption` + validate refetch | Duplicate interface; unchecked fetch cast | 2 files (`users.astro`, `UsersTable.tsx`) | `src/pages/admin/users.astro:8-11`; `src/components/admin/UsersTable.tsx:15-18`, `:42` | `UserWithAccess` type is already shared from `src/lib/services/user-admin.ts` `[evidence]`; `zod` available `[evidence]` | Open |
| 4. Split auth listing service | Transaction script mixing SDK pagination, filtering, chunking, join, sort | 1 service, 2 call sites | `src/lib/services/user-admin.ts:56-148`; `src/pages/admin/users.astro:28`; `src/pages/api/admin/users.ts:28` | `chunk<T>` inside the file `[evidence]`; tests in `user-admin.test.ts` `[evidence]` | Open; tests already exist |
| 5. Centralize table names / conflict target | Hard-coded string literals for `user_roles`, `user_book_access`, `onConflict` | 4 production files | `src/middleware.ts:17`; `src/lib/services/user-admin.ts:83,87`; `grant.ts:52,61,67`; `revoke.ts:50,60` | Generated types in `src/lib/database.types.ts`, but no constants `[evidence]` | Open |
| 6. Reconcile client authorization model | Reads use service-role client; writes use cookie-backed client + explicit checks | 1 read service, 2 write routes | `src/lib/services/user-admin.ts:58`; `src/pages/api/admin/users/[id]/grant.ts:46`; `revoke.ts:44`; `src/lib/supabase.ts:4-32` | `createClient` / `createAdminClient` | Open; architectural |

---

## 4. Items kept out of the refactor list (for reference)

| Item | Why kept out | Current note |
|------|--------------|--------------|
| E2E-only coverage (#1) | Test gap, not production structure | Phase 2 added `src/lib/services/user-admin.test.ts` and `tests/api-contract/admin-users.spec.ts`; component-level optimistic-UI tests are still missing `[evidence]` |
| Temporary RLS override (#6) | Policy timing decision, not code structure | Migration `20260629000000_open_book_access_for_students.sql` redefines `private.has_book_access()` and `private.has_lesson_access()` to `select true` `[evidence]` |
| Optimistic UI not tested (#9) | Test gap | `UsersTable.tsx` still mutates local state before the network request and rolls back on failure `[evidence]` |
| Prior delete/restore churn (#10) | Historical context | Cluster was deleted in `e2884e9` and restored in `f2d8e3c` `[evidence]`; newer Phase 2 work (commit `ea70cf0`) already extracted `requireSameOrigin` and added service tests `[evidence]` |

---

## 5. Evidence tagging used

- `[evidence]` — grounded in a direct `grep`, `read`, or `git show` result.
- `[inference]` — a reasonable conclusion from the evidence, but not directly observed.
- `[unknown]` — not determinable from the current exploration. No unknowns were left unflagged; where a fact could not be confirmed, it was omitted.
