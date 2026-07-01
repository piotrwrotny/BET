---
change_id: refactor-opportunities
title: Refactor opportunities for admin user & book-access flow
status: implemented
created: 2026-07-01
updated: 2026-07-01
archived_at: null
---

## Notes

Element ④ follow-up to `context/changes/admin-user-access-analysis/research.md`.

Intention: the previous analysis documented technical debt and structural risks
in the admin user/book-access flow. This change answers the question it
deliberately left open: WHICH of those problems are worth fixing, what target
shape makes sense, and in what order. We explore every recorded problem in code
and history, then rank them as refactor opportunities.

The change proceeds in stages: exploration → decision & plan → implementation.
No code changes happen during exploration; the decision is made during
planning, and refactoring starts only according to the adopted plan.

Output of exploration: `research.md` in this folder, ending with a ranked list
of options with trade-offs. The human will read the report; the decision on
what to implement will be made in a separate planning session.
