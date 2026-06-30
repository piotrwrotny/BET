---
date: 2026-06-29T00:00:00+02:00
researcher: AI
git_commit: 5d57a1d2e1561df16bb03059b51809abbbb4beee
branch: dev
repository: BET
topic: "S-04: student-profile-progress"
tags: [research, codebase, student, profile, progress, dashboard, lesson_progress, chapter_progress, astro, supabase]
status: complete
last_updated: 2026-06-29
last_updated_by: AI
---

# Badanie: S-04 — Profil studenta z postępem

**Data**: 2026-06-29T00:00:00+02:00  
**Badacz**: AI  
**Git Commit**: 5d57a1d2e1561df16bb03059b51809abbbb4beee  
**Gałąź**: dev  
**Repozytorium**: BET

## Pytanie badawcze

Co obecnie istnieje w bazie kodu BET dla profilu/postępu studenta i co należy zbudować w ramach S-04 (student-profile-progress)?

## Podsumowanie

Obecnie **nie ma dedykowanej strony profilu studenta**. Dashboard (`src/pages/dashboard.astro`) realizuje większość wymaganej logiki prezentacji postępu: lista książek, rozbicie na rozdziały z liczbą ukończonych lekcji, wykrywanie ukończenia książki oraz przycisk „Kontynuuj naukę". Jednak FR-004 (profil studenta z listą ukończonych lekcji i procentem postępu w książce) wymaga osobnej trasy `/student/profile` (lub `/profile`), która wyświetla read-only widok z perspektywy studenta, z dokładnym procentem postępu (nie tylko licznik x/y) i listą ukończonych lekcji.

Baza danych jest gotowa:
- `lesson_progress` przechowuje ukończone lekcje per student.
- Widok `chapter_progress` agreguje postęp na poziomie rozdziału.
- RLS i role są w pełni wdrożone; student widzi tylko własne dane.

S-04 to głównie zadanie frontendowe: stworzenie nowej strony Astro, pobranie danych serwerowo (podobnie jak dashboard), obliczenie procentów i wyrenderowanie listy książek, rozdziałów oraz ukończonych lekcji.

## Szczegółowe ustalenia

### 1. Dashboard jako obecny „profil light"

Plik `src/pages/dashboard.astro` jest jedynym miejscem, w którym student widzi swój postęp.

- Logowanie: `Astro.locals.user` oraz `Astro.cookies` przez `createClient` (`src/pages/dashboard.astro:1-3`).
- Pobieranie książek: `supabase.from("books").select("id, title, description, cover_url")` (`src/pages/dashboard.astro:24-31`).
- Pobieranie struktury kursu: `supabase.from("chapters").select("id, book_id, ord, title, lessons(id, ord)")` (`src/pages/dashboard.astro:34-46`).
- Pobieranie ukończonych lekcji: `supabase.from("lesson_progress").select("lesson_id")` (`src/pages/dashboard.astro:58-64`).
- Pobieranie postępu rozdziałów: `supabase.from("chapter_progress").select("chapter_id, lessons_total, lessons_completed, completed_at")` (`src/pages/dashboard.astro:70-76`).
- Obliczanie pierwszej nieukończonej lekcji: `firstUnfinishedId` (`src/pages/dashboard.astro:80-97`).
- Renderowanie karty książki z listą rozdziałów, licznikiem `lessons_completed/lessons_total` i odznaką ukończenia (`src/pages/dashboard.astro:117-149`).
- Przycisk „Kontynuuj naukę" kieruje do `/lessons/${book.firstUnfinishedId}` (`src/pages/dashboard.astro:150-156`).

**Kluczowa obserwacja**: dashboard pokazuje postęp rozdziału jako `x/y lekcji`, ale **nie wyświetla procentu** ani **nie ma dedykowanej sekcji profilu**.

### 2. Trasa lekcji i dane postępu

Plik `src/pages/lessons/[id].astro` pokazuje, jak system traktuje ukończenie lekcji.

- Sprawdzenie, czy lekcja ukończona: `supabase.from("lesson_progress").select("lesson_id").eq("lesson_id", lessonId).maybeSingle()` (`src/pages/lessons/[id].astro:62-67`).
- Odznaka „✓ Ukończona" renderowana w nagłówku (`src/pages/lessons/[id].astro:207-211`).
- Odznaka „✓ Rozdział ukończony!" z widoku `chapter_progress` (`src/pages/lessons/[id].astro:179-190` i `src/pages/lessons/[id].astro:200-204`).
- API ukończenia lekcji: `src/pages/api/lessons/[id]/complete.ts` — idempotentny `upsert` do `lesson_progress` z polityką RLS (`src/pages/api/lessons/[id]/complete.ts:27-37`).

### 3. Model danych postępu

Widok `chapter_progress` jest zdefiniowany w migracji `supabase/migrations/20260625184555_init.sql:229-248`:

```sql
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
```

Typy TypeScript: `src/lib/database.types.ts:166-187` (`lesson_progress`) i `src/lib/database.types.ts:280-296` (`chapter_progress` view).

### 4. Brak strony profilu

Nie istnieje żadna z poniższych tras:
- `src/pages/student/**/*`
- `src/pages/profile.astro`
- `src/pages/profil.astro`
- `src/pages/me.astro`

Wyszukiwanie po linkach (`href="/student`, `href="/profile`, `href="/profil`, `href="/me"`) w katalogu `src` nie zwraca wyników.

### 5. Detekcja ról

- Middleware `src/middleware.ts` rozwiązuje użytkownika i rolę, ustawiając `Astro.locals.user` oraz `Astro.locals.role` (`src/middleware.ts:8-29`).
- `PROTECTED_ROUTES = ["/dashboard", "/lessons", "/admin"]` chroni te ścieżki (`src/middleware.ts:4` i `src/middleware.ts:31-36`).
- Dostęp do `/admin/*` wymaga roli `admin` (`src/middleware.ts:38-40`).
- Typy lokalnych zmiennych: `src/env.d.ts:1-7` (`user: User | null`, `role: "admin" | "student" | null`).
- W stronach admina bezpośrednie sprawdzenie: `if (Astro.locals.role !== "admin") return Astro.redirect("/dashboard");` (np. `src/pages/admin/users.astro:10`).

Dla nowej strony profilu studenta wystarczy ochrona przez middleware na poziomie trasy (`/student/*` lub `/profile`) — nie jest potrzebne osobne sprawdzanie roli, ponieważ `/dashboard` i `/lessons` są już chronione, a profil jest dostępny dla każdego zalogowanego użytkownika (admin też może mieć profil, ale UI powinno być read-only).

### 6. Istniejące komponenty i linki związane z profilem

- `src/components/Topbar.astro` — pokazuje email użytkownika, link do `/dashboard` oraz formularz wylogowania (`src/components/Topbar.astro:1-28`).
- `src/components/Welcome.astro` używa `Topbar` (`src/components/Welcome.astro:2` i `src/components/Welcome.astro:28`), ale jest to strona landingowa.
- `AdminLayout.astro` zawiera link „← Wróć do kursu" do `/dashboard` (`src/layouts/AdminLayout.astro:77-84`).
- `Layout.astro` to podstawowy layout bez nawigacji (`src/layouts/Layout.astro`).

Nie ma żadnych komponentów ani linków bezpośrednio odnoszących się do profilu studenta.

## Odniesienia do kodu

- `src/pages/dashboard.astro:1-3` — importy Supabase i layout.
- `src/pages/dashboard.astro:24-31` — pobieranie listy książek.
- `src/pages/dashboard.astro:34-46` — pobieranie rozdziałów i lekcji.
- `src/pages/dashboard.astro:58-64` — pobieranie ukończonych lekcji.
- `src/pages/dashboard.astro:70-76` — pobieranie postępu rozdziałów z widoku `chapter_progress`.
- `src/pages/dashboard.astro:80-97` — algorytm `firstUnfinishedId`.
- `src/pages/dashboard.astro:117-156` — renderowanie karty książki z postępem i CTA.
- `src/pages/lessons/[id].astro:62-67` — sprawdzanie ukończenia lekcji.
- `src/pages/lessons/[id].astro:179-204` — odznaki ukończenia lekcji i rozdziału.
- `src/pages/api/lessons/[id]/complete.ts:27-37` — API zapisu ukończenia lekcji.
- `src/lib/database.types.ts:166-187` — typ `lesson_progress`.
- `src/lib/database.types.ts:280-296` — typ widoku `chapter_progress`.
- `src/middleware.ts:1-41` — autoryzacja, role i chronione trasy.
- `src/env.d.ts:1-7` — typy `App.Locals`.
- `src/layouts/Layout.astro` — podstawowy layout stron studenta.
- `src/layouts/AdminLayout.astro` — layout panelu admina.
- `src/components/Topbar.astro` — górny pasek z emailem, linkiem do dashboardu i wylogowaniem.
- `supabase/migrations/20260625184555_init.sql:229-248` — definicja widoku `chapter_progress`.

## Wnioski architektoniczne

### Miejsce dla nowej strony profilu

Najlepsze opcje:

1. **`src/pages/student/profile.astro`** — spójne z semantyką roli i domeny; łatwo dodać `/student/*` do `PROTECTED_ROUTES` w middleware (choć `/student/*` nie jest jeszcie chronione). Wymaga aktualizacji `src/middleware.ts:4`.
2. **`src/pages/profile.astro`** — prostsze, bezpośrednie odwzorowanie FR-004; pasuje do istniejącej konwencji prostych tras (`/dashboard`, `/lessons/[id]`).

**Rekomendacja**: `/student/profile.astro`. Jest czytelniejsze w kontekście roli studenta, izoluje funkcjonalność profilu od innych potencjalnych profili (np. admina) i ułatwia późniejsze rozszerzenie o `/student/*`.

### Reużycie danych z dashboardu

Logika pobierania danych w S-04 jest prawie identyczna jak w `dashboard.astro`:
- lista książek (open access lub z `user_book_access` — obecnie dashboard pobiera wszystkie książki, ponieważ RLS na `books` jest otwarty; patrz migracja `20260629000000_open_book_access_for_students.sql`);
- rozdziały z lekcjami;
- `lesson_progress` dla ukończonych lekcji;
- `chapter_progress` dla agregatów.

Różnica polega na prezentacji: profil powinien pokazywać **procent postępu w książce** (`completed / total * 100`) oraz **listę ukończonych lekcji** z linkami do nich.

### Read-only charakter

Zgodnie z `change.md` i PRD, strona profilu jest **read-only**. Nie należy dodawać akcji edycji postępu, zmiany roli ani edycji profilu (poza zaparkowanym FR-005 awatara).

### Wzorzec strony Astro

Strona profilu powinna:
- używać `Layout.astro` (jak dashboard i lekcja);
- pobierać dane w frontmatterze serwerowo (`output: "server"` w `astro.config.mjs`);
- renderować komponenty Astro (nie React islands), ponieważ nie ma interakcji wymagających hydration.

## Kontekst historyczny (z poprzednich zmian)

- `context/archive/2026-06-26-sequential-navigation-and-chapter-completion/research.md` — S-05 wykorzystało widok `chapter_progress` do odznaki ukończenia rozdziału na stronie lekcji oraz rozbicia postępu na poziomie rozdziału w dashboardzie. To pokazuje, że `chapter_progress` jest gotowy do użycia w S-04.
- `context/archive/2026-06-26-admin-user-and-access-mgmt/research.md` — dokumentuje model ról (`user_roles`, `user_book_access`) oraz middleware. S-04 korzysta z tego samego modelu autoryzacji; student widzi tylko własne `lesson_progress` dzięki RLS.
- `context/archive/2026-06-25-first-lesson-end-to-end/` — brak osobnego `research.md`, ale plan i implementacja S-01 ustaliły, że `lesson_progress` jest append-only i że ukończenie lekcji następuje przez przycisk „Przeczytano" (zgodnie z PRD §Business Logic).

## Powiązane badania

- `context/archive/2026-06-26-sequential-navigation-and-chapter-completion/research.md` — S-05, bezpośrednio pokrewny (postęp rozdziałów i dashboard).
- `context/archive/2026-06-26-admin-user-and-access-mgmt/research.md` — S-03, model ról i dostępu.
- `context/changes/student-profile-progress/research.md` — niniejszy dokument.

## Otwarte pytania

1. **Czy profil powinien być pod `/student/profile` czy `/profile`?** Decyzja wpływa na middleware i nawigację.
2. **Czy profil powinien pokazywać wszystkie książki (jak obecny dashboard) czy tylko te z nadanym dostępem?** Obecny dashboard pobiera wszystkie książki, ponieważ RLS na `books` jest otwarty po migracji `20260629000000_open_book_access_for_students.sql`.
3. **Czy lista ukończonych lekcji powinna być pogrupowana po książkach i rozdziałach, czy to płaska lista chronologiczna?** FR-004 mówi o „liście ukończonych lekcji i procencie postępu w książce" — grupowanie jest najbardziej czytelne.
4. **Czy nowa strona profilu zastąpi część funkcji dashboardu, czy dashboard pozostanie głównym miejscem „Kontynuuj naukę"?** FR-012 („Kontynuuj naukę") pozostaje w dashboardzie; profil to osobny read-only widok.
5. **Czy dodać link do profilu w `Topbar.astro` obok `/dashboard` i „Sign out"?** Tak, aby nawigacja była spójna.

## Szkic implementacyjny

1. **Nowa trasa**: utworzyć `src/pages/student/profile.astro`.
2. **Middleware**: dodać `/student` do `PROTECTED_ROUTES` w `src/middleware.ts:4`.
3. **Pobieranie danych** (serwerowo, podobnie jak dashboard):
   - książki (`books`);
   - rozdziały z lekcjami (`chapters` z embedded `lessons`);
   - `lesson_progress` dla ukończonych lekcji;
   - `chapter_progress` dla agregatów rozdziałów.
4. **Obliczenia**:
   - dla każdej książki: `totalLessons` = suma lekcji we wszystkich rozdziałach;
   - `completedLessons` = liczba ukończonych lekcji w książce;
   - `progressPercent` = `Math.round((completed / total) * 100)`;
   - dla każdego rozdziału: procent z widoku `chapter_progress.lessons_completed / lessons_total`.
5. **Renderowanie**:
   - nagłówek z emailem studenta;
   - lista książek z okładką, tytułem, opisem i paskiem/postępem procentowym;
   - pod każdą książką: lista rozdziałów z procentem postępu;
   - pod każdym rozdziałem: lista ukończonych lekcji z linkami `/lessons/{id}`;
   - komunikat „Gratulacje, książka ukończona!" gdy `progressPercent === 100`.
6. **Nawigacja**: dodać link „Profil" w `Topbar.astro` oraz w dashboardzie (opcjonalnie).
7. **Testy**: dodać testy E2E weryfikujące, że profil wyświetla procent postępu i listę ukończonych lekcji.
