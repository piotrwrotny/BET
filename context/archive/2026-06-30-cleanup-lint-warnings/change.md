---
change_id: cleanup-lint-warnings
title: Clean up remaining ESLint warnings
status: archived
created: 2026-06-30
updated: 2026-06-30
archived_at: 2026-06-30T14:30:00Z
---

## Notes

Eliminate the remaining 31 ESLint warnings so `npm run lint` is clean and CI
gates stay trustworthy. The current warning groups are:

1. **no-console** — seed script, user-admin service, admin users/grant/revoke
   APIs, and two E2E specs.
2. **astro/no-unused-css-selector** — `.lesson-content *` selectors in
   `src/pages/lessons/[id].astro` that are not matched by rendered markup.
3. **react-hooks/incompatible-library** — `useReactTable` from TanStack Table
   triggers React Compiler skip warning in `UsersTable.tsx`.

Where a warning points at dead code, remove it. Where it points at intentional
debugging or error logging, route it through a proper logger or add targeted
eslint-disable comments with a reason. Any behavioral change will be covered
by the existing E2E suite before the change is considered done.
