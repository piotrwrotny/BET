# Plan Review — `refactor-opportunities`

**Reviewer:** Plan reviewer  
**Date:** 2026-07-01  
**Plan:** `context/changes/refactor-opportunities/plan.md`  
**Research basis:** `context/changes/refactor-opportunities/research.md`, `context/changes/admin-user-access-analysis/research.md`

## Summary

The plan is tightly scoped to the three top-ranked structural extractions from the research (#1 shared `BookOption`/response schema, #2 DB identifier constants, #3 centralized admin-role guard). It correctly defers the security-model and business-domain decisions (RLS override, service-role read model, mixed-client model, optimistic UI testing) and does not sneak in architectural changes. The rollback strategy and per-phase verification are mostly explicit.

The only recurring weakness is **test-before-touch discipline**: Phase 1 schedules the guard test for schema constants *after* creating the constants file and has no automated characterization test for the API response shape before replacing the `response.json()` cast. Phase 2 and Phase 3 satisfy the lesson properties well.

**Overall: go, with minor corrections before implementation starts.**

---

## Per-phase verdicts

### Phase 1 — Extract shared schema types and constants
**Verdict: minor**

| Property | Assessment |
|----------|------------|
| Guard/characterization test before production code touched | **Partial.** `schema.test.ts` is scheduled as task 1.5, *after* creating `src/lib/db/schema.ts` (1.4). There is also no automated guard test for the `GET /api/admin/users` response shape before `UsersTable.tsx` switches from a cast to `zod.parse()`. Manual check M.1 is listed, but it is post-hoc. |
| Separately reversible commit | **Yes.** A single constants/types commit can be reverted; string literals come back unchanged. |
| Explicit verification criteria | **Yes.** Automated: `test:unit`, `lint`, `typecheck`. Manual: `grep` confirming literals are gone. |
| Green-then-enable | **Yes.** Phase 1 verification must pass before Phase 2/3 begin. |

**Fix before implementation:** Reorder 1.4/1.5 so the constants test is written first, and add a characterization/snapshot test for the current `/api/admin/users` JSON shape before replacing the cast in `UsersTable.tsx`.

---

### Phase 2 — Characterization tests for existing role-guard behavior
**Verdict: pass**

| Property | Assessment |
|----------|------------|
| Guard/characterization test before production code touched | **Yes.** This phase exists solely to pin current behavior before Phase 3 replaces the inline checks. |
| Separately reversible commit | **Yes.** A test-only commit can be reverted without touching production behavior. |
| Explicit verification criteria | **Yes.** Automated: `npm run test:unit`. |
| Green-then-enable | **Yes.** Tests must be green before Phase 3 migrates call sites. |

---

### Phase 3 — Centralize admin-role guard in user/book-access flow
**Verdict: pass**

| Property | Assessment |
|----------|------------|
| Guard/characterization test before production code touched | **Yes.** Covered by Phase 2. |
| Separately reversible commit | **Yes.** The helper migration is one commit; reverting restores the inline `role !== "admin"` checks. |
| Explicit verification criteria | **Yes.** Automated: unit, lint, typecheck, Playwright API-contract. Manual: `grep` for remaining inline checks. |
| Green-then-enable | **Yes.** The `requireAdmin*` helpers land and pass tests before the remaining admin surface is considered. |

**Note:** The plan should clarify the contract for `requireAdminPage(Astro)` — e.g. it must return the `Astro.redirect("/dashboard")` response, and the caller must `return requireAdminPage(Astro)` so page execution actually stops. Without that, the helper could return a redirect while the page continues rendering.

---

### Phase 4 — Roll out `requireAdmin` to remaining admin surface
**Verdict: out of scope / future change**

Correctly framed as an optional follow-up. The plan says it should be opened as a separate change and migrated one resource per commit. The current plan does not commit to executing it, so it is not evaluated against the lesson properties here.

---

## "What we're NOT doing" scope check

The section is explicit and well-scoped:

- Does **not** revert/modify the open-access RLS override. ✅
- Does **not** replace the service-role `auth.admin.listUsers()` read model. ✅
- Does **not** rewrite/test the optimistic UI. ✅
- Does **not** migrate the remaining 11 inline same-origin checks in other admin routes. ✅

No architectural changes (RLS override, mixed client model) are introduced.

---

## Scope alignment with research ranking

The research ranked the refactor opportunities as:

1. Extract shared `BookOption` + response schema
2. Centralize DB table names/conflict targets
3. Centralize the admin-role guard
4. (follow-up) Split fragile service-role auth listing

The plan implements exactly #1–#3 in that order and defers #4. It also rejects the same items the research rejected (RLS override, mixed client model, optimistic UI testing, same-origin follow-up). **Alignment is good.**

---

## Findings

### Blockers
None.

### Majors
None. The Phase 1 test-order issue does not rise to "major" because the extracted code is low-risk and manual verification is listed.

### Minors
1. **Phase 1 is not test-first.** Reorder so `schema.test.ts` and a response-shape guard test are written before the production files are changed.
2. **Phase 3 helper contract is underspecified.** State explicitly that `requireAdminPage(Astro)` returns the redirect and must be returned by the caller (`return requireAdminPage(Astro)`).
3. **Phase 4 boundary is fuzzy.** The plan says "~23 inline role checks" while the research counted 28 total. List the resources/routes that are in scope for the follow-up (books, chapters, lessons, exercises) and confirm the count.
4. **Manual grep commands assume a POSIX environment.** The workstation is Windows. Provide equivalent commands or an npm script so verification is reproducible locally.

---

## Top risks

1. **Zod parse becomes too strict.** Replacing the `response.json()` cast with `AdminUsersResponseSchema.parse()` could reject responses that contain extra fields the UI currently ignores. Mitigation: add a characterization test/snapshot of the real response before the change, and make the schema permissive for unknown fields unless the UI explicitly depends on them.
2. **`requireAdminPage` short-circuit failure.** If the helper returns a redirect but the Astro page does not immediately return it, the page will continue executing and render privileged content after the redirect. Mitigation: document the `return requireAdminPage(Astro)` pattern in the plan and verify it with a unit/E2E test.
3. **Middleware helper switch is optional.** Leaving middleware inline is safe, but if the implementer switches middleware to the helper without updating the manual `grep` verification, a false sense of completeness could result. Mitigation: the Phase 3 manual check should include `src/middleware.ts` if it is migrated.
4. **Phase 4 scope creep.** Because the follow-up touches 20+ call sites across four resources, there is a temptation to include it in the current change. The plan correctly fences it, but the implementer should open a new change folder rather than expand this one.

---

## Recommendation

**Go/no-go: go, after addressing the minors.**

The plan is safe, well-scoped, and aligned with the research. Fix the test-before-touch ordering in Phase 1 and clarify the page-helper contract in Phase 3 before implementation begins. No blockers prevent approval.
