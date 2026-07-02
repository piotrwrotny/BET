-- =============================================================================
-- lesson_reading_confirmations: explicit student confirmation that lesson
-- content has been read.
-- =============================================================================
-- This table provides the server-side proof for the "Przeczytano" action that
-- is required (together with solved closed exercises) to mark a lesson as
-- completed (FR-015). Without this record, the completion endpoint cannot be
-- manipulated by calling it directly.
-- =============================================================================

create table public.lesson_reading_confirmations (
  user_id uuid not null references auth.users(id) on delete cascade,
  lesson_id uuid not null references public.lessons(id) on delete cascade,
  confirmed_at timestamptz not null default now(),
  primary key (user_id, lesson_id)
);

create index lesson_reading_confirmations_lesson_id_idx
  on public.lesson_reading_confirmations(lesson_id);

alter table public.lesson_reading_confirmations enable row level security;

-- Students (and admins) can read their own confirmations.
create policy lesson_reading_confirmations_select on public.lesson_reading_confirmations
  for select to authenticated using (
    user_id = (select auth.uid())
    or (select private.is_admin())
  );

-- Students can only confirm reading for lessons they have access to.
create policy lesson_reading_confirmations_insert on public.lesson_reading_confirmations
  for insert to authenticated with check (
    user_id = (select auth.uid())
    and (select private.has_lesson_access(lesson_id))
  );

-- Intentionally NO update or delete policies — confirming reading is append-only.
