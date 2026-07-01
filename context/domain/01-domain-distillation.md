---
title: BET — destylacja domeny (Ubiquitous Language, subdomainy, luki model-kod)
created: 2026-07-01
type: domain-distillation
---

# KROK 0 — Kontekst projektu

BET (Business English Tests) to platforma do nauki języka angielskiego oparta na konkretnych podręcznikach przygotowujących do egzaminów (FCE, CAE, B2 First). Główna hipoteza produktowa: student chce przerabiać materiał rozdział po rozdziale, z weryfikacją odpowiedzi i nieodwracalnym śladem ukończenia.

## Stos i architektura

| Warstwa | Wybór | Gdzie leży logika biznesowa |
|---|---|---|
| Frontend | Astro 6 + React 19 + TypeScript 5.9 (`astro.config.mjs`, `package.json`) | Komponenty lekcji (`src/components/lesson/*`), strony (`src/pages/**/*.astro`), API routes (`src/pages/api/**/*.ts`) |
| Baza danych | PostgreSQL via Supabase | `supabase/migrations/20260625184555_init.sql`, wygenerowane typy `src/lib/database.types.ts` |
| Auth / role | Supabase Auth + tabela `public.user_roles` | `src/middleware.ts:31-40`, RLS w migracji |
| Walidacja | Zod v4 (`package.json`) | `src/lib/exercise-schemas.ts`, API admina |
| Weryfikacja odpowiedzi | Funkcja deterministyczna | `src/lib/verify-exercise.ts` |

Logika biznesowa jest obecnie rozproszona: reguła ukończenia lekcji (FR-015) jest egzekwowana **wyłącznie po stronie klienta** w komponencie `LessonInteractive.tsx`, podczas gdy endpoint `POST /api/lessons/[id]/complete` dokonuje jedynie zapisu wiersza w `lesson_progress` bez walidacji warunków wstępnych (`tests/integration/lesson-completion.spec.ts:30-37` dokumentuje tę lukę).

## Kluczowe artefakty źródłowe

- `context/foundation/prd.md` — wymagania funkcjonalne i reguły biznesowe.
- `context/foundation/roadmap.md` — mapa drogowa; wszystkie slice'y S-01..S-07 są już wdrożone.
- `context/foundation/test-plan.md` — mapa ryzyk; ryzyko #6 dotyczy bezpośrednio bramy ukończenia lekcji.
- `src/lib/verify-exercise.ts` — silnik weryfikacji odpowiedzi zamkniętych.
- `src/components/lesson/LessonInteractive.tsx` — stan i gating po stronie UI.
- `src/pages/api/lessons/[id]/complete.ts` — endpoint zapisu postępu.
- `supabase/migrations/20260625184555_init.sql` — schemat, widoki, RLS.

---

# KROK 1 — Ubiquitous Language

| Pojęcie (termin) | Definicja (z PRD / kodu) | Źródło słowna (cytat) | Lokalizacja w kodzie |
|---|---|---|---|
| **Książka (Book)** | Top-level content unit — kurs / podręcznik przygotowujący do egzaminu. | „books — top-level content unit (a preparation course / textbook)." | `supabase/migrations/20260625184555_init.sql:43-49` |
| **Rozdział (Chapter)** | Uporządkowana część książki. | „chapters — ordered subdivisions of a book." | `supabase/migrations/20260625184555_init.sql:60-66` |
| **Lekcja (Lesson)** | Blog-postowa treść w ramach rozdziału; jednostka nauki. | „lessons — ordered blog-post content within a chapter (FR-014)." | `supabase/migrations/20260625184555_init.sql:69-77`, `src/pages/lessons/[id].astro:29-37` |
| **Ćwiczenie (Exercise)** | Zadanie przypięte do lekcji, dyskryminowane polem `type`; payload jest typu JSONB. | „exercises — per-lesson, discriminated by `type`." | `supabase/migrations/20260625184555_init.sql:80-89`, `src/lib/exercise-schemas.ts:3-6` |
| **Ćwiczenie zamknięte (Closed exercise)** | Ćwiczenie, którego poprawność można zweryfikować deterministycznie; liczy się do ukończenia lekcji. | „wszystkie ćwiczenia zamknięte (fill-in-blank, matching, multiple-choice, true/false, transformacje zdań) zostały poprawnie odpowiedziane — otwarte pytania nie wchodzą w skład warunku zaliczenia." | `context/foundation/prd.md:131-132`, `src/pages/lessons/[id].astro:55` |
| **Ćwiczenie otwarte (Open-ended exercise)** | Pytanie bez deterministycznej oceny; wyświetla wzorzec do samooceny; **nie blokuje** ukończenia. | „otwarte pytania nie blokują postępu — student widzi wzorzec, ocenia siebie sam." | `context/foundation/prd.md:116`, `src/components/lesson/OpenEndedExercise.tsx:1-46` |
| **Klucz odpowiedzi (ExerciseKey)** | Lista dopuszczalnych wariantów odpowiedzi dla ćwiczenia zamkniętego; dla pytań otwartych może być `is_reference_only`. | „exercise_keys — flat list of acceptable answer variants per FR-024." | `supabase/migrations/20260625184555_init.sql:92-99`, `src/lib/verify-exercise.ts:4-8` |
| **Wariant dopuszczalny (Acceptable variant)** | Jedna z poprawnych form odpowiedzi (np. synonimiczne sformułowanie w transformacji zdania). | „Transformacje zdań mogą mieć wieć poprawnych odpowiedzi — jeden klucz nie wystarczy. Rozwiązanie: klucz to lista dopuszczalnych wariantów." | `context/foundation/prd.md:111-113` |
| **Student** | Rola użytkownika; ma dostęp tylko do przypisanych książek i własnego postępu. | „Student — dostęp tylko do przypisanych książek: czytanie lekcji, wykonywanie ćwiczeń, śledzenie własnego postępu." | `context/foundation/prd.md:138`, `src/middleware.ts:31-40` |
| **Admin** | Rola użytkownika; pełny dostęp do treści, kont i nadawania dostępu. | „Admin — pełny dostęp: zarządzanie treściami, zarządzanie użytkownikami, nadawanie/odbieranie dostępu do książek." | `context/foundation/prd.md:137` |
| **Dostęp do książki (UserBookAccess)** | Przyznany studentowi dostęp do konkretnej książki (FR-003). | „user_book_access — granted access per (FR-003)." | `supabase/migrations/20260625184555_init.sql:52-58` |
| **Postęp lekcji (LessonProgress)** | Nieodwracalny marker ukończenia lekcji przez studenta; wiersz = ukończono. | „lesson_progress — append-only completion marker. Row presence equals 'lesson completed'." | `supabase/migrations/20260625184555_init.sql:102-108`, `src/pages/api/lessons/[id]/complete.ts:27-30` |
| **Postęp rozdziału (ChapterProgress)** | Widok agregujący: rozdział ukończony, gdy wszystkie lekcje ukończone. | „view `chapter_progress` (FR-016 derived state)." | `supabase/migrations/20260625184555_init.sql:153-174`, `src/pages/lessons/[id].astro:181-187` |
| **Weryfikacja deterministyczna** | Ocena odpowiedzi zamkniętej poprzez porównanie z listą kluczy (normalizacja trim + lowercase). | „System weryfikuje odpowiedzi do ćwiczeń zamkniętych deterministycznie wg listy dopuszczalnych wariantów." | `context/foundation/prd.md:111`, `src/lib/verify-exercise.ts:20-55` |
| **Przycisk „Przeczytano"** | Świadome potwierdzenie przeczytania treści lekcji; jeden z dwóch warunków ukończenia. | „wprowadzamy przycisk 'Przeczytano' jako świadome potwierdzenie." | `context/foundation/prd.md:99`, `src/components/lesson/LessonInteractive.tsx:42-62` |
| **Kontynuuj naukę** | Nawigacja studenta do pierwszej nieukończonej lekcji w aktywnej książce. | „'Kontynuuj naukę' kontynuuje w aktywnej/ostatnio otwartej książce." | `context/foundation/prd.md:94`, `src/pages/dashboard.astro:140-148` |
| **Agregat ukończenia rozdziału** | Automatyczny stan rozdziału uzależniony od kompletności lekcji. | „System oznacza rozdział jako ukończony gdy wszystkie lekcje w nim są ukończone." | `context/foundation/prd.md:101`, `supabase/migrations/20260625184555_init.sql:153-174` |
| **Nieodwracalność postępu** | Brak możliwości cofnięcia / usunięcia zapisu ukończenia przez użytkownika. | „Stan ukończenia jest nieodwracalny — nie resetuje się przy ponownym wejściu do lekcji." | `context/foundation/prd.md:133`, `supabase/migrations/20260625184555_init.sql:319-323` |

**Pojęcia istniejące w PRD, ale nie reprezentowane explicite w kodzie:**

- **Aktywna książka / ostatnio otwarta książka** — PRD mówi o „aktywnej/ostatnio otwartej książce" (`context/foundation/prd.md:94`), ale kod dashboardu (`src/pages/dashboard.astro`) iteruje po wszystkich książkach i wybiera pierwszą nieukończoną — **BRAK w kodzie** modelu „aktywnej książki".
- **Odpowiedź studenta (StudentAnswer)** — nie ma tabeli ani encji; odpowiedź jest tylko chwilowym payloadem w `POST /api/exercises/verify` i stanem lokalnym komponentu React — **BRAK w kodzie** (celowe w v1, ale warto zanotować).
- **Liczba prób / historia odpowiedzi** — nie jest przechowywana — **BRAK w kodzie**.

---

# KROK 2 — Klasyfikacja poddomen (Core / Supporting / Generic)

Kryterium podziału: które fragmenty systemu bezpośrednio realizują unikalną przewagę produktową (hipotezę „rozdział po rozdziale z weryfikacją i śladem ukończenia"), a które są wspierającymi szyną lub generyczną infrastrukturą.

| Poddomena | Klasa | Uzasadnienie powiązane z kryteriami sukcesu produktu | Kluczowe pliki / linie |
|---|---|---|---|
| **Flow nauki studenta** (lekcja → ćwiczenia → ukończenie → postęp → nawigacja) | **Core** | Bezpośrednio realizuje główne kryterium sukcesu: *„Student… wykonuje ćwiczenie — i widzi że lekcja / rozdział zaliczyły się"* (`prd.md:35`) oraz guardrail *„Postęp studenta nie może zaginąć ani się zresetować"* (`prd.md:46`). To główna różnica wobec Duolingo/Anki. | `src/pages/lessons/[id].astro`, `src/components/lesson/LessonInteractive.tsx`, `src/pages/api/lessons/[id]/complete.ts`, `src/lib/verify-exercise.ts` |
| **Weryfikacja odpowiedzi** (deterministyczne sprawdzanie zamkniętych ćwiczeń) | **Core** | Guardrail *„Ćwiczenia nie mogą zaliczać błędnych odpowiedzi jako poprawnych"* (`prd.md:45`). Właściwa weryfikacja jest podstawą wiarygodności platformy. | `src/lib/verify-exercise.ts:1-60`, `src/pages/api/exercises/verify.ts:1-64` |
| **Zarządzanie treścią** (CRUD książek, rozdziałów, lekcji, ćwiczeń przez admina) | **Supporting** | Drugie główne kryterium sukcesu: *„Admin może dodać książkę, rozdział, lekcję i ćwiczenie bez pisania kodu"* (`prd.md:36`). Ważne, ale nie różnicuje produktu na rynku — to standardowy CMS. | `src/pages/api/admin/books/index.ts`, `src/pages/api/admin/exercises/index.ts`, `src/components/admin/ExerciseForm.tsx` |
| **Zarządzanie użytkownikami i dostępem** (role, przyznawanie / odbieranie dostępu do książek) | **Supporting** | FR-002, FR-003; bez tego student nie widzi treści, ale sama logika nie jest unikalna dla BET. | `src/lib/services/user-admin.ts`, `src/middleware.ts:31-40`, `supabase/migrations/20260625184555_init.sql:125-148` |
| **Uwierzytelnianie** (logowanie, rejestracja, sesja) | **Generic** | Używamy Supabase Auth; BET nie implementuje własnego auth. | `src/lib/supabase.ts`, `src/pages/api/auth/*.ts` |
| **Renderowanie i prezentacja** (Markdown → HTML, Tailwind, komponenty UI) | **Generic** | Działa na treści, ale nie niesie reguł biznesowych. | `src/lib/markdown.ts`, `src/components/ui/*`, layouty Astro |
| **Hosting / wdrożenie** (Cloudflare Pages, observability) | **Generic** | Infrastruktura, nie logika domenowa. | `wrangler.jsonc`, `.github/workflows/ci.yml` |

**Wniosek strategiczny:** Wartość BET kryje się w **poprawnym, nieodwracalnym flow ukończenia lekcji** i **bezbłędnej weryfikacji odpowiedzi**. Te dwie poddomeny powinny być najlepiej odizolowane od infrastruktury ( Supabase, React, Astro) i objęte najmocniejszymi testami jednostkowymi / kontraktami. Reszta to supporting/generic.

---

# KROK 3 — Kandydaci na agregaty i inwarianty

## Kandydat A: LessonCompletion — ukończenie lekcji

- **Opis inwariantu:** Lekcję można oznaczyć jako ukończoną **wtedy i tylko wtedy, gdy** student potwierdził przeczytanie treści (`Przeczytano`) **ORAZ** wszystkie ćwiczenia zamknięte w tej lekcji zostały poprawnie rozwiązane. Ćwiczenia otwarte nie blokują ukończenia. Ukończenie jest nieodwracalne.
- **Źródło słowne:** `context/foundation/prd.md:96-99`, `context/foundation/prd.md:131-133`.
- **Egzekwowanie w kodzie:**
  - **Deklarowane** w UI: `src/components/lesson/LessonInteractive.tsx:42-62` (blokuje przycisk, jeśli `completedExercises.size < closedExerciseCount`) oraz linia `130-167` (disabluje przycisk).
  - **Ignorowane** po stronie serwera: `src/pages/api/lessons/[id]/complete.ts:1-34` wykonuje tylko `upsert` do `lesson_progress`, bez sprawdzania stanu ćwiczeń.
  - **Częściowo egzekwowane** przez RLS: `supabase/migrations/20260625184555_init.sql:319-323` — brak polityk UPDATE/DELETE chroni nieodwracalność, ale nie weryfikuje warunków wstępnych.
- **Ocena:** Najwyższy priorytet — model vs kod gap #1; bezpośrednio dotyczy kryteriów sukcesu i guardraili.

## Kandydat B: ExerciseVerification — poprawność odpowiedzi zamkniętych

- **Opis inwariantu:** Odpowiedź zamknięta jest poprawna wtedy, gdy po normalizacji (trim + lowercase) pasuje do co najmniej jednego klucza `exercise_keys`, który nie jest `is_reference_only`. Dla `matching` porównywane są mapy lewo-prawo; `open_ended` zawsze zwraca `false`.
- **Źródło słowne:** `context/foundation/prd.md:111-113`, `context/foundation/prd.md:45`.
- **Egzekwowanie w kodzie:**
  - **Egzekwowane** w `src/lib/verify-exercise.ts:20-55` (`normalizeAnswer`, `verifyClosedAnswer`, `verifyMatchingAnswer`).
  - **Egzekwowane** w `src/pages/api/exercises/verify.ts:1-64`.
  - Testy: `src/lib/verify-exercise.test.ts` (pokrycie 100% lini).
- **Ocena:** Dobrze zabezpieczona poddomena core; nie jest #1, ale wymaga uważności przy dodawaniu nowych typów ćwiczeń.

## Kandydat C: ChapterCompletion — ukończenie rozdziału

- **Opis inwariantu:** Rozdział jest ukończony, gdy wszystkie lekcje w nim są ukończone.
- **Źródło słowne:** `context/foundation/prd.md:101`.
- **Egzekwowanie w kodzie:**
  - **Egzekwowane** jako widok SQL `chapter_progress` w `supabase/migrations/20260625184555_init.sql:153-174`.
  - Wykorzystywane w `src/pages/lessons/[id].astro:181-187` i `src/pages/dashboard.astro:115-132`.
- **Ocena:** Poddomena core, ale obecnie nie ma luki — reguła jest prawidłowo zamodelowana jako widok bazy danych (read-model). Można by ją wzmocnić testami kontraktowymi, ale nie wymaga refaktoryzacji agregatu.

## Kandydat D: UserBookAccess — dostęp studenta do książki

- **Opis inwariantu:** Student może widzieć / uczyć się tylko z książek, do których ma nadany dostęp.
- **Źródło słowne:** `context/foundation/prd.md:138`, FR-003.
- **Egzekwowanie w kodzie:**
  - **Egzekwowane** przez RLS w `supabase/migrations/20260625184555_init.sql:125-148` (funkcje `has_book_access`, `has_lesson_access`, `has_exercise_access`).
  - W MVP załagodzone migracją `20260629000000_open_book_access_for_students.sql`, która zwraca `true` dla wszystkich zalogowanych studentów (świadoma decyzja MVP, aby treść była widoczna od razu).
- **Ocena:** Ważne, ale świadomie rozluźnione w MVP; nie jest najpilniejszym agregatem do refaktoryzacji.

---

# KROK 4 — MODEL vs CODE gaps

| # | Model (dokument / PRD mówi X) | Kod robi Y | Dowód | Waga |
|---|---|---|---|---|
| 1 | **FR-015:** Lekcję uznaje się za ukończoną tylko po „Przeczytano" + poprawnym rozwiązaniu wszystkich ćwiczeń zamkniętych. | UI blokuje przycisk, ale serwer akceptuje każde `POST /api/lessons/{id}/complete` i zapisuje `lesson_progress`. | `src/components/lesson/LessonInteractive.tsx:42-62` (UI gating); `src/pages/api/lessons/[id]/complete.ts:27-30` (zapis bez walidacji); `tests/integration/lesson-completion.spec.ts:30-37` (dokumentacja luki). | Krytyczna — zaburza główne kryterium sukcesu i guardrail „postęp nie ginie / nie jest fałszowany". |
| 2 | **FR-025:** Ćwiczenia otwarte nie blokują ukończenia. | UI wyklucza `open_ended` z licznika `closedExerciseCount`, więc nie jest wymagane; serwer też go nie sprawdza. | `src/pages/lessons/[id].astro:55` (`e.type !== "open_ended"`); `src/components/lesson/LessonInteractive.tsx:42-62`. | Działa zgodnie z intencją, ale **wyłącznie w UI** — brak serwerowej gwarancji przy gap #1. |
| 3 | **FR-024:** Weryfikacja deterministyczna wg listy wariantów. | Funkcja `verifyExercise` poprawnie normalizuje i dopasowuje do kluczy, ale nie ma kontraktu na to, że klucze są właściwie oznaczone jako `is_reference_only`. | `src/lib/verify-exercise.ts:20-55`; `src/pages/api/admin/exercises/index.ts:133-144` (admin może przypadkowo zapisać otwarty klucz bez flagi `is_reference_only`). | Średnia — ryzyko błędnej klasyfikacji odpowiedzi, jeśli admin źle oznaczy klucz. |
| 4 | **Business Logic:** Postęp lekcji jest nieodwracalny. | `lesson_progress` nie ma polityk UPDATE/DELETE — zapis jest append-only. | `supabase/migrations/20260625184555_init.sql:319-323`. | Zgodne z modelem. |
| 5 | **FR-016:** Rozdział ukończony, gdy wszystkie lekcje ukończone. | Widok `chapter_progress` agreguje poprawnie. | `supabase/migrations/20260625184555_init.sql:153-174`. | Zgodne z modelem (read-model). |
| 6 | **US-01:** „Kontynuuj naukę" kontynuuje w aktywnej/ostatnio otwartej książce. | Kod dashboardu wybiera **pierwszą nieukończoną lekcję we wszystkich książkach**, nie pamiętając „aktywnej" książki. | `context/foundation/prd.md:94`; `src/pages/dashboard.astro:103-148` iteruje po `bookData`, nie ma pola `active_book_id`. | Niska — nie psuje MVP, ale rozmija się z ustalonym modelem nawigacji. |
| 7 | **FR-024 / Matching:** Klucz matchingu to mapa JSON indeksów lewo-prawo. | Admin API waliduje kształt klucza, ale weryfikacja po stronie serwera polega na `JSON.parse(answer)`, co może być podatne na błędny payload. | `src/lib/verify-exercise.ts:32-50`; `src/pages/api/exercises/verify.ts:30-64` nie waliduje, że `answer` jest mapą — tylko `verifyMatchingAnswer` łapie wyjątek. | Średnia — niebezpieczeństwo fałszywie ujemnych wyników przy złym JSON. |

---

# KROK 5 — Ranking refaktoryzacji i wybór #1

| Pozycja | Kandydat | Uzasadnienie priorytetu | Propozycja działania |
|---|---|---|---|
| **#1** | **LessonCompletion — serwerowa brama ukończenia lekcji** | Bezpośrednio chroni główne kryterium sukcesu (`prd.md:35`) i dwa guardraili: „postęp nie ginie / nie jest fałszowany" (`prd.md:46`) oraz „błędne odpowiedzi nie mogą być zaliczone" (`prd.md:45`). Test-plan ryzyko #6 (`context/foundation/test-plan.md:24`) oraz integracyjny test `tests/integration/lesson-completion.spec.ts:30-37` wyraźnie dokumentują lukę. Jest to luka **trust boundary**: klient może być zmieniony / ominąć. | Wydzielić agregat `LessonCompletion` z serwerową walidacją warunków wstępnych; szczegóły w `02-invariant-aggregate-refactor.md`. |
| #2 | ExerciseKey — jednoznaczna klasyfikacja kluczy | Jeśli admin źle oznaczy klucz do ćwiczenia otwartego bez `is_reference_only`, silnik `verifyExercise` może zacząć go traktować jako poprawną odpowiedź zamkniętą. Dotyczy ryzyka #1 i #2 z test-planu. | Wprowadzić dedykowany typ wartości `ClosedKey` vs `ReferenceKey` i walidować przy zapisie przez admina. |
| #3 | Matching answer contract | Payload JSON dla matchingu jest ręcznie parsowany; brak jasnego kontraktu na `answer` może prowadzić do fałszywie negatywnych wyników. | Dodać walidację `answer` w `verifyExercise` (np. przez Zod) przed porównaniem map. |
| #4 | Active book navigation | Rozbieżność między „aktywną książką" z PRD a implementacją dashboardu. | Dodać pole `active_book_id` do profilu / sesji i używać go w dashboardzie. |
| #5 | ChapterCompletion jako agregat zapisu | Obecnie widok SQL wystarcza, ale przy rozroście logiki (np. certyfikaty) warto rozważyć event / projection. | Pozostawić jako read-model; nie refaktoryzować w MVP. |

---

# Ograniczenia

1. Analiza bazuje na migawkach kodu z dnia 2026-07-01; pliki mogą ulec zmianie.
2. Nie uruchamiano testów w tym środowisku — wnioski o pokryciu pochodzą z `context/foundation/test-plan.md` oraz zawartości `src/lib/verify-exercise.test.ts`.
3. Poddomena AI / LLM jest poza zakresem MVP (Non-Goals w PRD), więc nie została przeanalizowana.
4. Model dostępu do książek został celowo rozluźniony migracją `20260629000000_open_book_access_for_students.sql` — zakładamy, że to świadoma decyzja MVP, nie błąd.
5. Nie badano frontendowych aspektów UX (secondary success criteria) pod kątem domeny.

# Podsumowanie (5-8 zdań)

BET to platforma edukacyjna, której wartość rynkowa opiera się na nieodwracalnym flow ukończenia lekcji z deterministyczną weryfikacją odpowiedzi. W wyniku destylacji wyodrębniono cztery kandydaty na agregaty / inwarianty: ukończenie lekcji, weryfikacja odpowiedzi, ukończenie rozdziału oraz dostęp do książek. Najpoważniejsza luka model-kod dotyczy inwariantu ukończenia lekcji (FR-015): reguła jest egzekwowana wyłącznie w komponencie React, podczas gdy endpoint serwerowy akceptuje każdy zapis postępu, co narusza trust boundary i guardrail „postęp nie może być fałszowany". Pozostałe inwarianty są lepiej zabezpieczone — weryfikacja odpowiedzi ma dedykowany, przetestowany moduł, a ukończenie rozdziału jest poprawnie zamodelowane jako widok SQL. Dlatego refaktoryzacja agregatu `LessonCompletion` ma pierwszeństwo przed dalszym uszczelnianiem innych poddomen.
