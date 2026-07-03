-- Restore strict per-user book and lesson access checks.
-- Reverts the relaxation introduced in 20260629000000_open_book_access_for_students.sql.

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

drop policy if exists books_select on public.books;
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
