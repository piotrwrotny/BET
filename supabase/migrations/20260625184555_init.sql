-- =============================================================================
-- BET F-01: Data Foundation Bootstrap Migration
-- =============================================================================
-- Creates the complete schema for BET MVP: roles, content, exercises, progress.
-- All RLS policies are role-aware (admin vs student) and built on helper
-- functions running with SECURITY DEFINER + SET search_path = '' for safety.
--
-- Sections (apply order matters — FK dependencies + helper body resolution):
--   1. Extensions
--   2. Enums
--   3. Tables (FK chain: roles -> books -> access -> chapters -> lessons ->
--      exercises -> exercise_keys -> lesson_progress)
--   4. Helper functions (defined after tables so bodies resolve cleanly)
--   5. View `chapter_progress` (FR-016 derived state)
--   6. Trigger `handle_new_user` (default role on signup)
--   7. RLS enable + per-table policies
-- =============================================================================

-- =========================================================================
-- Section 1: Extensions
-- =========================================================================
-- pgcrypto provides crypt() and gen_salt() used by seed.sql when hashing
-- local-dev passwords on direct inserts into auth.users.
-- moddatetime auto-maintains updated_at columns.
-- gen_random_uuid() is built into PG13+, no extension needed for it.
create extension if not exists pgcrypto;
create extension if not exists moddatetime;

-- =========================================================================
-- Section 2: Enums
-- =========================================================================
create type public.user_role as enum ('admin', 'student');

create type public.exercise_type as enum (
  'multiple_choice',
  'fill_in_blank',
  'matching',
  'true_false',
  'sentence_transformation',
  'open_ended'
);

-- =========================================================================
-- Section 3: Tables
-- =========================================================================

-- 3.1 user_roles — maps auth.users.id to a single role (admin or student).
-- Default 'student'; trigger handle_new_user inserts a row on every new
-- auth.users row. Admin is promoted by service_role or by seed.sql.
create table public.user_roles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role public.user_role not null default 'student',
  created_at timestamptz not null default now()
);

-- 3.2 books — top-level content unit (a preparation course / textbook).
create table public.books (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  cover_url text,
  description text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger books_updated_at
  before update on public.books
  for each row
  execute function moddatetime(updated_at);

-- 3.3 user_book_access — granted access per (FR-003). Composite PK on
-- (user_id, book_id) makes per-user lookup cheap; a reverse-lookup index on
-- book_id covers admin "users of this book" queries.
create table public.user_book_access (
  user_id uuid references auth.users(id) on delete cascade,
  book_id uuid references public.books(id) on delete cascade,
  granted_at timestamptz not null default now(),
  primary key (user_id, book_id)
);

create index user_book_access_book_id_idx on public.user_book_access(book_id);

-- 3.4 chapters — ordered subdivisions of a book.
create table public.chapters (
  id uuid primary key default gen_random_uuid(),
  book_id uuid not null references public.books(id) on delete cascade,
  title text not null,
  ord int not null,
  created_at timestamptz not null default now(),
  unique (book_id, ord)
);

-- 3.5 lessons — ordered blog-post content within a chapter (FR-014).
-- `content` is treated as opaque rich text (Markdown/HTML); renderer choice
-- lives in S-01.
create table public.lessons (
  id uuid primary key default gen_random_uuid(),
  chapter_id uuid not null references public.chapters(id) on delete cascade,
  title text not null,
  content text not null,
  ord int not null,
  created_at timestamptz not null default now(),
  unique (chapter_id, ord)
);

-- 3.6 exercises — per-lesson, discriminated by `type`. `payload` holds the
-- type-specific structure (options for MC, blanks for fill-in, pairs for
-- matching, etc). App-side Zod schema enforces shape per type.
create table public.exercises (
  id uuid primary key default gen_random_uuid(),
  lesson_id uuid not null references public.lessons(id) on delete cascade,
  type public.exercise_type not null,
  prompt text not null,
  payload jsonb not null default '{}'::jsonb,
  ord int not null,
  created_at timestamptz not null default now(),
  unique (lesson_id, ord)
);

-- 3.7 exercise_keys — flat list of acceptable answer variants per FR-024.
-- `key_metadata` is optional structured info (e.g., matching pair sides,
-- "is_reference_only" flag for open-ended model answers).
create table public.exercise_keys (
  id uuid primary key default gen_random_uuid(),
  exercise_id uuid not null references public.exercises(id) on delete cascade,
  key_text text not null,
  key_metadata jsonb,
  ord int not null,
  unique (exercise_id, ord)
);

-- 3.8 lesson_progress — append-only completion marker. Row presence equals
-- "lesson completed". No `completed boolean` field, no UPDATE/DELETE RLS
-- policies (Section 7.8) — enforces NFR "progress is not lost".
create table public.lesson_progress (
  user_id uuid not null references auth.users(id) on delete cascade,
  lesson_id uuid not null references public.lessons(id) on delete cascade,
  completed_at timestamptz not null default now(),
  primary key (user_id, lesson_id)
);

-- =========================================================================
-- Section 4: Helper functions (RLS predicates)
-- =========================================================================
-- Helpers live in an un-exposed `private` schema to avoid exposing them as
-- PostgREST RPC endpoints. All helpers are SECURITY DEFINER + STABLE +
-- SET search_path = '' per Supabase guidance. Bodies use fully-qualified
-- names (`public.user_roles`, `auth.uid()`) so search_path can't be hijacked.
-- =========================================================================

create schema if not exists private;

create or replace function private.is_admin()
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select exists (
    select 1
    from public.user_roles
    where user_id = auth.uid()
      and role = 'admin'
  );
$$;

create or replace function private.has_book_access(_book_id uuid)
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select private.is_admin() or exists (
    select 1
    from public.user_book_access
    where user_id = auth.uid()
      and book_id = _book_id
  );
$$;

create or replace function private.has_lesson_access(_lesson_id uuid)
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select private.is_admin() or exists (
    select 1
    from public.lessons l
    join public.chapters c on c.id = l.chapter_id
    join public.user_book_access uba on uba.book_id = c.book_id
    where l.id = _lesson_id
      and uba.user_id = auth.uid()
  );
$$;

create or replace function private.has_exercise_access(_exercise_id uuid)
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select private.is_admin() or exists (
    select 1
    from public.exercises e
    where e.id = _exercise_id
      and private.has_lesson_access(e.lesson_id)
  );
$$;

-- =========================================================================
-- Section 5: View — chapter_progress (FR-016 aggregate)
-- =========================================================================
-- Derived state computed at read time. SECURITY INVOKER (Postgres default
-- for views) means RLS on underlying tables filters rows per caller: a
-- student sees only their own (chapter, self) rows through their own
-- user_book_access rows; admin sees all (chapter, user) pairs.
--
-- Schema:
--   chapter_id, book_id, user_id, lessons_total, lessons_completed,
--   completed_at (set only when lessons_total > 0 AND
--                 lessons_total = lessons_completed; else NULL)
-- =========================================================================

create view public.chapter_progress as
select
  c.id as chapter_id,
  c.book_id,
  uba.user_id,
  count(distinct l.id) as lessons_total,
  count(distinct lp.lesson_id) as lessons_completed,
  case
    when count(distinct l.id) > 0
     and count(distinct l.id) = count(distinct lp.lesson_id)
    then max(lp.completed_at)
    else null
  end as completed_at
from public.chapters c
join public.user_book_access uba on uba.book_id = c.book_id
left join public.lessons l on l.chapter_id = c.id
left join public.lesson_progress lp
       on lp.lesson_id = l.id
      and lp.user_id = uba.user_id
group by c.id, c.book_id, uba.user_id;

-- =========================================================================
-- Section 6: Trigger — default role on signup
-- =========================================================================
-- After every new auth.users row (signup, admin invite, seed insert),
-- automatically insert a corresponding user_roles row with role='student'.
-- SECURITY DEFINER bypasses RLS on user_roles for this single insert (the
create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.user_roles (user_id, role)
  values (new.id, 'student');
  return new;
end;
$$;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function private.handle_new_user();

-- =========================================================================
-- Section 7: RLS enable + policies
-- =========================================================================
-- Pattern per table:
--   - select: caller owns the row OR (select private.is_admin()) OR
--             (caller has access via helper wrapped in SELECT for initPlan)
--   - insert/update/delete: admin-only ((select private.is_admin())),
--             with two exceptions:
--               * user_roles INSERT — handled by SECURITY DEFINER trigger;
--                 client-side INSERT is admin-only
--               * lesson_progress INSERT — student inserts own progress on
--                 accessible lessons; no UPDATE/DELETE policies at all,
--                 enforcing NFR "progress is not lost"
-- =========================================================================

-- 7.1 user_roles
alter table public.user_roles enable row level security;

create policy user_roles_select on public.user_roles
  for select to authenticated using (user_id = (select auth.uid()) or (select private.is_admin()));

create policy user_roles_insert on public.user_roles
  for insert to authenticated with check ((select private.is_admin()));

create policy user_roles_update on public.user_roles
  for update to authenticated using ((select private.is_admin())) with check ((select private.is_admin()));

create policy user_roles_delete on public.user_roles
  for delete to authenticated using ((select private.is_admin()));

-- 7.2 books
alter table public.books enable row level security;

create policy books_select on public.books
  for select to authenticated using (
    (select private.is_admin())
    or exists (
      select 1
      from public.user_book_access
      where book_id = books.id
        and user_id = (select auth.uid())
    )
  );

create policy books_insert on public.books
  for insert to authenticated with check ((select private.is_admin()));

create policy books_update on public.books
  for update to authenticated using ((select private.is_admin())) with check ((select private.is_admin()));

create policy books_delete on public.books
  for delete to authenticated using ((select private.is_admin()));

-- 7.3 user_book_access
alter table public.user_book_access enable row level security;

create policy user_book_access_select on public.user_book_access
  for select to authenticated using (user_id = (select auth.uid()) or (select private.is_admin()));

create policy user_book_access_insert on public.user_book_access
  for insert to authenticated with check ((select private.is_admin()));

create policy user_book_access_update on public.user_book_access
  for update to authenticated using ((select private.is_admin())) with check ((select private.is_admin()));

create policy user_book_access_delete on public.user_book_access
  for delete to authenticated using ((select private.is_admin()));

-- 7.4 chapters
alter table public.chapters enable row level security;

create policy chapters_select on public.chapters
  for select to authenticated using ((select private.is_admin()) or (select private.has_book_access(book_id)));

create policy chapters_insert on public.chapters
  for insert to authenticated with check ((select private.is_admin()));

create policy chapters_update on public.chapters
  for update to authenticated using ((select private.is_admin())) with check ((select private.is_admin()));

create policy chapters_delete on public.chapters
  for delete to authenticated using ((select private.is_admin()));

-- 7.5 lessons
alter table public.lessons enable row level security;

create policy lessons_select on public.lessons
  for select to authenticated using ((select private.is_admin()) or (select private.has_lesson_access(id)));

create policy lessons_insert on public.lessons
  for insert to authenticated with check ((select private.is_admin()));

create policy lessons_update on public.lessons
  for update to authenticated using ((select private.is_admin())) with check ((select private.is_admin()));

create policy lessons_delete on public.lessons
  for delete to authenticated using ((select private.is_admin()));

-- 7.6 exercises
alter table public.exercises enable row level security;

create policy exercises_select on public.exercises
  for select to authenticated using ((select private.is_admin()) or (select private.has_lesson_access(lesson_id)));

create policy exercises_insert on public.exercises
  for insert to authenticated with check ((select private.is_admin()));

create policy exercises_update on public.exercises
  for update to authenticated using ((select private.is_admin())) with check ((select private.is_admin()));

create policy exercises_delete on public.exercises
  for delete to authenticated using ((select private.is_admin()));

-- 7.7 exercise_keys
alter table public.exercise_keys enable row level security;

create policy exercise_keys_select on public.exercise_keys
  for select to authenticated using ((select private.is_admin()) or (select private.has_exercise_access(exercise_id)));

create policy exercise_keys_insert on public.exercise_keys
  for insert to authenticated with check ((select private.is_admin()));

create policy exercise_keys_update on public.exercise_keys
  for update to authenticated using ((select private.is_admin())) with check ((select private.is_admin()));

create policy exercise_keys_delete on public.exercise_keys
  for delete to authenticated using ((select private.is_admin()));

-- 7.8 lesson_progress — immutable (no UPDATE/DELETE policies)
alter table public.lesson_progress enable row level security;

create policy lesson_progress_select on public.lesson_progress
  for select to authenticated using (user_id = (select auth.uid()) or (select private.is_admin()));

create policy lesson_progress_insert on public.lesson_progress
  for insert to authenticated with check (
    user_id = (select auth.uid())
    and (select private.has_lesson_access(lesson_id))
  );

-- Intentionally NO update or delete policies on lesson_progress.
-- No policy = no operation through RLS, enforcing NFR "progress is not
-- lost". Operators may bypass via service_role for explicit corrections.
