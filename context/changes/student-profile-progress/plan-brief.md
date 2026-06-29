# Plan Brief: S-04 — Student Profile Progress

## Why
FR-004 requires a dedicated read-only student profile where learners can review overall progress, per-chapter progress, and their list of completed lessons. The dashboard already shows raw counts but not percentages and is optimized for "continue learning," not review.

## What
- New route: `/student/profile` (Astro, server-rendered).
- Middleware: add `/student` to `PROTECTED_ROUTES`.
- UI: user email, all books, progress bars per book and chapter, completed-lesson links to `/lessons/{id}`.
- Navigation: "Profil" link in `Topbar.astro` next to "Dashboard".
- E2E: Playwright tests verifying email, progress bars, completed lessons, and lesson links.

## Decisions
- Reuse the exact dashboard data-fetching pattern (books, chapters with lessons, `lesson_progress`, `chapter_progress`).
- Show all books; RLS on `books` is open, matching dashboard behavior.
- Progress percentage: `Math.round(completed / total * 100)` at book and chapter level.
- Pure Astro + Tailwind for progress bars; no React islands unless strictly simpler.
- No avatar, no edit actions, no "continue" CTA; FR-005 remains parked.

## Scope In
- `src/pages/student/profile.astro`.
- `src/middleware.ts` protected-route update.
- `src/components/Topbar.astro` link.
- `tests/e2e/student-profile.spec.ts`.

## Scope Out
- Avatar/profile editing (FR-005).
- Replacing or changing dashboard logic.
- New DB schema, views, or RLS changes.

## Phases
1. Route + middleware + data fetching.
2. UI components + navigation links.
3. E2E tests + verification.

## Risks
- Percentage mismatch between dashboard counts and profile if derived differently; keep the same source data.
- E2E relies on seeded progress; ensure seed data includes at least one completed lesson.
- Middleware route order is simple, but verify `/student` redirect works for anonymous users.
