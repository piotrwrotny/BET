-- =============================================================================
-- exercise_submissions: append-only record of verified correct closed answers
-- =============================================================================
-- Each row means "this student has correctly solved this closed exercise".
-- Open-ended exercises never get rows because they do not gate lesson completion.
-- Rows are inserted by the server-side /api/exercises/verify route using the
-- service-role client after it verifies the answer; authenticated users have
-- no INSERT policy on this table, so a browser client cannot self-mark.
-- =============================================================================

create table public.exercise_submissions (
  user_id uuid not null references auth.users(id) on delete cascade,
  exercise_id uuid not null references public.exercises(id) on delete cascade,
  answer text not null,
  is_correct boolean not null,
  submitted_at timestamptz not null default now(),
  primary key (user_id, exercise_id),
  constraint exercise_submissions_is_correct_check check (is_correct = true)
);

create index exercise_submissions_exercise_id_idx on public.exercise_submissions(exercise_id);

alter table public.exercise_submissions enable row level security;

-- Students (and admins) can read their own rows.
create policy exercise_submissions_select on public.exercise_submissions
  for select to authenticated using (
    user_id = (select auth.uid())
    or (select private.is_admin())
  );

-- Intentionally NO insert/update/delete policies for authenticated users.
-- INSERTs are performed by service-role server routes only, mirroring the
-- trust model of lesson_progress (no direct client writes).
