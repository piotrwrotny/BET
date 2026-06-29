# Plan: S-04 — student-profile-progress

## 1. Overview

Add a read-only student profile page at `/student/profile` that shows the logged-in user's email, all available books, and a structured breakdown of learning progress: progress percentage per book, per-chapter percentage, and a list of completed lessons with links back to each lesson. The page reuses the server-side data-fetching pattern already established in `dashboard.astro` and is protected by the existing middleware.

## 2. Current State Analysis

**Already in place:**
- `dashboard.astro` fetches books, chapters with lessons, `lesson_progress`, and `chapter_progress` server-side via Supabase.
- `chapter_progress` view aggregates `lessons_total` and `lessons_completed` per chapter per user.
- `middleware.ts` protects `/dashboard`, `/lessons`, and `/admin` and sets `Astro.locals.user` / `Astro.locals.role`.
- `Topbar.astro` shows the user email, a Dashboard link, and a sign-out button.
- There is no dedicated profile route or navigation link.
- RLS on `books` is open, so all authenticated students see the same catalog.

**Missing:**
- A `/student/profile` route.
- Middleware protection for `/student/*`.
- Profile UI showing per-book and per-chapter percentages.
- A list of completed lessons grouped under their chapter/book.
- Navigation link to the profile.
- E2E coverage for the profile page.

## 3. Desired End State

1. Navigating to `/student/profile` while authenticated renders `src/pages/student/profile.astro` inside `Layout.astro`.
2. The page header shows the current user's email.
3. All books are listed (same query as dashboard).
4. Each book card shows:
   - Title, description, cover.
   - Overall progress percentage: `Math.round(completed / total * 100)`.
   - A visual progress bar.
   - A completion message when the percentage is 100.
5. Under each book, chapters are listed with their own percentage and progress bar.
6. Under each completed chapter, completed lessons are listed as links to `/lessons/{id}`.
7. `Topbar.astro` contains a "Profil" link next to "Dashboard".
8. E2E tests verify the profile view with seeded progress.

## 4. What We Are NOT Doing

- No avatar upload or avatar display (FR-005 stays parked).
- No profile editing: name, password, email, or role changes.
- No action buttons: no "Kontynuuj naukę", no "Oznacz jako ukończoną", no admin controls.
- No replacement of the dashboard; dashboard keeps its "Kontynuuj naukę" CTA.
- No new database tables, views, or RLS changes; existing `lesson_progress` and `chapter_progress` are sufficient.
- No React islands unless a simple progress bar component is clearly simpler than Astro/HTML/CSS; prefer Astro.

## 5. Implementation Approach

### Data fetching
Reuse the dashboard query sequence in the frontmatter of `profile.astro`:
1. Fetch all books.
2. Fetch all chapters with embedded lessons.
3. Fetch the user's completed `lesson_id`s.
4. Fetch `chapter_progress` rows.

Then compute derived values in server-side TypeScript:
- Book total lessons = sum of lesson counts across its chapters.
- Book completed lessons = count of those lesson IDs present in the completed set.
- Book percent = `Math.round((completed / total) * 100)` (guard against division by zero).
- Chapter percent = `Math.round((lessons_completed / lessons_total) * 100)` from `chapter_progress`.
- Completed lessons under a chapter = chapter lessons filtered by the completed set, sorted by `ord`.

### UI
- Use `Layout.astro` and Tailwind classes matching the dashboard palette (`slate-900`, `white/5`, `white/10`, `emerald-400`, `purple-300`).
- Implement progress bars as inline `<div>` elements with a filled inner bar driven by `style={{ width: `${pct}%` }}`; no JS needed.
- Use semantic headings and lists; mark completed lessons as links with `href={/lessons/${lesson.id}}`.

### Navigation
- Add a "Profil" link in `Topbar.astro` between "Dashboard" and the sign-out form.
- Optionally add a "Profil" link or icon on `dashboard.astro`; this is not required if the topbar link is present.

### Middleware
- Append `"/student"` to `PROTECTED_ROUTES` so any `/student/*` path requires authentication.
- No role check is needed; both student and admin can view their own read-only profile.

## 6. Phase 1: Route + middleware + data fetching

### 6.1 Create `src/pages/student/profile.astro`
- Import `Layout`, `ServerError`, `SafeImage`, and `createClient`.
- Read `Astro.locals.user` and create the Supabase client.
- If no Supabase client, set `pageError = "Service unavailable"`.
- Fetch books, chapters with lessons, `lesson_progress`, and `chapter_progress` exactly like `dashboard.astro`.
- Build derived data structures for books and chapters.

### 6.2 Update `src/middleware.ts`
- Change `PROTECTED_ROUTES = ["/dashboard", "/lessons", "/admin"]` to include `"/student"`.

### 6.3 Type safety
- Reuse the same local type aliases (`BookRow`, `ChapterRow`, `ChapterProgressRow`) used in `dashboard.astro` to stay consistent.
- Ensure `npm run build` passes before moving to Phase 2.

## 7. Phase 2: UI components + navigation links

### 7.1 Render the profile page
- Header block with `<h1>Profil</h1>` and the user's email.
- Empty state when there are no books.
- For each book:
  - Cover + title + description.
  - Progress bar labelled with the computed percentage.
  - Completion badge when percentage is 100.
- For each chapter inside the book:
  - Title + chapter percentage bar.
  - When the chapter has completed lessons, render a `<ul>` of links to `/lessons/{id}`.
  - When the chapter has no completed lessons, show "Brak ukończonych lekcji" or skip the list.

### 7.2 Update `src/components/Topbar.astro`
- Add `<a href="/student/profile">Profil</a>` between the Dashboard link and the sign-out form.
- Keep styling consistent with the existing Dashboard link.

### 7.3 Visual consistency checks
- Compare rendered profile with dashboard in the same viewport.
- Ensure contrast, spacing, and progress bar colors match the existing design language.

## 8. Phase 3: E2E tests + verification

### 8.1 Test file
Create `tests/e2e/student-profile.spec.ts` using the `student` storage state.

### 8.2 Test cases
1. **Redirects anonymous users**
   - `await page.goto('/student/profile')`
   - `await page.waitForURL('/auth/signin')`

2. **Shows student email**
   - Authenticated as `student@bet.local`.
   - Expect the page to contain the email text.

3. **Shows progress bars and percentages**
   - Seed or rely on existing fixture data showing at least one book with mixed progress.
   - Expect at least one element labelled with a percentage (e.g. "50%") or a visible progress bar.

4. **Shows completed lessons with links**
   - Find a completed-lesson link pointing to `/lessons/{id}`.
   - Click it and assert navigation to the lesson page.

5. **Book completion state**
   - If seeded data includes a fully completed book, expect the completion message.

### 8.3 Run verification
- `npx playwright test tests/e2e/student-profile.spec.ts`
- Fix selectors or timing issues; do not use `waitForTimeout`.

## 9. Testing Strategy

### Automated
- `npx tsc --noEmit` after adding the new route and middleware change.
- `npm run build` before E2E tests.
- `npx playwright test tests/e2e/student-profile.spec.ts`.

### Manual
- Open `/student/profile` as the seeded student and confirm the email is visible.
- Confirm each book shows the same overall progress as dashboard `x/y` converted to a rounded percentage.
- Confirm clicking a completed-lesson link navigates to the correct `/lessons/{id}`.
- Sign out and visit `/student/profile`; confirm redirect to `/auth/signin`.

## 10. References

- PRD FR-004: Student profile with completed lessons and book progress.
- `src/pages/dashboard.astro` — data-fetching pattern to replicate.
- `src/middleware.ts` — `PROTECTED_ROUTES` and auth redirect logic.
- `src/components/Topbar.astro` — navigation link location.
- `src/layouts/Layout.astro` — page layout wrapper.
- `src/lib/database.types.ts` — `lesson_progress` and `chapter_progress` types.
- `supabase/migrations/20260625184555_init.sql:229-248` — `chapter_progress` view definition.
- `tests/auth.setup.ts` and `playwright.config.ts` — existing E2E auth fixture.
- `tests/e2e/admin-users.spec.ts` — example E2E spec using seeded state.

## 11. Progress

### Phase 1: Route + middleware + data fetching

#### Automated
- [ ] 1.1 `src/pages/student/profile.astro` created with server-side data fetching.
- [ ] 1.2 `src/middleware.ts` updated to include `"/student"` in `PROTECTED_ROUTES`.
- [ ] 1.3 `npx tsc --noEmit` passes.
- [ ] 1.4 `npm run build` passes.

#### Manual
- [ ] 1.5 Signed-in user can open `/student/profile` without error.
- [ ] 1.6 Anonymous user is redirected to `/auth/signin` from `/student/profile`.

### Phase 2: UI components + navigation links

#### Automated
- [ ] 2.1 `npm run build` passes with the profile UI.
- [ ] 2.2 `Topbar.astro` renders the "Profil" link.

#### Manual
- [ ] 2.3 Profile page shows user email and all books.
- [ ] 2.4 Per-book and per-chapter percentages are correct.
- [ ] 2.5 Completed lessons render as links to `/lessons/{id}`.
- [ ] 2.6 Completed books show the completion message.

### Phase 3: E2E tests + verification

#### Automated
- [ ] 3.1 `tests/e2e/student-profile.spec.ts` created with all required cases.
- [ ] 3.2 `npx playwright test tests/e2e/student-profile.spec.ts` passes.

#### Manual
- [ ] 3.3 Profile link in topbar navigates to `/student/profile`.
- [ ] 3.4 A completed-lesson link navigates to the correct lesson page.
