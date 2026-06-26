# Database — Local Dev Guide

## Quick Start

Requires Docker Desktop running.

```bash
npm run db:start    # start Supabase containers (~30s first time)
npm run db:reset    # wipe + apply migrations + apply seed (~10s)
npm run db:stop     # stop containers
npm run db:gen-types  # regenerate src/lib/database.types.ts after schema changes
```

Supabase Studio: http://127.0.0.1:54323

## Seed Credentials

Local dev only — never real passwords.

| Role    | Email               | Password      |
|---------|---------------------|---------------|
| admin   | admin@bet.local     | admin-pass    |
| student | student@bet.local   | student-pass  |

## Scripts Reference

| Script            | Effect                                                        |
|-------------------|---------------------------------------------------------------|
| `db:start`        | Start local Supabase containers (DB, Auth, Studio, REST)      |
| `db:stop`         | Stop containers (data persists in Docker volumes)             |
| `db:reset`        | **Destructive locally.** Wipes DB, applies migrations + seed  |
| `db:gen-types`    | Generates `src/lib/database.types.ts` from running local DB   |

> `db:reset` is safe locally — it wipes only the local Docker volume.
> Never run `supabase db push` against production without reviewing the diff first.

## Schema Overview

8 tables + 1 view in `public` schema.

```
auth.users (Supabase managed)
  └─ user_roles           (role: admin | student)
  └─ user_book_access     (granted access to books)
  └─ lesson_progress      (append-only completion markers)

books
  └─ chapters (ord)
       └─ lessons (ord)
            └─ exercises (type enum, payload jsonb)
                  └─ exercise_keys (answer variants)

VIEW: chapter_progress   (derived from chapters × user_book_access × lesson_progress)
```

## Regenerating Types

Run after every migration change:

```bash
npm run db:gen-types
```

Commit the updated `src/lib/database.types.ts`. All future slices import from it:

```ts
import type { Database } from '@/lib/database.types'
```

## RLS Verification Matrix

Expected behavior per table × action × role. Verify manually when modifying policies.

Legend: ✅ = succeeds / rows returned | ❌ = blocked / 0 rows | ⚙️ = service_role bypasses RLS

### user_roles

| Action | Admin | Student (own row) | Student (other row) | Anon |
|--------|-------|-------------------|---------------------|------|
| SELECT | ✅ all rows | ✅ own row only | ❌ | ❌ |
| INSERT | ✅ | ❌ | ❌ | ❌ |
| UPDATE | ✅ | ❌ | ❌ | ❌ |
| DELETE | ✅ | ❌ | ❌ | ❌ |

Note: trigger `handle_new_user` runs `SECURITY DEFINER` and bypasses RLS for the automatic insert on signup.

### books

| Action | Admin | Student (with access) | Student (no access) | Anon |
|--------|-------|----------------------|---------------------|------|
| SELECT | ✅ all | ✅ own books only | ❌ | ❌ |
| INSERT | ✅ | ❌ | ❌ | ❌ |
| UPDATE | ✅ | ❌ | ❌ | ❌ |
| DELETE | ✅ | ❌ | ❌ | ❌ |

### user_book_access

| Action | Admin | Student (own row) | Student (other row) | Anon |
|--------|-------|-------------------|---------------------|------|
| SELECT | ✅ all | ✅ own row | ❌ | ❌ |
| INSERT | ✅ | ❌ | ❌ | ❌ |
| UPDATE | ✅ | ❌ | ❌ | ❌ |
| DELETE | ✅ | ❌ | ❌ | ❌ |

### chapters

| Action | Admin | Student (book access) | Student (no book access) | Anon |
|--------|-------|-----------------------|--------------------------|------|
| SELECT | ✅ all | ✅ chapters of accessible books | ❌ | ❌ |
| INSERT | ✅ | ❌ | ❌ | ❌ |
| UPDATE | ✅ | ❌ | ❌ | ❌ |
| DELETE | ✅ | ❌ | ❌ | ❌ |

### lessons

| Action | Admin | Student (lesson accessible) | Student (no access) | Anon |
|--------|-------|-----------------------------|---------------------|------|
| SELECT | ✅ all | ✅ lessons in accessible books | ❌ | ❌ |
| INSERT | ✅ | ❌ | ❌ | ❌ |
| UPDATE | ✅ | ❌ | ❌ | ❌ |
| DELETE | ✅ | ❌ | ❌ | ❌ |

Access chain: `has_lesson_access(id)` → lesson → chapter → book → `user_book_access`.

### exercises

| Action | Admin | Student (lesson accessible) | Student (no access) | Anon |
|--------|-------|-----------------------------|---------------------|------|
| SELECT | ✅ all | ✅ exercises in accessible lessons | ❌ | ❌ |
| INSERT | ✅ | ❌ | ❌ | ❌ |
| UPDATE | ✅ | ❌ | ❌ | ❌ |
| DELETE | ✅ | ❌ | ❌ | ❌ |

### exercise_keys

| Action | Admin | Student (exercise accessible) | Student (no access) | Anon |
|--------|-------|-------------------------------|---------------------|------|
| SELECT | ✅ all | ✅ keys for accessible exercises | ❌ | ❌ |
| INSERT | ✅ | ❌ | ❌ | ❌ |
| UPDATE | ✅ | ❌ | ❌ | ❌ |
| DELETE | ✅ | ❌ | ❌ | ❌ |

### lesson_progress

| Action | Admin | Student (own row, lesson accessible) | Student (own row, no lesson access) | Anon |
|--------|-------|--------------------------------------|--------------------------------------|------|
| SELECT | ✅ all | ✅ own rows | ✅ own rows | ❌ |
| INSERT | ⚙️ via service_role | ✅ own progress on accessible lesson | ❌ | ❌ |
| UPDATE | ❌ (no policy, even service_role via SDK) | ❌ | ❌ | ❌ |
| DELETE | ❌ (no policy, even service_role via SDK) | ❌ | ❌ | ❌ |

**Critical:** No UPDATE or DELETE policies exist on `lesson_progress`. This is intentional — enforces NFR "progress is not lost" for `authenticated` users. `service_role` bypasses RLS completely, both through direct SQL/Studio and through the Supabase SDK/PostgREST. Immutability must be enforced at the application layer for service-role callers if ever needed.

### VIEW: chapter_progress

Not an RLS-secured object (Postgres does not support RLS on views). Access is controlled by the underlying tables:
- Student: sees only (chapter, self) pairs where they have `user_book_access`
- Admin: sees all (chapter, user) pairs
- Anon: 0 rows (no `user_book_access` rows visible)

## Helper Functions

All helpers are `SECURITY DEFINER STABLE SET search_path = ''`:

| Function | Returns | Used in |
|----------|---------|---------|
| `is_admin()` | boolean | Most table SELECT/write policies |
| `has_book_access(book_id)` | boolean | chapters SELECT |
| `has_lesson_access(lesson_id)` | boolean | lessons/exercises SELECT, lesson_progress INSERT |
| `has_exercise_access(exercise_id)` | boolean | exercise_keys SELECT |

`SET search_path = ''` prevents search_path injection on SECURITY DEFINER functions.
All internal references are fully qualified (`public.user_roles`, `auth.uid()`).
