# M4L2 Structure Artifact — Dependency Graph (BET, branch `module-4`)

## 1. Tool & commands used

Primary tool: **dependency-cruiser 18.0.0** (dev dependency already installed). It was chosen because it resolves TypeScript path aliases (`@/*`) and distinguishes aliased vs. local imports.

Known limitation: dependency-cruiser does **not** parse `.astro` frontmatter out of the box, so the raw output misses all Astro pages, layouts, and Astro components. To get a complete picture of `src/`, the analysis combines:

1. `depcruise` JSON output for `.ts` / `.tsx` modules and their resolved edges.
2. A deterministic frontmatter-import parser for `.astro` files (see §8 for the script).

### Reproduction commands

```bash
# 1. dependency-cruiser config (temporary, saved outside the repo)
cat > /tmp/depcruise-config.mjs <<'EOF'
/** @type {import('dependency-cruiser').IConfiguration} */
export default {
  options: {
    doNotFollow: { path: 'node_modules' },
    tsConfig: { fileName: 'tsconfig.json' },
    moduleSystems: ['es6', 'cjs'],
    enhancedResolveOptions: {
      extensions: ['.ts', '.tsx', '.astro', '.js', '.jsx', '.json'],
    },
    progress: { type: 'none' },
  },
};
EOF

# 2. Run dependency-cruiser on src/ (JSON)
npx depcruise \
  --config "C:/tmp/depcruise-config.mjs" \
  src \
  --include-only "^src" \
  --output-type json \
  --exclude ".*\\.d\\.ts$|.*\\.test\\.[jt]sx?$|.*\\.spec\\.[jt]sx?$|.*\\.snap$|.*\\.stories\\.[jt]sx?$" \
  > depcruise-src.json

# 3. Run dependency-cruiser on src/ (human-readable text)
npx depcruise \
  --config "C:/tmp/depcruise-config.mjs" \
  src \
  --include-only "^src" \
  --output-type text \
  --exclude ".*\\.d\\.ts$|.*\\.test\\.[jt]sx?$|.*\\.spec\\.[jt]sx?$|.*\\.snap$|.*\\.stories\\.[jt]sx?$"

# 4. Madge was used as a cross-check but returned many false negatives for .astro
npx madge --extensions ts,tsx,astro --ts-config tsconfig.json src --json > madge-src.json

# 5. Skott was also tried but failed to process Astro entrypoints meaningfully.
```

### Method note

- Excluded: `node_modules`, `*.d.ts`, `*.test.*`, `*.spec.*`, `*.snap`, `*.stories.*`, generated files, `public/`.
- `.astro` files were parsed by extracting `import … from '…'` statements from frontmatter only (the `--- … ---` block).
- Path aliases (`@/*`) were resolved against `./src/*` per `tsconfig.json`.
- Relative imports (`./` and `../`) were resolved from the source file's directory.
- Bare imports (e.g. `marked`, `zod`, `astro:env/server`) were ignored for the in-repo graph.

### Graph summary

| Graph | Nodes | Edges | Orphans |
|-------|-------|-------|---------|
| depcruise raw (`.ts`/`.tsx` only) | 47 | ~50 | 3 (`ExerciseForm.tsx`, `config-status.ts`, `database.types.ts`) |
| Combined (`.ts`/`.tsx`/`.astro`) | 76 | 146 | 3 (`LibBadge.astro`, `config-status.ts`, `database.types.ts`) |

The combined graph is the one used for the structural findings below.

---

## 2. Entry points

Entry points are source files with **no incoming edges from other source files** but that Astro itself invokes as routes or layout roots.

### SSR pages (student + auth)

- `src/pages/index.astro`
- `src/pages/dashboard.astro`
- `src/pages/lessons/[id].astro`
- `src/pages/student/profile.astro`
- `src/pages/auth/signin.astro`
- `src/pages/auth/signup.astro`
- `src/pages/auth/confirm-email.astro`

### Admin pages

- `src/pages/admin/index.astro`
- `src/pages/admin/users.astro`
- `src/pages/admin/books/index.astro`
- `src/pages/admin/books/new.astro`
- `src/pages/admin/books/[id]/edit.astro`
- `src/pages/admin/chapters/index.astro`
- `src/pages/admin/chapters/new.astro`
- `src/pages/admin/chapters/[id]/edit.astro`
- `src/pages/admin/lessons/index.astro`
- `src/pages/admin/lessons/new.astro`
- `src/pages/admin/lessons/[id]/edit.astro`
- `src/pages/admin/exercises/index.astro`
- `src/pages/admin/exercises/new.astro`
- `src/pages/admin/exercises/[id]/edit.astro`

### API routes

- `src/pages/api/auth/signin.ts`
- `src/pages/api/auth/signup.ts`
- `src/pages/api/auth/signout.ts`
- `src/pages/api/lessons/[id]/complete.ts`
- `src/pages/api/exercises/verify.ts`
- `src/pages/api/admin/users.ts`
- `src/pages/api/admin/users/[id]/grant.ts`
- `src/pages/api/admin/users/[id]/revoke.ts`
- `src/pages/api/admin/books/index.ts`
- `src/pages/api/admin/books/[id].ts`
- `src/pages/api/admin/chapters/index.ts`
- `src/pages/api/admin/chapters/[id].ts`
- `src/pages/api/admin/lessons/index.ts`
- `src/pages/api/admin/lessons/[id].ts`
- `src/pages/api/admin/exercises/index.ts`
- `src/pages/api/admin/exercises/[id].ts`

### Layout / middleware roots

- `src/layouts/AdminLayout.astro`
- `src/layouts/Layout.astro`
- `src/middleware.ts`

### Observation

`pages/admin/index.astro` is an entry point with **zero imports and zero dependents** (true orphan in the combined graph). It appears to be a placeholder or dead landing page; worth confirming whether it is reachable from the admin nav or still under construction.

`components/ui/LibBadge.astro` is also orphan — likely an unused UI component.

---

## 3. Layer boundaries and whether they are respected

Layers were mapped from the directory structure that the territory analysis also highlighted (`artifact-1-territory.md`):

| Layer | Files | Role |
|-------|-------|------|
| **Student pages** | `pages/*` except `pages/admin/**`, `pages/api/**` | Public / student SSR routes |
| **Admin pages** | `pages/admin/**` | Admin SSR routes |
| **API routes** | `pages/api/**` | Astro API endpoints |
| **Layouts** | `src/layouts/**` | Page shells |
| **Auth components** | `components/auth/**` | Sign-in/up forms, fields |
| **Admin components** | `components/admin/**` | Admin tables, forms, editors |
| **Lesson components** | `components/lesson/**` | Exercise renderers |
| **UI components** | `components/ui/**` | Shared primitives |
| **Shared components** | `components/*.{astro,tsx}` + `components/ui/LibBadge.astro` etc. | Top-level shared |
| **Services** | `lib/services/**` | Domain services |
| **Lib** | `lib/*` (not services) | Supabase client, utils, schemas, logger, markdown, verify-exercise |
| **Middleware** | `middleware.ts` | Auth/role guards |

### Layer → layer edge matrix

| Source \ Dest | API routes | Admin pages | Admin comp | Auth comp | Layouts | Lesson comp | Lib | Middleware | Services | Shared | Student pages | UI comp |
|---------------|-----------:|------------:|-----------:|----------:|--------:|------------:|----:|-----------:|---------:|-------:|--------------:|--------:|
| API routes    | .          | .           | .          | .         | .       | .           | 27  | .          | 1        | .      | .             | .       |
| Admin comp    | .          | .           | .          | 1         | .       | .           | 2   | .          | 1        | .      | .             | 1       |
| Admin pages   | .          | .           | 9          | 11        | 13      | .           | 12  | .          | 1        | .      | .             | 14      |
| Auth comp     | .          | .           | .          | 8         | .       | .           | 1   | .          | .        | .      | .             | 1       |
| Layouts       | .          | .           | .          | .         | 2       | .           | 2   | .          | .        | 2      | .             | .       |
| Lesson comp   | .          | .           | .          | .         | .       | 6           | .   | .          | .        | .      | .             | .       |
| Lib           | .          | .           | .          | .         | .       | .           | 1   | .          | .        | .      | .             | .       |
| Middleware    | .          | .           | .          | .         | .       | .           | 1   | .          | .        | .      | .             | .       |
| Services      | .          | .           | .          | .         | .       | .           | 2   | .          | .        | .      | .             | .       |
| Shared        | .          | .           | .          | .         | .       | .           | .   | .          | .        | 1      | .             | .       |
| Student pages | .          | .           | .          | 4         | 7       | 1           | 5   | .          | .        | 2      | .             | 2       |
| UI comp       | .          | .           | .          | .         | .       | .           | 5   | .          | .        | .      | .             | .       |

### Boundary verdict

✅ **Mostly respected.** The dependency direction is consistently **outer → inner**:

- Pages depend on layouts, components, services, and lib.
- API routes depend on services and lib.
- Components depend on UI primitives and lib utilities.
- Services depend on lib (logger, supabase).
- Middleware depends on lib/supabase.

✅ **No admin ↔ student coupling.** Admin pages/components never import lesson components, and student pages never import admin components. The two product sides identified in `artifact-1-territory.md` are structurally isolated.

⚠️ **Small boundary notes:**

1. **Auth components are used by admin pages** (`ServerError` appears in 11 admin pages). This is reasonable — error display is cross-cutting — but it means changes to `ServerError` affect both surfaces.
2. **UI components depend only on `lib/utils.ts`** (`cn` helper). That is a clean, thin dependency.
3. **Layouts depend on shared components and lib/config-status.ts**, so layout changes ripple through every page.
4. **`lib/utils.ts` is imported by every layer** (16 edges). It is a pure-utility file, but its blast radius is maximal.

---

## 4. Central hubs and thin adapters

### High fan-in hubs (many files depend on them)

| Hub | Fan-in | Why it matters |
|-----|--------|----------------|
| `src/lib/supabase.ts` | 32 | Single Supabase client. Every server-side page, API route, middleware, and the user-admin service depends on it. |
| `src/lib/utils.ts` | 16 | `cn`, `uuidSchema`, decode helpers. Used by UI components, auth components, admin components, API routes, pages. |
| `src/components/auth/ServerError.tsx` | 16 | Error display component used by admin pages, student pages, and auth forms. |
| `src/layouts/AdminLayout.astro` | 13 | Shell for every admin page. |
| `src/layouts/Layout.astro` | 7 | Shell for student/auth pages. |
| `src/components/ui/input.tsx` | 6 | Used by auth forms and admin forms. |
| `src/components/ui/label.tsx` | 6 | Used by auth forms and admin forms. |

### High fan-out files (depend on many others)

| File | Fan-out | What it pulls in |
|------|---------|------------------|
| `src/pages/admin/lessons/[id]/edit.astro` | 6 | AdminLayout, MarkdownEditor, input/label/textarea, supabase |
| `src/pages/admin/books/[id]/edit.astro` | 6 | AdminLayout, DeleteButton, input/label/textarea, supabase |
| `src/pages/admin/lessons/new.astro` | 6 | Same pattern as edit |
| `src/components/lesson/LessonInteractive.tsx` | 6 | All 6 exercise type components |
| `src/pages/admin/users.astro` | 5 | AdminLayout, ServerError, UsersTable, supabase, user-admin service |
| `src/pages/lessons/[id].astro` | 5 | Layout, LessonInteractive, supabase, utils, markdown |
| `src/pages/student/profile.astro` | 5 | Layout, Topbar, ServerError, SafeImage, supabase |

### Thin adapters

- `src/lib/services/user-admin.ts` — domain service that hides user/access queries from `pages/api/admin/users.ts`, `pages/api/admin/users/[id]/grant.ts`, `pages/api/admin/users/[id]/revoke.ts`, and `components/admin/UsersTable.tsx`. Fan-in 3, fan-out 2. It is a proper adapter around `lib/supabase.ts`.
- `src/lib/verify-exercise.ts` — extracted service used only by `pages/api/exercises/verify.ts` and its unit tests. Thin, single-responsibility.
- `src/lib/markdown.ts` — tiny sanitization wrapper used by `pages/lessons/[id].astro` and `components/admin/MarkdownEditor.tsx`.
- `src/lib/logger.ts` — single `logServerError` sink used by API routes and the user-admin service.

### Hub risk summary

`lib/supabase.ts` is the biggest structural chokepoint: 32/146 edges (~22%) flow through it. A change to client creation, session handling, or env variable usage affects the entire server surface. `lib/utils.ts` and `layouts/AdminLayout.astro` are the next biggest concentrators.

---

## 5. Cycles and tangled boundaries

### Import cycles

**None found.** The combined static import graph is acyclic (`0` directed cycles).

This applies to both:
- `.ts`/`.tsx` subgraph resolved by dependency-cruiser.
- Full `.ts`/`.tsx`/`.astro` graph resolved by frontmatter parsing.

### Tangled boundaries

The graph is a clean DAG, but there are **tight co-change clusters** that the territory analysis also flagged (`artifact-1-territory.md` §5):

1. **Admin user/access cluster** — `lib/services/user-admin.ts`, `pages/api/admin/users.ts`, `pages/api/admin/users/[id]/grant.ts`, `pages/api/admin/users/[id]/revoke.ts`, `pages/admin/users.astro`, `components/admin/UsersTable.tsx`. These files are not cyclical, but they form a dense star around the user-admin service and are always changed together.

2. **Exercise admin cluster** — `pages/admin/exercises/[id]/edit.astro` ↔ `components/admin/ExerciseForm.tsx` ↔ `pages/api/admin/exercises/[id].ts` / `pages/api/admin/exercises/index.ts`. ExerciseForm is the visual hub; it is currently an orphan in the depcruise-only graph because depcruise does not resolve `.astro` imports, but the combined graph shows it is used by both `new.astro` and `[id]/edit.astro`.

3. **Lesson exercise cluster** — `components/lesson/LessonInteractive.tsx` fans out to all six exercise-type components. This is a controller → renderer fan-out, not a cycle, but it makes LessonInteractive a single point of failure for every exercise type.

### Boundary between lib and API routes

All API routes go through `lib/supabase.ts` or `lib/services/user-admin.ts`. No API route imports another API route. Good separation.

---

## 6. Test-isolation risks

Files that pull in many dependencies are harder to unit-test without broad mocking.

### High coupling / high fan-out

| File | Risk |
|------|------|
| `pages/admin/lessons/[id]/edit.astro` | Pulls layout + editor + UI + DB. Astro page tests would need a full integration harness. |
| `pages/admin/books/[id]/edit.astro` | Same pattern. |
| `pages/lessons/[id].astro` | Pulls layout, Supabase, markdown, LessonInteractive, utils. |
| `components/lesson/LessonInteractive.tsx` | Pulls all 6 exercise components. Any exercise type regression surfaces here. |

### Global / singleton dependencies

| File | Why it is risky for tests |
|------|---------------------------|
| `src/lib/supabase.ts` | Reads `astro:env/server` at module load. Unit tests must mock the Astro env module or the `createClient` call. |
| `src/middleware.ts` | Depends on `lib/supabase.ts` and mutates `Astro.locals`. Requires Astro middleware test harness. |
| `src/layouts/AdminLayout.astro` | Reads `Astro.locals` and `Astro.props`. Component-level unit testing is awkward; mostly E2E/ integration tested. |
| `src/lib/utils.ts` | Stateless pure functions, but imported by 16 files. A signature change is a breaking change across all consumers. |

### Easier-to-test thin adapters

| File | Why it is easy to test |
|------|------------------------|
| `src/lib/verify-exercise.ts` | Pure logic, no Astro/Supabase import. Already has unit tests (`verify-exercise.test.ts`, `verify-contract.test.ts`). |
| `src/lib/services/user-admin.ts` | Depends only on `lib/supabase.ts` and `lib/logger.ts`; can be tested with a mocked Supabase client. |
| `src/lib/markdown.ts` | Pure function wrapper. |

### Recommendations from the graph

- Keep `verify-exercise.ts` as the canonical example of a testable service.
- Consider extracting the markdown-to-HTML + exercise loading logic out of `pages/lessons/[id].astro` into a service if lesson-page unit tests are needed.
- The user-admin service is already a good isolation layer; tests for `grant.ts`/`revoke.ts` should mock `user-admin.ts` rather than Supabase directly.

---

## 7. Unknowns that static import graphs miss

A dependency graph shows **compile-time imports**, not runtime behavior. The following are invisible or under-reported:

### Runtime config / env vars

- `src/lib/supabase.ts` reads `SUPABASE_URL`, `SUPABASE_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` from `astro:env/server`. The graph shows the file is a hub but cannot tell whether the admin client (`createAdminClient`) is used safely only on the server.
- `src/pages/auth/confirm-email.astro` uses `import.meta.env.DEV` to auto-confirm emails in development. This is a runtime branch the graph cannot express.

### No dynamic imports

No `import()` or `React.lazy()` calls were found in `src/` except a type import in `src/env.d.ts`. All dependencies are static and visible.

### No dependency injection / React Context

No `createContext`/`useContext` usage was found. State is passed via props or read from `Astro.locals`. This keeps the graph honest: if a file is not imported, it is likely unused.

### Database / RLS logic

The graph shows that `pages/api/exercises/verify.ts` → `lib/verify-exercise.ts` and that many files import `lib/supabase.ts`. It does **not** show that the correctness of the entire app depends on Supabase RLS policies (e.g. lesson access is gated by `user_book_access`). RLS is a runtime boundary, not an import.

### Astro runtime bindings

- `Astro.locals` is populated by `middleware.ts` (sets `user`, `role`) and consumed by many pages. The static graph only shows the middleware → supabase edge, not the middleware → pages data flow.
- `Astro.cookies` / `Astro.request.headers` are passed into `createClient(...)` everywhere. This runtime contract is not visible statically.

### `public/` assets

`public/template.png`, `public/favicon.png` are not part of the import graph but are served. The SafeImage component references them at runtime.

### Generated types

`src/lib/database.types.ts` is generated by `supabase gen types`. It appears as an orphan, which is correct — it is imported only for TypeScript types and often used implicitly via `supabase.from(...)`.

### Feature flags

No feature-flag system was found. The only environment-based branch is `import.meta.env.DEV` in `confirm-email.astro`.

---

## 8. Supplementary: combined graph extraction script

The `.astro` frontmatter parser used to produce the combined graph. Run from repo root on branch `module-4`:

```python
import re
from pathlib import Path
from collections import defaultdict

SRC = Path('src')
FRONTMATTER_RE = re.compile(r"^---\s*\n(.*?)\n---", re.DOTALL)
IMPORT_RE = re.compile(r"['\"]([^'\"]+)['\"]")

def extract_imports(path: Path) -> list[str]:
    text = path.read_text(encoding='utf-8')
    if path.suffix == '.astro':
        m = FRONTMATTER_RE.match(text)
        if not m:
            return []
        text = m.group(1)
    imports = []
    for line in text.splitlines():
        line = line.strip()
        if line.startswith('import '):
            m = IMPORT_RE.search(line)
            if m:
                imports.append(m.group(1))
    return imports

def resolve_import(source: Path, spec: str) -> Path | None:
    if spec.startswith('@/'):
        target = SRC / spec[2:]
    elif spec.startswith('.'):
        target = source.parent / spec
    else:
        return None
    if target.exists():
        return target
    for ext in ['.ts', '.tsx', '.astro', '.js', '.jsx']:
        if target.with_suffix(ext).exists():
            return target.with_suffix(ext)
    for ext in ['.ts', '.tsx', '.astro', '.js', '.jsx']:
        if (target / f'index{ext}').exists():
            return target / f'index{ext}'
    return None

nodes = set()
edges = []
for path in sorted(SRC.rglob('*')):
    if path.suffix not in ('.ts', '.tsx', '.astro'):
        continue
    if '.test.' in path.name or '.spec.' in path.name or path.name.endswith('.d.ts'):
        continue
    rel = str(path.relative_to(SRC)).replace('\\', '/')
    nodes.add(rel)
    for spec in extract_imports(path):
        target = resolve_import(path, spec)
        if target and (SRC in target.parents or target == SRC):
            target_rel = str(target.relative_to(SRC)).replace('\\', '/')
            edges.append((rel, target_rel))

edges = sorted(set(edges))
print(f"nodes={len(nodes)}, edges={len(edges)}")
```

---

## 9. Key takeaways

1. **The code base has a clean layered DAG with no import cycles.** The directory structure is a reliable map of the dependency structure.
2. **`lib/supabase.ts`, `lib/utils.ts`, and `layouts/AdminLayout.astro` are the three biggest hubs.** Changes here need extra scrutiny.
3. **Admin and student surfaces are structurally isolated**, matching the two-sided product model seen in the git history.
4. **The hottest co-change clusters from `artifact-1-territory.md`** (user-admin access, exercise admin) correspond to dense dependency stars in this graph, but they are acyclic and therefore safe to refactor incrementally.
5. **The main graphing gap is `.astro` frontmatter.** Future map updates should either automate Astro parsing or add a custom dependency-cruiser extension for `.astro`.
6. **Biggest hidden risk:** `lib/supabase.ts` + `middleware.ts` + RLS policies form a runtime security chokepoint that static imports can only point to, not validate.
