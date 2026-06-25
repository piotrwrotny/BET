# Plan wdrożenia F-01: Model danych + role-aware RLS + seed pierwszej książki

## Przegląd

Pierwszy fundament BET (F-01 z roadmap). Dostarcza migrację Postgres + RLS + seed + typy TS, na których opierają się wszystkie późniejsze slice'y (S-01..S-07). Bez tego fragmentu żaden pionowy slice nie jest planowalny — schemat, polityki bezpieczeństwa i dane testowe są warunkiem koniecznym do `/10x-plan` na cokolwiek dalej.

Zakres: jedna migracja bootstrap (8 tabel, 4 helpery RLS, view `chapter_progress`, trigger `handle_new_user`, polityki RLS), `seed.sql` z 1 admin + 1 student + 1 book → 2 chapters z varied lekcjami i ćwiczeniami, npm scripts (`db:start`, `db:reset`, `db:gen-types`) i wygenerowany `src/lib/database.types.ts` committed do repo.

Decyzje architektoniczne tej sesji (lock-in dla wszystkich późniejszych slice'ów):
- Role w tabeli `user_roles` z FK do `auth.users` (nie JWT claim)
- RLS przez helpery `SECURITY DEFINER STABLE` (`is_admin()`, `has_book_access()`, `has_lesson_access()`, `has_exercise_access()`)
- Ćwiczenia w jednej tabeli z `type` enum + `payload jsonb` + osobna `exercise_keys` jako płaska lista wariantów (FR-024)
- `lesson_progress` append-only (obecność wiersza = ukończona, NFR „postęp nie ulega utracie")
- Agregat rozdziału jako SQL VIEW (derived state, brak materializacji)
- Immutability lesson_progress przez brak polityk UPDATE/DELETE w RLS (zero defense-in-depth trigger)
- Jedna migracja bootstrap (`<timestamp>_init.sql`)
- Default rola `student` przez trigger `AFTER INSERT ON auth.users`
- Typy TS regenerowane manualnie skryptem npm; plik committed do repo

## Analiza stanu obecnego

`supabase/` zawiera wyłącznie `config.toml` + `.gitignore` (zob. `supabase/config.toml`, `find supabase/**`). Zero migracji, zero seed, zero polityk RLS, zero wygenerowanych typów TS. `config.toml` deklaruje PG17, `db.migrations.enabled = true`, `db.seed.sql_paths = ["./seed.sql"]`, `auth.enable_signup = true` (default), bez konfiguracji custom access token hook.

Klient Supabase wpięty: `src/lib/supabase.ts` używa `@supabase/ssr` z `createServerClient`, czyta `SUPABASE_URL` / `SUPABASE_KEY` z `astro:env/server`. Astro env schema zadeklarowane w `astro.config.mjs:17-22`. `.env.example:1-2` zawiera placeholdery.

Middleware (`src/middleware.ts:6-25`) ustanawia `Astro.locals.user`, chroni `/dashboard`. NIE zna roli — ekspozycja roli należy do S-01 (nie F-01).

`src/env.d.ts:1-5` definiuje tylko `Locals.user`. Nie zmieniamy w F-01.

Trasy auth (`src/pages/api/auth/{signin,signup,signout}.ts`, `src/pages/auth/*`) działają z anon keyem. NIE modyfikujemy w F-01 — default rola będzie wstawiana przez trigger Postgres, nie przez signup endpoint.

Wersja Supabase CLI: `supabase ^2.23.4` (devDeps w `package.json:52`). `wrangler ^4.90.0` jest osobno — F-01 nie dotyka tego.

## Pożądany stan końcowy

Po zakończeniu F-01:
1. `supabase db reset` aplikuje migrację + seed bez błędów na czystej lokalnej DB
2. Zalogowanie się jako seed-student w lokalnej app: dashboard pokazuje 1 seedowaną książkę z 2 rozdziałami; zalogowanie jako seed-admin: widzi wszystkie książki (bez UI admin, ale przez Studio/SQL można zweryfikować dostęp)
3. `npm run db:gen-types` generuje świeży `src/lib/database.types.ts`; `tsc --noEmit` przechodzi z importem `Database` z tego pliku
4. RLS smoke matrix (manualna, dokumentowana w Faza 3): student widzi tylko swoje rows, admin widzi wszystko, próba UPDATE/DELETE na `lesson_progress` fails
5. S-01 (gwiazda przewodnia) i S-05 (nawigacja + agregat) mogą zostać zaplanowane bez czekania na S-02 admin UI — seed pokrywa potrzebne dane

### Kluczowe odkrycia:

- **`gen_random_uuid()` jest built-in od PG13** — nie wymaga `pgcrypto` (potrzebne tylko gdy chcemy `crypt()` do hashowania haseł w seed). Supabase Postgres 17 ma `pgcrypto` enabled by default — można na nim polegać przy seedowaniu auth users.
- **Triggery na `auth.users` wymagają `SECURITY DEFINER`** — RLS na `user_roles` zablokowałby insert z kontekstu nowego użytkownika (jeszcze bez sesji). Standardowy wzorzec Supabase (zob. Supabase docs: „Managing User Data").
- **Views w Postgres są `SECURITY INVOKER` domyślnie** — RLS na underlying tables się aplikuje. Dla `chapter_progress` to korzystne: JOIN na `user_book_access` automatycznie filtruje per-user przez RLS, bez dodatkowych klauzul w view.
- **`SET search_path = ''` w SECURITY DEFINER functions** — Supabase security guideline; chroni przed search_path injection. Wszystkie helpery muszą używać fully-qualified names (`public.user_roles`, `public.user_book_access`).
- **Seed w `supabase/seed.sql` jest aplikowany TYLKO przy `db reset`** (`config.toml:60-65`). Nie podczas `db push` / migration apply. Idempotent czystenie w seed nie jest potrzebne.
- **`UNIQUE (parent_id, ord)` constraint pokrywa lookup index** — Postgres automatycznie tworzy unique index na nim, nie trzeba osobnego `CREATE INDEX`.

## Czego NIE robimy

**Wszystko poza schematem + RLS + seed + typami w tym fragmencie.** Konkretne wykluczenia:

- **Ekspozycja roli w middleware** (`Astro.locals.role`) — to S-01. Tutaj kończymy na schemacie + helperach SQL.
- **Strony UI** — żadnych zmian w `src/pages/**` poza ewentualnie potwierdzeniem że istniejące działają z nową bazą.
- **Admin UI** — to S-02 (tworzenie książek, dodawanie ćwiczeń). F-01 dostarcza tylko seed jako workaround.
- **Endpoint admin user management** — to S-03 (blocked na OQ-1).
- **Upload okładek książek** — `books.cover_url` jest tekstem; Supabase Storage bucket setup to S-02.
- **Walidacja Zod payload ćwiczeń** — schemat aplikacyjny ćwiczeń (jak interpretować JSON dla każdego z 6 typów) to S-01/S-06/S-07. F-01 zapewnia tylko nieopiniujący `jsonb` slot.
- **CI auto-deploy migracji** — `.github/workflows/ci.yml` zostaje bez zmian; deploy migracji na production Supabase to osobna troska.
- **Audit log / event sourcing** — odrzucone w runda 2; PRD nic nie wymaga.
- **Soft-delete** — nie potrzebne dla MVP; brak FR.
- **Stałe `created_at` / `updated_at` na wszystkich tabelach** — dodajemy tylko gdzie semantyka tego wymaga (`books.updated_at` dla admina, `user_roles.created_at` dla audytu); nie na każdej tabeli „because audit".
- **Reset hasła** — Supabase Auth ma flow gotowy; podłączamy gdy będzie wymagane (parking).
- **Index optimizations dla query performance** — minimalne indexy (UNIQUE constraints + PRIMARY KEYs); dodatkowe indexy gdy zmierzymy real load (target_scale=small).

## Podejście do implementacji

Trzy fazy w łańcuchu zależności (każda buduje na poprzedniej), z ręcznym gate'em weryfikacji między fazami (zwłaszcza po Fazie 1, gdzie RLS matrix musi zostać sprawdzony przed seedem).

**Faza 1** dostarcza całość SQL (jedna migracja). Po jej zaaplikowaniu lokalna DB ma pełny schemat ale jest pusta. RLS smoke test jest najlepiej zrobić tu (z anon keyem + service_role), bo seed danych mógłby przesłonić błędy w politykach.

**Faza 2** dostarcza seed. Po `db reset` seed wstawi 1 admin + 1 student + 1 book → 2 chapters → 5 lekcji + 4 ćwiczenia + warianty. Lokalna app po `npm run dev` pozwoli zalogować się jako seed-student.

**Faza 3** dostarcza typy TS + npm scripts + dev runbook. Po wykonaniu `npm run db:gen-types`, `database.types.ts` jest świeży i może być importowany przez `src/lib/supabase.ts` (lub przyszłe service files w S-01).

## Krytyczne szczegóły implementacji

- **`SECURITY DEFINER` + `SET search_path = ''` na wszystkich helperach RLS i trigger function `handle_new_user`.** Bez `SET search_path = ''` SECURITY DEFINER funkcja jest podatna na search_path injection (atakujący tworzy własną tabelę `user_roles` w swoim schemacie i wywołuje funkcję). Wszystkie referencje wewnątrz helperów muszą być fully-qualified (`public.user_roles`, `auth.uid()`).
- **Trigger `AFTER INSERT ON auth.users` musi być SECURITY DEFINER** żeby ominąć RLS na `user_roles` (nowy user nie ma jeszcze własnej sesji, więc `auth.uid()` w polityce zwróciłby NULL → insert odrzucony bez DEFINER).
- **Kolejność DDL w migracji ma znaczenie**: extensions → enums → helper functions (bez body sprawdzającego tabele które jeszcze nie istnieją — w naszym przypadku body czyta `public.user_roles` / `public.user_book_access`, więc HELPERY MUSZĄ BYĆ PO TABELACH) → tables → indexes (UNIQUE jest implicit) → views → triggers → RLS enable + policies. Helpery SQL można zdefiniować w funkcji nawet gdy tabele nie istnieją (ciało jest lazy-resolved), ale dla czytelności trzymamy je PO tabelach.
- **`auth.uid()` w RLS policy zwraca NULL gdy brak sesji** — to znaczy że niezalogowany użytkownik nie pasuje do `user_id = auth.uid()` (NULL != NULL). Polityki muszą być pisane defensywnie — żaden szczęśliwy NULL match.
- **View `chapter_progress` opiera się na RLS underlying tables** — view jest SECURITY INVOKER. Gdy admin pyta z service_role keyem (omija RLS), zobaczy wszystkie (chapter, user) pary. Gdy zwykły user pyta z anon keyem, zobaczy tylko swoje pary. To jest pożądane zachowanie i NIE wymaga RLS policy na view (PG nie wspiera RLS na views — RLS się aplikuje na bazowych tabelach).

## Faza 1: Schemat, helpery, view, trigger, RLS — jedna migracja bootstrap

### Przegląd

Wszystko SQL w jednym pliku migracji aplikowanym atomowo. Po tej fazie: lokalna DB ma kompletny schemat F-01, helpery, view, trigger i polityki RLS — ale jest pusta. RLS matrix można smoke-testować przez ręczne inserty.

### Wymagane zmiany:

#### 1. Migracja bootstrap

**Plik**: `supabase/migrations/<timestamp>_init.sql` (gdzie `<timestamp>` to wynik `supabase migration new init` — format `YYYYMMDDHHMMSS`)

**Cel**: pojedynczy plik DDL inicjalizujący cały schemat F-01: extensions, enums, 8 tabel, 4 helpery RLS, view agregatu rozdziału, trigger default role, polityki RLS na każdej tabeli.

**Kontrakt**: SQL DDL podzielony na sekcje komentarzami markdown-stylowymi (np. `-- =========== Section: enums ===========`). Sekcje w kolejności:

1. **Extensions** — `CREATE EXTENSION IF NOT EXISTS pgcrypto;` (dla `crypt()`/`gen_salt()` w seed). Inne extensions niepotrzebne.
2. **Enums** — `user_role` (admin | student), `exercise_type` (multiple_choice | fill_in_blank | matching | true_false | sentence_transformation | open_ended).
3. **Tables** w kolejności FK:
   - `public.user_roles (user_id uuid PK FK auth.users(id) ON DELETE CASCADE, role user_role NOT NULL DEFAULT 'student', created_at timestamptz NOT NULL DEFAULT now())`
   - `public.books (id uuid PK DEFAULT gen_random_uuid(), title text NOT NULL, cover_url text NULL, description text NULL, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now())`
   - `public.user_book_access (user_id uuid FK auth.users(id) ON DELETE CASCADE, book_id uuid FK public.books(id) ON DELETE CASCADE, granted_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY (user_id, book_id))`
   - `public.chapters (id uuid PK DEFAULT gen_random_uuid(), book_id uuid NOT NULL FK public.books(id) ON DELETE CASCADE, title text NOT NULL, ord int NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), UNIQUE (book_id, ord))`
   - `public.lessons (id uuid PK DEFAULT gen_random_uuid(), chapter_id uuid NOT NULL FK public.chapters(id) ON DELETE CASCADE, title text NOT NULL, content text NOT NULL, ord int NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), UNIQUE (chapter_id, ord))`
   - `public.exercises (id uuid PK DEFAULT gen_random_uuid(), lesson_id uuid NOT NULL FK public.lessons(id) ON DELETE CASCADE, type exercise_type NOT NULL, prompt text NOT NULL, payload jsonb NOT NULL DEFAULT '{}'::jsonb, ord int NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), UNIQUE (lesson_id, ord))`
   - `public.exercise_keys (id uuid PK DEFAULT gen_random_uuid(), exercise_id uuid NOT NULL FK public.exercises(id) ON DELETE CASCADE, key_text text NOT NULL, key_metadata jsonb NULL, ord int NOT NULL, UNIQUE (exercise_id, ord))`
   - `public.lesson_progress (user_id uuid NOT NULL FK auth.users(id) ON DELETE CASCADE, lesson_id uuid NOT NULL FK public.lessons(id) ON DELETE CASCADE, completed_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY (user_id, lesson_id))`
4. **Index dodatkowy** — `CREATE INDEX user_book_access_book_id_idx ON public.user_book_access(book_id);` (PK kompozytowy zaczyna od user_id; admin-side query po book_id potrzebuje osobnego indexu).
5. **Helper functions** (wszystkie `SECURITY DEFINER STABLE LANGUAGE sql SET search_path = ''`):
   - `public.is_admin() RETURNS boolean` — `SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin')`.
   - `public.has_book_access(_book_id uuid) RETURNS boolean` — `SELECT public.is_admin() OR EXISTS (SELECT 1 FROM public.user_book_access WHERE user_id = auth.uid() AND book_id = _book_id)`.
   - `public.has_lesson_access(_lesson_id uuid) RETURNS boolean` — `SELECT public.is_admin() OR EXISTS (SELECT 1 FROM public.lessons l JOIN public.chapters c ON c.id = l.chapter_id JOIN public.user_book_access uba ON uba.book_id = c.book_id WHERE l.id = _lesson_id AND uba.user_id = auth.uid())`.
   - `public.has_exercise_access(_exercise_id uuid) RETURNS boolean` — `SELECT public.is_admin() OR EXISTS (SELECT 1 FROM public.exercises e WHERE e.id = _exercise_id AND public.has_lesson_access(e.lesson_id))`.
6. **View** — `CREATE VIEW public.chapter_progress AS SELECT c.id AS chapter_id, c.book_id, uba.user_id, COUNT(DISTINCT l.id) AS lessons_total, COUNT(DISTINCT lp.lesson_id) AS lessons_completed, CASE WHEN COUNT(DISTINCT l.id) > 0 AND COUNT(DISTINCT l.id) = COUNT(DISTINCT lp.lesson_id) THEN MAX(lp.completed_at) ELSE NULL END AS completed_at FROM public.chapters c JOIN public.user_book_access uba ON uba.book_id = c.book_id LEFT JOIN public.lessons l ON l.chapter_id = c.id LEFT JOIN public.lesson_progress lp ON lp.lesson_id = l.id AND lp.user_id = uba.user_id GROUP BY c.id, c.book_id, uba.user_id;`. RLS na underlying tables zapewnia per-user filtrowanie.
7. **Trigger function + trigger** — `public.handle_new_user()` (SECURITY DEFINER, plpgsql, `SET search_path = ''`) wstawia `(NEW.id, 'student')` do `public.user_roles`. Trigger `on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user()`.
8. **RLS enable** — `ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;` powtórzone dla wszystkich 8 tabel.
9. **RLS policies** — per tabela (lista poniżej w `**Polityki RLS per tabela**`).

**Polityki RLS per tabela**:

- `user_roles`: SELECT (`user_id = auth.uid() OR public.is_admin()`); INSERT/UPDATE/DELETE tylko `public.is_admin()` (trigger handle_new_user omija RLS przez SECURITY DEFINER).
- `books`: SELECT (`public.is_admin() OR EXISTS (SELECT 1 FROM public.user_book_access WHERE book_id = books.id AND user_id = auth.uid())`); INSERT/UPDATE/DELETE tylko `public.is_admin()`.
- `user_book_access`: SELECT (`user_id = auth.uid() OR public.is_admin()`); INSERT/UPDATE/DELETE tylko `public.is_admin()`.
- `chapters`: SELECT (`public.is_admin() OR public.has_book_access(book_id)`); INSERT/UPDATE/DELETE tylko `public.is_admin()`.
- `lessons`: SELECT (`public.is_admin() OR public.has_lesson_access(id)`); INSERT/UPDATE/DELETE tylko `public.is_admin()`. (Uwaga: `has_lesson_access(id)` dla SELECT wymaga, by helper przyjmował `lessons.id` — co działa, helper resolva chapter→book→UBA.)
- `exercises`: SELECT (`public.is_admin() OR public.has_lesson_access(lesson_id)`); INSERT/UPDATE/DELETE tylko `public.is_admin()`.
- `exercise_keys`: SELECT (`public.is_admin() OR public.has_exercise_access(exercise_id)`); INSERT/UPDATE/DELETE tylko `public.is_admin()`.
- `lesson_progress`: SELECT (`user_id = auth.uid() OR public.is_admin()`); INSERT (`user_id = auth.uid() AND public.has_lesson_access(lesson_id)`) — student wstawia tylko swój postęp na dostępną lekcję; brak polityk UPDATE/DELETE (zero policies = zero operations, NFR „postęp nie ulega utracie").

### Kryteria sukcesu:

#### Weryfikacja automatyczna:

- Migracja aplikuje się czysto na czystej DB: `supabase db reset` zwraca exit 0
- Wszystkie 8 tabel istnieje: `SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public'` zwraca 9 (8 tabel + view)
- View `chapter_progress` istnieje: `SELECT count(*) FROM information_schema.views WHERE table_schema = 'public' AND table_name = 'chapter_progress'` zwraca 1
- 4 helpery + trigger function istnieją: `SELECT count(*) FROM information_schema.routines WHERE routine_schema = 'public' AND routine_name IN ('is_admin', 'has_book_access', 'has_lesson_access', 'has_exercise_access', 'handle_new_user')` zwraca 5
- RLS włączony na 8 tabelach: `SELECT count(*) FROM pg_tables WHERE schemaname = 'public' AND rowsecurity = true` zwraca 8
- Trigger zarejestrowany: `SELECT count(*) FROM pg_trigger WHERE tgname = 'on_auth_user_created'` zwraca 1

#### Weryfikacja ręczna:

- Trigger handle_new_user działa: w Supabase Studio (lub psql) wykonaj `INSERT INTO auth.users (id, email, encrypted_password) VALUES (gen_random_uuid(), 'test@example.com', crypt('test', gen_salt('bf')))` i sprawdź że `user_roles` ma nowy wiersz z `role = 'student'`
- SECURITY DEFINER + search_path: `\df+ public.is_admin` w psql pokazuje `Security: definer` i `Config: search_path=""`
- RLS smoke test (z anon keyem, lokalny `supabase status` zwraca `anon key`): `SELECT * FROM public.books` jako anonim zwraca 0 rows (brak sesji = brak `auth.uid()` = brak `is_admin()` i brak `has_book_access`)
- Polityka immutability lesson_progress: spróbuj `UPDATE public.lesson_progress SET completed_at = now()` z service_role — to OMINIE RLS i zadziała (oczekiwane); z anon/authenticated SDK — failed (no policy)

**Uwaga implementacyjna**: Po zakończeniu tej fazy i pomyślnym przejściu wszystkich automatycznych weryfikacji, zatrzymaj się tutaj, aby uzyskać ręczne potwierdzenie od człowieka, że trigger handle_new_user, RLS smoke matrix i immutability sprawdzone, zanim przejdziesz do Fazy 2.

---

## Faza 2: Seed data

### Przegląd

`supabase/seed.sql` wstawia 1 admin + 1 student + 1 book → 2 chapters → 5 lekcji + 4 ćwiczenia w różnych typach + warianty w `exercise_keys`. Po `supabase db reset` lokalna DB jest gotowa do interakcji z UI (logowanie jako seed-student, widzenie książki, ewentualne testowanie S-01 i S-05 manualnie).

### Wymagane zmiany:

#### 1. Plik seed

**Plik**: `supabase/seed.sql`

**Cel**: deterministyczny seed dla lokalnego dev — predyktowalne UUID-y, znane credentials, zawartość pozwalająca na testowanie S-01 (pierwsza lekcja end-to-end) i S-05 (nawigacja, agregat rozdziału) bez czekania na S-02.

**Kontrakt**: SQL `INSERT` statements w kolejności FK:

1. **auth.users** — 2 wstawki przez direct insert:
   - admin: `id = '00000000-0000-0000-0000-000000000001'`, email `admin@bet.local`, password `admin-pass` (hashed przez `crypt('admin-pass', gen_salt('bf'))`), `email_confirmed_at = now()`, `aud = 'authenticated'`, `role = 'authenticated'`, `instance_id = '00000000-0000-0000-0000-000000000000'`. Trigger handle_new_user wstawi domyślnie `student` do `user_roles` — natychmiast po insercie do auth.users wykonaj `UPDATE public.user_roles SET role = 'admin' WHERE user_id = '00000000-0000-0000-0000-000000000001'`.
   - student: `id = '00000000-0000-0000-0000-000000000002'`, email `student@bet.local`, password `student-pass`, reszta analogicznie.
2. **public.books** — `id = '00000000-0000-0000-0000-000000000010'`, title „FCE Practice Book 1", description, cover_url NULL (S-02 obsłuży upload).
3. **public.user_book_access** — `(student_id, book_id)`. (Admin nie potrzebuje wpisu — `is_admin()` zwraca true.)
4. **public.chapters** — 2 chapter:
   - `chapter_1`: `id = '00000000-0000-0000-0000-000000000020'`, title „Chapter 1: Tenses Review", ord 0, book_id z (2).
   - `chapter_2`: `id = '00000000-0000-0000-0000-000000000021'`, title „Chapter 2: Sentence Transformations", ord 1.
5. **public.lessons** — 5 lessons:
   - chapter_1: 3 lekcje (`lesson_1_1` ord 0 z MC; `lesson_1_2` ord 1 z fill-blank; `lesson_1_3` ord 2 bez ćwiczeń, tylko reading).
   - chapter_2: 2 lekcje (`lesson_2_1` ord 0 z true_false; `lesson_2_2` ord 1 z sentence_transformation + open_ended).
   - Każda ma `content` (krótki blog-post w formacie Markdown — wystarczy 1-2 paragrafy, S-01 obsłuży renderer).
   - Deterministyczne UUID-y `00000000-0000-0000-0000-0000000000XX` gdzie XX = unique per lesson.
6. **public.exercises** — min 4 ćwiczenia:
   - `lesson_1_1`: 1 × multiple_choice (FR-022). `payload jsonb` zawiera tablicę opcji: `{"options": ["A: went", "B: gone", "C: going", "D: go"]}`.
   - `lesson_1_2`: 1 × fill_in_blank (FR-018). `payload`: `{"template": "Yesterday I ___ to the cinema."}`.
   - `lesson_2_1`: 1 × true_false (FR-023). `payload`: `{}` (sam prompt wystarczy).
   - `lesson_2_2`: 1 × sentence_transformation (FR-020) + 1 × open_ended (FR-021). `payload` dla transformation: `{"original": "She doesn't have enough money."}`; dla open_ended: `{}` (otwarta odpowiedź, jest model answer w `exercise_keys`).
7. **public.exercise_keys** — warianty per ćwiczenie:
   - MC: 1 wiersz z `key_text = 'A: went'`, `ord = 0`.
   - fill-blank: 2 wiersze z dopuszczalnymi wariantami (`'went'`, `'have gone'`), ord 0/1.
   - true_false: 1 wiersz `key_text = 'true'`, ord 0.
   - sentence_transformation: 2 wiersze z poprawnymi wariantami (np. `'She has too little money.'`, `'She lacks enough money.'`), ord 0/1.
   - open_ended: 1 wiersz z model answer (`key_text = 'Sample model answer for self-assessment.'`), ord 0. `key_metadata jsonb` może oznaczać `{"is_reference_only": true}` żeby S-07 wiedział że to model, nie variant.

**Constraint**: seed NIE wstawia rows do `public.lesson_progress`. Student startuje od zera — S-01 będzie pierwszym slice'em który wstawi tam wiersz przez UI.

### Kryteria sukcesu:

#### Weryfikacja automatyczna:

- Seed aplikuje się czysto: `supabase db reset` po dodaniu seed.sql wraca exit 0
- 2 users: `SELECT count(*) FROM auth.users WHERE email IN ('admin@bet.local', 'student@bet.local')` = 2
- 1 admin + 1 student w user_roles: `SELECT role, count(*) FROM public.user_roles GROUP BY role` zwraca `admin: 1`, `student: 1`
- Student ma dostęp do książki: `SELECT count(*) FROM public.user_book_access` = 1
- 1 book, 2 chapters, 5 lessons: count zwraca dokładnie te wartości
- 4 exercises (lub więcej jeśli rozszerzyłem o open_ended), exercise_keys zwraca min 6 wierszy: `SELECT count(*) FROM public.exercise_keys` ≥ 6
- View chapter_progress zwraca poprawne agregaty: `SELECT * FROM public.chapter_progress WHERE user_id = student_id ORDER BY book_id, chapter_id` zwraca 2 wiersze (po jednym dla chapter_1 i chapter_2), oba z `lessons_completed = 0`, `lessons_total = 3` i `2` odpowiednio, `completed_at = NULL`.

#### Weryfikacja ręczna:

- Logowanie jako `student@bet.local` / `student-pass` w lokalnej app (`npm run dev` → `/auth/signin`) działa
- Po zalogowaniu jako student, dashboard pokazuje 1 książkę „FCE Practice Book 1"
- Logowanie jako `admin@bet.local` / `admin-pass` działa; w Supabase Studio (`http://127.0.0.1:54323`) widzialne wszystkie wiersze wszystkich tabel
- W Supabase Studio z service_role: query `SELECT * FROM public.chapter_progress` zwraca 2 wiersze tylko dla seed-studenta (admin nie ma `user_book_access` więc nie pojawia się w widoku — to celowe, admin dostaje access przez `is_admin()` w RLS underlying tables)
- Wykonanie `INSERT INTO public.lesson_progress (user_id, lesson_id) VALUES (student_id, lesson_1_1_id)` jako service_role; query view `chapter_progress` jako student pokazuje `lessons_completed = 1` dla chapter_1, `completed_at` nadal NULL bo lessons_total = 3

**Uwaga implementacyjna**: Po zakończeniu tej fazy i pomyślnym przejściu wszystkich automatycznych weryfikacji, zatrzymaj się tutaj, aby uzyskać ręczne potwierdzenie od człowieka, że logowanie jako seed-user i dashboard view działają, zanim przejdziesz do Fazy 3.

---

## Faza 3: Typy TS + npm scripts + dev runbook + RLS matrix verification

### Przegląd

Dodanie skryptów npm dla wygodnych operacji DB (`db:start`, `db:reset`, `db:stop`, `db:gen-types`), regeneracja `src/lib/database.types.ts` z aktualnego schematu, commitowanie go do repo, i krótki dev runbook w `README.md` (lub osobny `docs/database.md`). Plus formalna RLS verification matrix do sprawdzenia że RLS rzeczywiście blokuje cross-user reads.

### Wymagane zmiany:

#### 1. Skrypty npm

**Plik**: `package.json`

**Cel**: cztery convenience scripty wokół Supabase CLI; jeden z nich regeneruje typy.

**Kontrakt**: dodanie do `"scripts"`:

- `"db:start": "supabase start"` — startuje lokalne kontenery Supabase
- `"db:stop": "supabase stop"` — zatrzymuje
- `"db:reset": "supabase db reset"` — wipe + apply migrations + apply seed; należy uruchamiać po edycji migracji lub seedu
- `"db:gen-types": "supabase gen types typescript --local > src/lib/database.types.ts"` — generuje typy z lokalnej DB i nadpisuje plik

Pozostałe pola `package.json` bez zmian. Skrypty zachowują istniejące `dev`, `build`, `lint`, `format`.

#### 2. Wygenerowane typy bazy

**Plik**: `src/lib/database.types.ts`

**Cel**: typowany interface schema dla TypeScript — pozwala `createClient<Database>()` w przyszłych slice'ach, daje autouzupełnianie tabel/kolumn w `.from('books').select(...)`.

**Kontrakt**: plik wygenerowany przez `npm run db:gen-types` po Fazie 1 + 2. Eksportuje typy `Database`, `Tables`, `Enums` (standardowy output `supabase gen types`). Nie edytujemy ręcznie — regenerujemy po każdej zmianie schema.

Plik committed do repo (nie ignored). Future slice może go importować: `import type { Database } from '@/lib/database.types'`.

#### 3. Dev runbook

**Plik**: `README.md` (sekcja „Database / local dev" dodana do istniejącego README) lub `docs/database.md` (jeśli README jest bootstrap docu)

**Cel**: jednostronicowa instrukcja dla future developera (i przyszłego siebie): jak wystartować lokalny stack, jak resetować, jak regenerować typy, gdzie żyją credentials seed.

**Kontrakt**: sekcja Markdown z:
- `npm run db:start` — wymaga Docker; pokaże output z localhost ports i credentials (anon key, service_role)
- `npm run db:reset` — wipe + migrations + seed; trwa ~10s
- `npm run db:gen-types` — uruchamiaj po każdej zmianie migracji
- Seed credentials: `admin@bet.local` / `admin-pass`, `student@bet.local` / `student-pass`
- Supabase Studio: `http://127.0.0.1:54323`
- Note: `db:reset` to destructive operation lokalnie; nie commitować generowanych types JEŚLI w trakcie eksperymentów (czy schema się ustabilizuje)
- Note: NIGDY nie wstawiać prawdziwych haseł w seed; te credentials są tylko local dev.

#### 4. RLS verification matrix

**Plik**: `docs/database.md` (sekcja „RLS matrix") albo komentarz nagłówkowy w migracji albo plik `supabase/tests/rls.sql` (test fixtures)

**Cel**: udokumentować oczekiwane zachowanie RLS dla każdej tabeli × każda rola (admin, student z dostępem, student bez dostępu, anonim). Future RLS changes mogą być sprawdzone przeciwko tej matrycy.

**Kontrakt**: tabela markdown (Tabela × Akcja × Rola × Oczekiwany wynik). Min wiersze:
- `books / SELECT / admin → wszystkie books`
- `books / SELECT / student z access → tylko jego books`
- `books / SELECT / student bez access → 0 rows`
- `books / SELECT / anonim → 0 rows`
- `books / INSERT / student → fail`
- `books / INSERT / admin → success`
- `lesson_progress / UPDATE / dowolna rola przez supabase SDK → fail (no policy)`
- `lesson_progress / DELETE / dowolna rola przez supabase SDK → fail (no policy)`
- `user_roles / SELECT / student → tylko jego rola; admin → wszystkie`
- ...itd. dla każdej z 8 tabel

Format pomaga gdy ktoś modyfikuje politykę — szybko widzi co powinno działać po zmianie.

### Kryteria sukcesu:

#### Weryfikacja automatyczna:

- `npm run db:gen-types` wykonuje się bez błędów i nadpisuje `src/lib/database.types.ts`
- `npx tsc --noEmit` przechodzi po regeneracji typów (typy są kompletne i bez syntax errors)
- `src/lib/database.types.ts` eksportuje typ `Database` z `public` schema zawierającym 8 tabel + 1 view (`chapter_progress`)
- Skrypty `db:start`, `db:stop`, `db:reset`, `db:gen-types` są w `package.json:scripts` (sprawdź przez `node -e "console.log(Object.keys(require('./package.json').scripts).sort().join('\n'))"`)
- Lint przechodzi: `npm run lint`
- Build przechodzi: `npm run build` (verifies że Astro nadal kompiluje z nowym types file)

#### Weryfikacja ręczna:

- Otwórz `src/lib/database.types.ts` — widoczny eksport `Database` z 8 tabelami w `public.Tables` + 1 view w `public.Views`
- Skrypt `npm run db:reset` zaaplikował się czysto: status `supabase status` pokazuje wszystkie kontenery `Running`
- Przeczytaj `README.md` (lub `docs/database.md`) — czy dev runbook jest zrozumiały dla kogoś kto klonuje repo pierwszy raz?
- RLS matrix wykonana manualnie przez psql lub Supabase Studio: zalogować się jako admin (przez API), zalogować się jako student-with-access, zalogować się jako student-without-access (testowy user spoza seed) — każdy SELECT i INSERT z anon keyem powinien zachować się zgodnie z matrycą
- Próba `UPDATE public.lesson_progress` przez Studio SQL editor (jako service_role): success → potwierdza że service_role omija RLS (oczekiwane). Próba przez authenticated SDK (anon key + sesja): fail → potwierdza że RLS blokuje (oczekiwane).
- W Supabase Studio sprawdzić Auth → Triggers → że `on_auth_user_created` jest aktywny

**Uwaga implementacyjna**: Po zakończeniu tej fazy F-01 jest gotowe do oznaczenia jako `done` w roadmap. Pomyślne przejście wszystkich automatycznych weryfikacji + manualne ukończenie RLS matrix oznacza że gwiazda przewodnia S-01 jest odblokowana do `/10x-plan first-lesson-end-to-end`.

---

## Strategia testowania

### Testy jednostkowe:

F-01 nie zawiera kodu aplikacyjnego (TS/Astro) — wszystko jest SQL. Brak unit testów JS/TS.

### Testy integracyjne:

- RLS matrix wykonana manualnie (Faza 3) — to jest testem integracyjnym (database + RLS + role).
- Smoke test: `supabase db reset` aplikuje całość (migracja + seed) bez błędu — implicit integration test.
- View `chapter_progress` test: insert do `lesson_progress` powoduje update wartości w view (read-time aggregation).

### Kroki testowania ręcznego:

1. `npm run db:reset` — wykonuje się bez błędów
2. Otwórz `http://127.0.0.1:54323` (Supabase Studio); zaloguj się; zweryfikuj że 8 tabel + view istnieją
3. W Studio Auth → Users: zobacz 2 users (admin + student z seed)
4. `npm run dev` — odpal Astro
5. Otwórz `http://localhost:4321/auth/signin`, zaloguj się jako `student@bet.local` / `student-pass` → przekierowanie na `/dashboard`
6. Wyloguj się; zaloguj jako `admin@bet.local` / `admin-pass` → przekierowanie na `/dashboard`
7. W Studio SQL editor z service_role keyem: `SELECT * FROM public.chapter_progress` zwraca 2 wiersze dla seed-studenta
8. Wykonaj `INSERT INTO public.lesson_progress (user_id, lesson_id) VALUES (student_id, lesson_1_1_id)`; ponowny SELECT pokazuje `lessons_completed = 1` dla chapter_1
9. Próba `UPDATE public.lesson_progress` jako anon/authenticated (np. przez Studio z anon keyem): fail
10. Próba `DELETE FROM public.lesson_progress` jako anon/authenticated: fail

## Uwagi dotyczące wydajności

- `target_scale.users: small`, `qps: low`, `data_volume: small` w PRD frontmatter — view `chapter_progress` jako read-time aggregation jest wystarczająca. Brak materialized view, brak triggera agregującego.
- RLS helpery `SECURITY DEFINER STABLE` są cache'owane przez Postgres w obrębie pojedynczego query — koszt `is_admin()` to jeden lookup na sesję.
- `has_lesson_access()` robi 3-tabelowe JOIN; pod target_scale=small to <1ms.
- Brak optymalizacji prerendering — F-01 nie dotyka warstwy Astro (output: server, SSR).
- Future: jeśli view chapter_progress okaże się hot path, można rozważyć materialized view + REFRESH per insert (lub triggers). Nie robimy tego prewencyjnie.

## Uwagi dotyczące migracji

Greenfield — brak migracji danych z poprzedniego systemu. Pojedyncza migracja bootstrap zawiera wszystko. Rollback strategy: jeśli coś pójdzie nie tak, `supabase db reset` lokalnie wszystko resetuje. Production (Supabase cloud) jeszcze nie istnieje — provisioning + first `supabase db push` to osobna troska po MVP.

## Referencje

- Roadmap: `context/foundation/roadmap.md#L65-77` (definicja F-01)
- PRD: `context/foundation/prd.md` (FR-001..025, Business Logic, Access Control, NFR)
- Frame brief: brak (F-01 framing zinternalizowany w roadmap)
- Research doc: brak (research zrobiony w głównym kontekście planu)
- Lessons: brak (`context/foundation/lessons.md` nie istnieje)
- Supabase docs:
  - SECURITY DEFINER best practices: `https://supabase.com/docs/guides/database/functions#security-definer-vs-security-invoker`
  - Managing User Data with triggers: `https://supabase.com/docs/guides/auth/managing-user-data`
  - RLS helpers: `https://supabase.com/docs/guides/database/postgres/row-level-security#helper-functions`
- Stack reference: `src/lib/supabase.ts:1-24`, `src/middleware.ts:1-25`, `astro.config.mjs:17-22`, `supabase/config.toml:53-65`, `package.json:14-56`

## Postęp

> Konwencja: `- [ ]` oczekujące, `- [x]` wykonane. Dodaj ` — <commit sha>`, gdy krok zostanie zrealizowany. Nie zmieniaj nazw tytułów kroków. Zobacz `references/progress-format.md`.

### Faza 1: Schemat, helpery, view, trigger, RLS — jedna migracja bootstrap

#### Automatyczne

- [x] 1.1 Migracja aplikuje się czysto na czystej DB: `supabase db reset` zwraca exit 0
- [x] 1.2 Wszystkie 8 tabel istnieje: `SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public'` zwraca 9 (8 tabel + view)
- [x] 1.3 View `chapter_progress` istnieje: `SELECT count(*) FROM information_schema.views WHERE table_schema = 'public' AND table_name = 'chapter_progress'` zwraca 1
- [x] 1.4 4 helpery + trigger function istnieją: `SELECT count(*) FROM information_schema.routines WHERE routine_schema = 'public' AND routine_name IN ('is_admin', 'has_book_access', 'has_lesson_access', 'has_exercise_access', 'handle_new_user')` zwraca 5
- [x] 1.5 RLS włączony na 8 tabelach: `SELECT count(*) FROM pg_tables WHERE schemaname = 'public' AND rowsecurity = true` zwraca 8
- [x] 1.6 Trigger zarejestrowany: `SELECT count(*) FROM pg_trigger WHERE tgname = 'on_auth_user_created'` zwraca 1

#### Ręczne

- [ ] 1.7 Trigger handle_new_user działa: insert do auth.users + sprawdź user_roles
- [ ] 1.8 SECURITY DEFINER + search_path: `\df+ public.is_admin` pokazuje `Security: definer` i `Config: search_path=""`
- [ ] 1.9 RLS smoke test: SELECT z anon keyem zwraca 0 rows dla protected tables
- [ ] 1.10 Polityka immutability lesson_progress: UPDATE z service_role działa, z authenticated/anon SDK failed

### Faza 2: Seed data

#### Automatyczne

- [ ] 2.1 Seed aplikuje się czysto: `supabase db reset` po dodaniu seed.sql wraca exit 0
- [ ] 2.2 2 users: `SELECT count(*) FROM auth.users WHERE email IN ('admin@bet.local', 'student@bet.local')` = 2
- [ ] 2.3 1 admin + 1 student w user_roles: `SELECT role, count(*) FROM public.user_roles GROUP BY role` zwraca admin:1, student:1
- [ ] 2.4 Student ma dostęp do książki: `SELECT count(*) FROM public.user_book_access` = 1
- [ ] 2.5 1 book, 2 chapters, 5 lessons: count zwraca dokładnie te wartości
- [ ] 2.6 4+ exercises, 6+ exercise_keys
- [ ] 2.7 View chapter_progress zwraca poprawne agregaty dla seed-studenta (2 wiersze, lessons_completed=0)

#### Ręczne

- [ ] 2.8 Logowanie jako student@bet.local w lokalnej app działa
- [ ] 2.9 Po zalogowaniu jako student, dashboard pokazuje 1 książkę
- [ ] 2.10 Logowanie jako admin@bet.local działa
- [ ] 2.11 Insert do lesson_progress jako service_role; view chapter_progress reflektuje agregat

### Faza 3: Typy TS + npm scripts + dev runbook + RLS matrix verification

#### Automatyczne

- [ ] 3.1 `npm run db:gen-types` wykonuje się bez błędów
- [ ] 3.2 `npx tsc --noEmit` przechodzi po regeneracji typów
- [ ] 3.3 `src/lib/database.types.ts` eksportuje typ Database z 8 tabel + 1 view
- [ ] 3.4 Skrypty `db:start`, `db:stop`, `db:reset`, `db:gen-types` są w package.json
- [ ] 3.5 Lint przechodzi: `npm run lint`
- [ ] 3.6 Build przechodzi: `npm run build`

#### Ręczne

- [ ] 3.7 `database.types.ts` widoczny eksport Database z 8 tabel i 1 view
- [ ] 3.8 `npm run db:reset` aplikuje się czysto; `supabase status` pokazuje containers Running
- [ ] 3.9 Dev runbook (README/docs/database.md) jest zrozumiały dla świeżego developera
- [ ] 3.10 RLS matrix wykonana manualnie zgodnie z dokumentem
- [ ] 3.11 UPDATE lesson_progress przez Studio service_role success; przez authenticated SDK fail
- [ ] 3.12 W Supabase Studio Auth → Triggers, `on_auth_user_created` jest aktywny
