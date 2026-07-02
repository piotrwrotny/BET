---
title: Anti-Corruption Layer for Supabase Session / Auth SDK
created: 2026-07-02
type: refactor-plan
---

# Domain-Driven Design Anti-Corruption Layer Plan

## STEP 0 — Discover the context

Baseline documents read:

- `context/foundation/prd.md` — BET is a content-heavy English-learning platform with two roles (admin/student), deterministic exercise verification, and progress tracking.
- `context/foundation/tech-stack.md` — built from the `10x-astro-starter`: Astro 6 + React 19 + TypeScript + Supabase (PostgreSQL + auth) + Cloudflare Pages.
- `package.json` — key external dependencies: `@supabase/ssr@^0.10.3`, `@supabase/supabase-js@^2.99.1`, `astro@^6.3.1`, `zod@^4.4.3`.

Code layers observed:

- `.astro` pages (server-side rendering)
- `pages/api/*` Astro API routes
- `src/middleware.ts` (runs on every request)
- `src/lib/services/*` domain services and repositories
- `src/lib/db/schema.ts` and `src/lib/database.types.ts` for persistence contracts
- `src/components/` React components (mostly presentational)

No baseline document claims that the Supabase client should be replaceable, so the leak is an **architecture quality issue** rather than an intent-vs-code discrepancy.

## STEP 1 — IDENTIFY leaky dependencies

### 1.1 `@supabase/ssr` — server-side session client

| File | Line | What it knows |
|------|------|---------------|
| `src/lib/supabase.server.ts` | 1 | `import { createServerClient, parseCookieHeader } from "@supabase/ssr";` |

### 1.2 `@supabase/supabase-js` — core client, `User`, `SupabaseClient`

| File | Line | What it knows |
|------|------|---------------|
| `src/env.d.ts` | 3 | `user: import("@supabase/supabase-js").User \| null;` |
| `src/lib/supabase.server.ts` | 2 | `import { createClient as createSupabaseClient } from "@supabase/supabase-js";` |
| `src/lib/services/user-admin.server.ts` | 1 | `import type { User } from "@supabase/supabase-js";` |
| `src/lib/services/user-admin.server.ts` | 38 | `(user): user is User & { email: string }` |
| `src/lib/services/lesson-completion.repository.ts` | 4 | `import type { SupabaseClient } from "@supabase/supabase-js";` |
| `src/lib/services/lesson-completion.repository.ts` | 6 | `type Supabase = SupabaseClient<Database>;` |
| `src/pages/api/lessons/[id]/complete.ts` | 5 | `import type { SupabaseClient } from "@supabase/supabase-js";` |
| `src/pages/api/lessons/[id]/complete.ts` | 14 | `createClient(...) as SupabaseClient<Database> \| null` |

### 1.3 `createClient` wrapper from `src/lib/supabase.server.ts`

This helper is the **main wire** that carries the Supabase SDK across layer boundaries. Every server-side caller imports it and repeats the same `Headers` + `AstroCookies` handshake.

| File | Import line | Call line(s) |
|------|-------------|--------------|
| `src/middleware.ts` | 4 | 9 |
| `src/pages/dashboard.astro` | 5 | 8 |
| `src/pages/lessons/[id].astro` | 4 | 16 |
| `src/pages/student/profile.astro` | 6 | 9 |
| `src/pages/admin/users.astro` | 6 | 13 |
| `src/pages/admin/books/index.astro` | 6 | 14 |
| `src/pages/admin/books/[id]/edit.astro` | 7 | 15 |
| `src/pages/admin/chapters/index.astro` | 5 | 16 |
| `src/pages/admin/chapters/new.astro` | 6 | 30 |
| `src/pages/admin/chapters/[id]/edit.astro` | 6 | 14 |
| `src/pages/admin/exercises/index.astro` | 5 | 16 |
| `src/pages/admin/exercises/new.astro` | 4 | 21 |
| `src/pages/admin/exercises/[id]/edit.astro` | 4 | 12 |
| `src/pages/admin/lessons/index.astro` | 5 | 16 |
| `src/pages/admin/lessons/new.astro` | 7 | 34 |
| `src/pages/admin/lessons/[id]/edit.astro` | 7 | 15 |
| `src/pages/api/auth/signin.ts` | 2 | 9 |
| `src/pages/api/auth/signout.ts` | 2 | 5 |
| `src/pages/api/auth/signup.ts` | 2 | 9 |
| `src/pages/api/exercises/verify.ts` | 3 | 27, 63 (admin) |
| `src/pages/api/lessons/[id]/complete.ts` | 2 | 14 |
| `src/pages/api/admin/books/index.ts` | 5 | 34 |
| `src/pages/api/admin/books/[id].ts` | 5 | 35, 91 |
| `src/pages/api/admin/chapters/index.ts` | 5 | 25 |
| `src/pages/api/admin/chapters/[id].ts` | 5 | 26, 74 |
| `src/pages/api/admin/exercises/index.ts` | 5 | 36 |
| `src/pages/api/admin/exercises/[id].ts` | 5 | 37, 213 |
| `src/pages/api/admin/lessons/index.ts` | 5 | 26 |
| `src/pages/api/admin/lessons/[id].ts` | 5 | 27, 76 |
| `src/pages/api/admin/users/[id]/grant.ts` | 6 | 46 |
| `src/pages/api/admin/users/[id]/revoke.ts` | 6 | 44 |

### 1.4 Astro-specific wire types leaked into the client factory

| File | Line | Leak |
|------|------|------|
| `src/lib/supabase.server.ts` | 3 | `import type { AstroCookies } from "astro";` |
| `src/lib/supabase.server.ts` | 5 | `export function createClient(requestHeaders: Headers, cookies: AstroCookies)` |

Every caller therefore passes `Astro.request.headers` / `Astro.cookies` or `context.request.headers` / `context.cookies`, wiring the Astro framework directly into the Supabase bootstrapper.

### 1.5 Other candidates considered (lower priority)

- **Zod exercise payload schemas** (`src/lib/exercise-schemas.ts`) are imported only by the exercise admin API routes (`src/pages/api/admin/exercises/index.ts:8-12`, `src/pages/api/admin/exercises/[id].ts:9-12`) and `src/lib/verify-exercise.ts`. There is no duplication and no cross-layer leak.
- **JSON exercise payload shapes** live inside the discriminated Zod schemas and are persisted as JSONB. The shape is already centralized in `src/lib/exercise-schemas.ts`.

## STEP 2 — CLASSIFY and choose #1

| Leak | Layers/files affected | Replace cost | Discrepancy with docs | Verdict |
|------|----------------------|--------------|-----------------------|---------|
| `@supabase/ssr` + `@supabase/supabase-js` through `createClient` | Middleware + 16 pages + 15+ API routes + 2 services + env types | Very high — touches auth, RLS, session cookies, admin user listing | None declared, but leak contradicts DDD layering | **Worst leak** |
| Astro cookie/header types in `createClient` | Same as above | High — requires abstracting cookie store | Same as above | Major symptom of #1 |
| `SupabaseClient<Database>` in repository | 1 repository + 1 API route | Medium | Same as above | Symptom of #1 |
| Zod exercise schemas | 2 API routes, 1 lib | Low | None | Not chosen |

**Chosen leak:** the Supabase auth/session SDK leaking through `src/lib/supabase.server.ts` and its `createClient` wrapper.

Justification:

1. **Breadth:** it appears in middleware, every protected page, every protected API route, and two services.
2. **Depth of coupling:** callers must know both the Astro request/cookie API and the Supabase client shape (`auth.getUser()`, `.from()`, admin `listUsers()`).
3. **Framework lock-in:** replacing Supabase or moving off Astro would require editing ~30 files.
4. **Duplication:** the same `createClient(...)` + null-check + `supabase.auth.getUser()` pattern is repeated everywhere.

## STEP 3 — DIAGNOSIS

### 3.1 Duplicated bootstrap pattern

Current `src/lib/supabase.server.ts:5`:

```ts
export function createClient(requestHeaders: Headers, cookies: AstroCookies) {
  if (!SUPABASE_URL || !SUPABASE_KEY) return null;
  return createServerClient(SUPABASE_URL, SUPABASE_KEY, {
    cookies: {
      getAll() {
        return parseCookieHeader(requestHeaders.get("Cookie") ?? "").map(({ name, value }) => ({
          name,
          value: value ?? "",
        }));
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value, options }) => {
          cookies.set(name, value, options);
        });
      },
    },
  });
}
```

Every consumer repeats the same call. Examples:

- `src/middleware.ts:9`:
  ```ts
  const supabase = createClient(context.request.headers, context.cookies);
  ```
- `src/pages/dashboard.astro:8`:
  ```ts
  const supabase = createClient(Astro.request.headers, Astro.cookies);
  ```
- `src/pages/api/admin/books/index.ts:34`:
  ```ts
  const supabase = createClient(request.headers, cookies);
  ```

### 3.2 Duplicated session retrieval

- `src/middleware.ts:11-12`:
  ```ts
  const { data: { user } } = await supabase.auth.getUser();
  context.locals.user = user ?? null;
  ```
- `src/pages/api/lessons/[id]/complete.ts:17-20`:
  ```ts
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) { return Response.json({ error: "Unauthorized" }, { status: 401 }); }
  ```

### 3.3 Library types in domain signatures

- `src/env.d.ts:3` exposes `import("@supabase/supabase-js").User` to the whole app via `App.Locals`.
- `src/lib/services/user-admin.server.ts:38` narrows `User` from Supabase to assert an email field:
  ```ts
  const pageUsers = data.users.filter((user): user is User & { email: string } => Boolean(user.email));
  ```
- `src/lib/services/lesson-completion.repository.ts:6` defines an alias for the library client:
  ```ts
  type Supabase = SupabaseClient<Database>;
  ```
- `src/pages/api/lessons/[id]/complete.ts:14` casts the wrapper to the library type:
  ```ts
  const supabase = createClient(context.request.headers, context.cookies) as SupabaseClient<Database> | null;
  ```

### 3.4 Boundary crossings

- **Framework → Infrastructure:** `AstroCookies` from `astro` is imported into `src/lib/supabase.server.ts:3`, the same file that imports `@supabase/ssr`.
- **Infrastructure → Application/Domain:** `User` and `SupabaseClient` types from `@supabase/supabase-js` are used in `env.d.ts`, `user-admin.server.ts`, and `lesson-completion.repository.ts`.
- **Infrastructure → Presentation:** every protected `.astro` page and API route constructs the raw client before doing any domain work.

## STEP 4 — DESIGN ACL

Introduce a dedicated anti-corruption layer: `src/lib/acl/`.

```text
src/lib/acl/
├── domain/
│   └── session.ts              # AuthenticatedUser value object
├── ports/
│   ├── cookie-store.ts         # framework-neutral cookie abstraction
│   ├── auth-gateway.ts         # session / auth port
│   └── lesson-progress-repository.ts
├── adapters/
│   ├── astro-cookie-store.adapter.ts
│   ├── supabase-connection.factory.ts
│   ├── supabase-auth.adapter.ts
│   └── supabase-lesson-progress.adapter.ts
└── index.ts                    # factory functions used by callers
```

### 4.1 Domain value object

`src/lib/acl/domain/session.ts`:

```ts
export type UserId = string & { readonly __brand: unique symbol };
export type UserEmail = string & { readonly __brand: unique symbol };
export type UserRole = "admin" | "student";

export class AuthenticatedUser {
  constructor(
    readonly id: UserId,
    readonly email: UserEmail,
    readonly role: UserRole,
  ) {}

  isAdmin(): boolean {
    return this.role === "admin";
  }
}
```

This is the **only** place that decides what an authenticated user looks like in the domain. The adapter maps the Supabase `User` shape to this object.

### 4.2 Ports

`src/lib/acl/ports/cookie-store.ts`:

```ts
export interface CookieOptions {
  path?: string;
  maxAge?: number;
  domain?: string;
  secure?: boolean;
  sameSite?: "strict" | "lax" | "none";
  httpOnly?: boolean;
}

export interface CookieStore {
  getAll(): { name: string; value: string }[];
  set(name: string, value: string, options?: CookieOptions): void;
}
```

`src/lib/acl/ports/auth-gateway.ts`:

```ts
import type { AuthenticatedUser, UserRole } from "../domain/session";
import type { CookieStore } from "./cookie-store";

export interface ListStudentsOptions {
  page?: number;
  perPage?: number;
}

export interface ListStudentsResult {
  users: AuthenticatedUser[];
  hasNextPage: boolean;
}

export interface AuthGateway {
  getSession(request: Request, cookies: CookieStore): Promise<AuthenticatedUser | null>;
  signOut(request: Request, cookies: CookieStore): Promise<void>;
  listStudents(options: ListStudentsOptions): Promise<ListStudentsResult>;
  /**
   * Used when the role is not already known (e.g. first request after signup).
   */
  resolveRole(userId: string): Promise<UserRole | null>;
}
```

`src/lib/acl/ports/lesson-progress-repository.ts`:

```ts
import type { LessonCompletion, LessonCompletionResult } from "@/lib/services/lesson-completion";

export interface LessonProgressRepository {
  load(userId: string, lessonId: string): Promise<LessonCompletion>;
  save(result: LessonCompletionResult): Promise<void>;
}
```

The existing `LessonCompletion` and `LessonCompletionResult` domain objects are reused; the repository port is the only persistence contract.

### 4.3 Adapters

`src/lib/acl/adapters/astro-cookie-store.adapter.ts`:

```ts
import type { AstroCookies } from "astro";
import type { CookieStore, CookieOptions } from "../ports/cookie-store";

export class AstroCookieStore implements CookieStore {
  constructor(private readonly astroCookies: AstroCookies) {}

  getAll(): { name: string; value: string }[] {
    return this.astroCookies
      .entries()
      .map(([name, value]) => ({ name, value }));
  }

  set(name: string, value: string, options?: CookieOptions): void {
    this.astroCookies.set(name, value, options);
  }
}
```

`src/lib/acl/adapters/supabase-connection.factory.ts`:

```ts
import { createServerClient, parseCookieHeader } from "@supabase/ssr";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { SUPABASE_URL, SUPABASE_KEY, SUPABASE_SERVICE_ROLE_KEY } from "astro:env/server";
import type { CookieStore } from "../ports/cookie-store";

export function createSessionClient(request: Request, cookies: CookieStore) {
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    throw new Error("Supabase session client is not configured");
  }
  return createServerClient(SUPABASE_URL, SUPABASE_KEY, {
    cookies: {
      getAll() {
        return parseCookieHeader(request.headers.get("Cookie") ?? "").map(({ name, value }) => ({
          name,
          value: value ?? "",
        }));
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value, options }) => cookies.set(name, value, options));
      },
    },
  });
}

export function createServiceClient() {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("Supabase service client is not configured");
  }
  return createSupabaseClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
```

This factory keeps **all** imports from `@supabase/ssr` and `@supabase/supabase-js` inside the adapter directory.

`src/lib/acl/adapters/supabase-auth.adapter.ts`:

```ts
import type { AuthGateway, ListStudentsResult, ListStudentsOptions } from "../ports/auth-gateway";
import type { CookieStore } from "../ports/cookie-store";
import { AuthenticatedUser, type UserRole } from "../domain/session";
import { createSessionClient, createServiceClient } from "./supabase-connection.factory";
import { TABLE_USER_ROLES } from "@/lib/db/schema";

export class SupabaseAuthAdapter implements AuthGateway {
  async getSession(request: Request, cookies: CookieStore): Promise<AuthenticatedUser | null> {
    const client = createSessionClient(request, cookies);
    const { data, error } = await client.auth.getUser();
    if (error || !data.user) return null;

    const role = await this.resolveRole(data.user.id);
    if (!role) return null;

    return new AuthenticatedUser(
      data.user.id as UserId,
      (data.user.email ?? "") as UserEmail,
      role,
    );
  }

  async signOut(request: Request, cookies: CookieStore): Promise<void> {
    const client = createSessionClient(request, cookies);
    await client.auth.signOut();
  }

  async listStudents(options: ListStudentsOptions): Promise<ListStudentsResult> {
    const { page = 1, perPage = 20 } = options;
    const admin = createServiceClient();
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: perPage + 1 });
    if (error) throw error;

    const users = (data.users ?? [])
      .filter((u) => Boolean(u.email))
      .slice(0, perPage)
      .map((u) => new AuthenticatedUser(u.id as UserId, u.email as UserEmail, "student"));

    return { users, hasNextPage: (data.users ?? []).length > perPage };
  }

  async resolveRole(userId: string): Promise<UserRole | null> {
    const admin = createServiceClient();
    const { data, error } = await admin
      .from(TABLE_USER_ROLES)
      .select("role")
      .eq("user_id", userId)
      .single()
      .overrideTypes<{ role: UserRole } | null, { merge: false }>();
    if (error || !data) return null;
    return data.role;
  }
}
```

`src/lib/acl/adapters/supabase-lesson-progress.adapter.ts`:

```ts
import type { LessonProgressRepository } from "../ports/lesson-progress-repository";
import type { CookieStore } from "../ports/cookie-store";
import {
  LessonCompletion,
  type LessonCompletionResult,
} from "@/lib/services/lesson-completion";
import { LessonNotAccessibleError } from "@/lib/errors/lesson-completion";
import { createSessionClient } from "./supabase-connection.factory";

const CLOSED_EXERCISE_LOOKUP: Record<string, boolean | undefined> = {
  multiple_choice: true,
  fill_in_blank: true,
  true_false: true,
  sentence_transformation: true,
  matching: true,
};

export class SupabaseLessonProgressRepository implements LessonProgressRepository {
  constructor(
    private readonly request: Request,
    private readonly cookies: CookieStore,
  ) {}

  async load(userId: string, lessonId: string): Promise<LessonCompletion> {
    const supabase = createSessionClient(this.request, this.cookies);
    // ... identical domain logic from current lesson-completion.repository.ts,
    // but using the local supabase client and mapping rows to LessonCompletion.
  }

  async save(result: LessonCompletionResult): Promise<void> {
    const supabase = createSessionClient(this.request, this.cookies);
    const { error } = await supabase.from("lesson_progress").insert({
      user_id: result.user_id,
      lesson_id: result.lesson_id,
      completed_at: result.completed_at.toISOString(),
    });
    if (error && error.code !== "23505") throw error;
  }
}
```

### 4.4 Factory for callers

`src/lib/acl/index.ts`:

```ts
import { SupabaseAuthAdapter } from "./adapters/supabase-auth.adapter";
import { SupabaseLessonProgressRepository } from "./adapters/supabase-lesson-progress.adapter";
import { AstroCookieStore } from "./adapters/astro-cookie-store.adapter";
import type { AuthGateway } from "./ports/auth-gateway";
import type { LessonProgressRepository } from "./ports/lesson-progress-repository";
import type { CookieStore } from "./ports/cookie-store";

export function createAuthGateway(): AuthGateway {
  return new SupabaseAuthAdapter();
}

export function createAstroCookieStore(astroCookies: unknown): CookieStore {
  return new AstroCookieStore(astroCookies as import("astro").AstroCookies);
}

export function createLessonProgressRepository(
  request: Request,
  cookies: CookieStore,
): LessonProgressRepository {
  return new SupabaseLessonProgressRepository(request, cookies);
}

export { AstroCookieStore };
export type { AuthGateway, LessonProgressRepository, CookieStore };
export { AuthenticatedUser, type UserRole } from "./domain/session";
```

All callers import only from `src/lib/acl`. The Supabase SDK and the Astro cookie type are invisible outside `src/lib/acl/adapters/`.

## STEP 5 — Proof of isolation + before/after

### 5.1 Files that currently know the dependency

All files in sections 1.1–1.4 will stop importing Supabase directly. After the refactor, the following files will remain the **only** Supabase-aware files:

- `src/lib/acl/adapters/supabase-connection.factory.ts`
- `src/lib/acl/adapters/supabase-auth.adapter.ts`
- `src/lib/acl/adapters/supabase-lesson-progress.adapter.ts`
- `src/lib/acl/adapters/astro-cookie-store.adapter.ts` (Astro-specific, but not Supabase)

### 5.2 Before/after snippets

#### `src/middleware.ts`

Before (`src/middleware.ts:4`, `src/middleware.ts:9-12`):

```ts
import { createClient } from "@/lib/supabase.server";
// ...
const supabase = createClient(context.request.headers, context.cookies);
if (supabase) {
  const { data: { user } } = await supabase.auth.getUser();
  context.locals.user = user ?? null;
  // role lookup via raw client ...
}
```

After:

```ts
import { createAuthGateway, createAstroCookieStore } from "@/lib/acl";
// ...
const user = await createAuthGateway().getSession(
  context.request,
  createAstroCookieStore(context.cookies),
);
context.locals.user = user;
```

`Astro.locals.user` becomes a ready `AuthenticatedUser` domain object, not a raw Supabase `User`.

#### `src/pages/dashboard.astro`

Before (`src/pages/dashboard.astro:5`, `src/pages/dashboard.astro:8`):

```ts
import { createClient } from "@/lib/supabase.server";
const supabase = createClient(Astro.request.headers, Astro.cookies);
```

After:

```ts
const { user } = Astro.locals;
if (!user) return Astro.redirect("/auth/signin");
// user is AuthenticatedUser; no Supabase import.
```

The page layer receives ready domain data.

#### `src/pages/api/lessons/[id]/complete.ts`

Before (`src/pages/api/lessons/[id]/complete.ts:2`, `:5`, `:14`, `:17-20`, `:31`, `:33`):

```ts
import { createClient } from "@/lib/supabase.server";
import type { SupabaseClient } from "@supabase/supabase-js";
// ...
const supabase = createClient(context.request.headers, context.cookies) as SupabaseClient<Database> | null;
const { data: { user } } = await supabase.auth.getUser();
const completion = await loadLessonCompletion(supabase, user.id, validLessonId);
await saveLessonCompletion(supabase, result);
```

After:

```ts
import {
  createAuthGateway,
  createAstroCookieStore,
  createLessonProgressRepository,
} from "@/lib/acl";
// ...
const user = await createAuthGateway().getSession(
  context.request,
  createAstroCookieStore(context.cookies),
);
if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

const repo = createLessonProgressRepository(context.request, createAstroCookieStore(context.cookies));
const completion = await repo.load(user.id, validLessonId);
const result = completion.markComplete();
await repo.save(result);
```

#### `src/lib/services/user-admin.server.ts`

Before (`src/lib/services/user-admin.server.ts:1`, `:4`, `:20`, `:38`):

```ts
import type { User } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase.server";
// ...
const supabaseAdmin = createAdminClient();
const pageUsers = data.users.filter((user): user is User & { email: string } => Boolean(user.email));
```

After:

```ts
import { createAuthGateway } from "@/lib/acl";
// ...
const { users, hasNextPage } = await createAuthGateway().listStudents({ page, perPage });
```

### 5.3 Open questions resolved inside the ACL

| Question | Decision | Where it lives |
|----------|----------|----------------|
| How are Supabase session cookies refreshed during SSR? | The adapter forwards `setAll` calls from `createServerClient` to the `CookieStore` port; the Astro adapter writes them via `Astro.cookies.set`. | `supabase-connection.factory.ts` |
| Should the admin client bypass RLS? | Keep service-role client for admin user listing only; all student-facing persistence goes through the session client so RLS remains effective. | `supabase-auth.adapter.ts` / `supabase-lesson-progress.adapter.ts` |
| What happens when `email` is missing? | Treat the user as not authenticated; domain `AuthenticatedUser` requires a non-empty email. | `supabase-auth.adapter.ts` |
| How is `UserRole` typed? | Domain uses `"admin" \| "student"`; adapter maps the `user_roles.role` text column with `overrideTypes`. | `supabase-auth.adapter.ts` |

## STEP 6 — Verification and plan

### 6.1 Success criterion: grep isolation

After the refactor, the following commands should return **only** files inside `src/lib/acl/adapters/`:

```bash
# From project root
grep -R "@supabase/ssr" src --include="*.ts" --include="*.astro"
grep -R "@supabase/supabase-js" src --include="*.ts" --include="*.astro"
grep -R "createServerClient\|parseCookieHeader\|createClient as createSupabaseClient" src --include="*.ts"
```

The `createClient` re-export from `src/lib/supabase.server.ts` is deleted, so:

```bash
grep -R "from \"@/lib/supabase.server\"" src --include="*.ts" --include="*.astro"
```

should return nothing.

### 6.2 Files that currently know the dependency vs. after refactoring

| Currently knows Supabase SDK | After refactor |
|------------------------------|----------------|
| `src/lib/supabase.server.ts` | Deleted |
| `src/env.d.ts` | Uses `AuthenticatedUser \| null` |
| `src/middleware.ts` | Uses `AuthGateway` |
| `src/pages/dashboard.astro` | Uses `Astro.locals.user` |
| `src/pages/lessons/[id].astro` | Uses `Astro.locals.user` |
| `src/pages/student/profile.astro` | Uses `Astro.locals.user` |
| All `src/pages/admin/**/*.astro` | Use `Astro.locals.user` / `AuthGateway` |
| All `src/pages/api/**/*.ts` | Use `AuthGateway` / `LessonProgressRepository` |
| `src/lib/services/user-admin.server.ts` | Uses `AuthGateway` |
| `src/lib/services/lesson-completion.repository.ts` | Deleted; logic moves to `SupabaseLessonProgressRepository` |
| `src/pages/api/lessons/[id]/complete.ts` | Uses `LessonProgressRepository` port |

### 6.3 Verification plan

1. **Static isolation check:** run the grep commands above and confirm only `src/lib/acl/adapters/*` matches.
2. **Type check:** `npm run typecheck` must pass after updating `env.d.ts` and all callers.
3. **Unit tests:** `npm run test` (Vitest) must pass; add a new contract test for `SupabaseAuthAdapter` that verifies mapping from a mock cookie header to `AuthenticatedUser`.
4. **Playwright tests:** run the existing auth/session specs:
   - `tests/e2e/student-profile.spec.ts`
   - `tests/e2e/lesson-completion-persistence.spec.ts`
   - `tests/integration/lesson-completion.spec.ts`
   - `tests/api-contract/admin-users.spec.ts`
5. **Dependency-cruiser guard:** add a rule in `.dependency-cruiser.js` (or create one) that forbids importing `@supabase/ssr` and `@supabase/supabase-js` outside `src/lib/acl/adapters/**`.
6. **Manual smoke test:** sign in as admin, create a book/chapter/lesson/exercise, then as student complete a lesson. Verify session and progress still work.

### 6.4 Phased refactor plan

| Phase | Scope | Deliverable | Verification |
|-------|-------|-------------|--------------|
| **1** | Scaffold ACL module (`domain/`, `ports/`, `adapters/`, `index.ts`) without touching callers. | PR introduces `src/lib/acl/**` parallel to `src/lib/supabase.server.ts`. | `npm run typecheck` passes; no caller changed. |
| **2** | Migrate middleware and `env.d.ts` to `AuthenticatedUser`. | `Astro.locals.user` is domain VO; middleware uses `AuthGateway`. | Middleware tests / manual login still work. |
| **3** | Migrate auth API routes (`signin.ts`, `signout.ts`, `signup.ts`). | API routes use `AuthGateway`. | Auth Playwright specs pass. |
| **4** | Migrate admin pages and admin API routes to `Astro.locals.user` / `AuthGateway`. | No `createClient` in `src/pages/admin/**`. | Admin CRUD specs pass. |
| **5** | Migrate lesson progress: replace `lesson-completion.repository.ts` with `SupabaseLessonProgressRepository`; update `complete.ts`. | `SupabaseClient<Database>` disappears from services and API. | Lesson-completion specs pass. |
| **6** | Delete `src/lib/supabase.server.ts`; add dependency-cruiser rule. | Zero direct Supabase imports outside adapters. | Grep isolation check + full test suite. |

Each phase should be a separate, reviewable PR to keep risk small and rollback easy.

---

## Summary

The worst leak in BET is the Supabase auth/session SDK bleeding through `src/lib/supabase.server.ts` into middleware, every protected page, every protected API route, and two domain services. The same `createClient(...)` + `supabase.auth.getUser()` pattern is duplicated in ~30 files, and library types (`User`, `SupabaseClient`) pollute `env.d.ts`, `user-admin.server.ts`, and `lesson-completion.repository.ts`. The ACL design centralizes all Supabase knowledge inside `src/lib/acl/adapters/`, exposes a domain `AuthenticatedUser` value object, and defines narrow ports (`AuthGateway`, `LessonProgressRepository`, `CookieStore`) that the rest of the application uses. After the refactor, grep for `@supabase/ssr` and `@supabase/supabase-js` should return only adapter files, and the UI/API layers will receive ready domain objects instead of raw library clients.
