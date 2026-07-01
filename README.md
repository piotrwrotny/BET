# Business English Exam (BET)

BET is a web-based learning platform for students preparing for English language certifications (e.g. FCE, CAE, B2 First). It replaces textbook PDFs and handwritten exercises with an interactive, chapter-by-chapter learning flow that gives immediate feedback and tracks progress.

## Problem & scope

Students currently waste time copying exercises out of textbooks and have no automated way to verify answers or track completion. BET solves this by letting an instructor add a textbook (book → chapters → lessons → exercises) and letting students work through the material online, get deterministic feedback on closed exercises, and see their progress in a personal profile.

## Users

- **Student** — signs up with email/password, sees books assigned by an admin, continues learning from where they left off, completes lessons and exercises, and tracks progress.
- **Admin / instructor** — creates content (books, chapters, lessons, exercises), manages student accounts, and grants or revokes access to specific books.

## Tech stack

- **Framework:** Astro 6 SSR with React 19 islands
- **Styling:** Tailwind 4 + shadcn/ui
- **Backend / database:** Supabase (Postgres + Row Level Security)
- **Auth:** Supabase Auth (email/password, SSR cookie session)
- **Deployment target:** Cloudflare Workers
- **Testing:** Vitest (unit/contract) + Playwright (E2E)

## Project structure

- `src/pages/` — Astro routes and API endpoints
- `src/pages/api/admin/` — admin CRUD handlers for books, chapters, lessons, exercises and user access
- `src/pages/api/auth/` — sign-in, sign-up, sign-out
- `src/lib/` — shared utilities, Supabase client, deterministic exercise verification
- `src/components/` — React islands for exercises and admin forms
- `supabase/migrations/` — database schema and RLS policies
- `context/foundation/` — product docs (PRD, roadmap, test plan, tech stack)

## Running locally

1. Copy environment variables and fill in your Supabase credentials:
   ```bash
   cp .env.example .env
   ```
2. Install dependencies:
   ```bash
   npm install
   ```
3. Start Supabase locally:
   ```bash
   npm run db:start
   ```
4. Run the dev server:
   ```bash
   npm run dev
   ```
5. Run tests:
   ```bash
   npm run test:unit      # Vitest
   npx playwright test    # E2E (requires dev server + seeded DB)
   ```

## Scripts

- `npm run dev` — start Astro dev server (Cloudflare workerd runtime)
- `npm run build` — production build
- `npm run test:unit` — unit / contract tests
- `npm run test:coverage` — unit tests with coverage
- `npm run lint` — ESLint with type-checked rules
- `npm run format` — Prettier
- `npm run db:start` / `npm run db:reset` — local Supabase

## Documentation

Product requirements, roadmap, test plan and tech-stack decisions live in `context/foundation/`:

- `context/foundation/prd.md` — vision, personas, functional requirements, business logic, access control
- `context/foundation/roadmap.md` — implementation slices and dependency map
- `context/foundation/test-plan.md` — risk map, test strategy, phased rollout
- `context/foundation/tech-stack.md` — stack rationale and constraints

## License

Private — part of the 10xDevs certification project.
