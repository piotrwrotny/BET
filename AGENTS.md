# Repository Guidelines

BET (Business English Exam) is an Astro 6 SSR app with React 19 islands, Tailwind 4, Supabase auth, and shadcn/ui, deployed to Cloudflare Workers.

## Hard Rules

- **No Next.js directives.** Never write `"use client"` or `"use server"`.
- **Tailwind class merging.** Always use `cn()` from `@/lib/utils` for conditional or merged class names; never concatenate class strings manually.
- **React only for interactivity.** Use Astro components for layout and static content; React islands only when client-side state or event handling is required.
- **API routes.** Export uppercase `GET` / `POST` handlers; validate all input with zod; export `const prerender = false` on every API file.
- **RLS required.** Enable Row Level Security on every new Supabase table with granular per-operation, per-role policies.
- **Secrets stay out of source.** `SUPABASE_URL` and `SUPABASE_KEY` go in `.env` (Node) or `.dev.vars` (Cloudflare local dev). Neither file is committed — see `@.env.example`.

## Project Structure

- `src/pages/` — Astro routes and API endpoints (`src/pages/api/`)
- `src/components/ui/` — shadcn/ui components, new-york style variant
- `src/layouts/` — shared page layouts
- `src/lib/` — `supabase.ts`, `utils.ts`, and `services/` for extracted business logic
- `src/middleware.ts` — auth guard; resolves current user into `context.locals.user`
- `src/types.ts` — all shared entity types and DTOs (single source of truth)
- `supabase/migrations/` — SQL files, named `YYYYMMDDHHmmss_short_description.sql`

New React hooks → `src/components/hooks/`. Install new shadcn components with `npx shadcn@latest add [name]`.

## Commands

- `npm run dev` — start dev server (Cloudflare workerd runtime)
- `npm run build` — production build; requires `SUPABASE_URL` and `SUPABASE_KEY` in env
- `npm run lint` — ESLint with type-checked rules
- `npm run lint:fix` — auto-fix lint issues
- `npm run format` — Prettier with astro and Tailwind plugins

Pre-commit hooks configured in `@package.json` (lint-staged).

## CI

`.github/workflows/ci.yml` runs `astro sync` → lint → build on every push and PR to `master`. Set `SUPABASE_URL` and `SUPABASE_KEY` as repository secrets before the first CI run.

## E2E Tests

- Prefer `getByRole`, `getByLabel`, `getByText`. Use `getByTestId` only when accessibility attributes are ambiguous.
- Never use CSS selectors, XPath, or DOM structure for locating elements.
- Each test is independent — own setup, action, assertion, and cleanup.
- Never use `page.waitForTimeout()`. Wait for state: `toBeVisible()`, `waitForURL()`, `waitForResponse()`.
- Use `storageState` for authentication — never log in through the UI inside individual tests.
- Use unique identifiers for test data and clean up in `afterEach` or at the end of each test.
- Assert the business outcome, not implementation details.

## Reference

- Living docs live in `context/`:
  - `context/foundation/` — PRD, roadmap, tech-stack, test-plan, infrastructure, shape-notes, lessons.
  - `context/changes/<id>/` — in-flight work (plans, research, verification).
  - `context/archive/` — completed changes.
- Auth-flow details are in `@src/middleware.ts` and `@src/lib/supabase.ts`; conventions above describe how we extend them.

## Commits

Use imperative present tense (`Add`, `Fix`, `Remove`). No scope prefix until a team convention is agreed.
