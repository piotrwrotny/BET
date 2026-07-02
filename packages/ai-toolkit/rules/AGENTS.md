# Shared Team Engineering Conventions

## Naming
- Variables and functions: descriptive camelCase (no abbreviations except `url`, `id`, `api`, `config`).
- Booleans: prefix with `is`, `has`, `should`, `can`.
- Functions: start with a verb (`getUserById`, not `user`).
- Files: match the primary export (`UserService.ts` exports `UserService`).
- Constants: UPPER_SNAKE_CASE.

## Error Handling
- All async operations use try/catch or `.catch()`.
- Error messages include the operation that failed and relevant input data.
- No empty catch blocks; at minimum log or re-throw.
- HTTP errors include status code and an actionable message.
- Cleanup belongs in `finally` blocks when resources are opened.

## TypeScript
- Zero `any` without an explicit comment justifying it.
- Prefer `interface` over `type` for object shapes.
- Use `unknown` for external data, narrowed with type guards.
- Model states with discriminated unions instead of optional fields.
- Generic parameters use descriptive names (`TUser`, not `T`).

## Functions
- One responsibility; if you need "and" to describe it, split it.
- Maximum 3 parameters; beyond that use an options object.
- Early returns instead of nested conditionals.
- Query functions (`get*`, `find*`, `is*`) must be pure.

## Security
- No secrets in source; environment variables only.
- Validate user input at system boundaries.
- SQL: parameterized statements only.
- API responses never expose stack traces or internal paths.

## Testing
- Test names describe behavior: "returns empty array when no results found".
- Each test owns its setup and cleanup.
- Specific assertions: `toEqual(expected)` instead of `toBeTruthy()`.
- Cover edge cases: empty, null, boundary values, and error paths.

## Astro / React / BET-specific rules
- **No Next.js directives.** Never write `"use client"` or `"use server"`.
- **Tailwind class merging.** Always use `cn()` from `@/lib/utils` for conditional or merged class names.
- **React only for interactivity.** Use Astro components for layout and static content; React islands only when client-side state or event handling is required.
- **API routes.** Export uppercase `GET` / `POST` handlers; validate all input with zod; export `const prerender = false` on every API file.
- **RLS required.** Enable Row Level Security on every new Supabase table with granular per-operation, per-role policies.
- **Secrets stay out of source.** `SUPABASE_URL` and `SUPABASE_KEY` go in `.env` (Node) or `.dev.vars` (Cloudflare local dev).

## Project structure
- `src/pages/` — Astro routes and API endpoints (`src/pages/api/`).
- `src/components/ui/` — shadcn/ui components.
- `src/layouts/` — shared page layouts.
- `src/lib/` — `supabase.ts`, `utils.ts`, and `services/`.
- `src/middleware.ts` — auth guard; resolves current user into `context.locals.user`.
- `src/types.ts` — all shared entity types and DTOs.
- `supabase/migrations/` — SQL files, named `YYYYMMDDHHmmss_short_description.sql`.

## Commands
- `npm run dev` — start dev server.
- `npm run build` — production build.
- `npm run lint` — ESLint with type-checked rules.
- `npm run lint:fix` — auto-fix lint issues.
- `npm run format` — Prettier with astro and Tailwind plugins.

## Commits
- Use imperative present tense (`Add`, `Fix`, `Remove`).
- No scope prefix until a team convention is agreed.
