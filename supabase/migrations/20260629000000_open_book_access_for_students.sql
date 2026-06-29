-- Open book/lesson access to all authenticated students for the MVP
-- (relaxes the initial user_book_access gating so content is visible immediately)

create or replace function private.has_book_access(_book_id uuid)
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select true;
$$;

create or replace function private.has_lesson_access(_lesson_id uuid)
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select true;
$$;

drop policy if exists books_select on public.books;
create policy books_select on public.books
  for select to authenticated using (true);
