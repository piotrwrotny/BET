---
title: BET — destylacja domeny (Ubiquitous Language, subdomainy, agregaty, rozjazdy model-kod)
created: 2026-07-02
type: domain-distillation
---

# KROK 0 — Kontekst projektu

BET (Business English Tests) to platforma edukacyjna dla studentów przygotowujących się do egzaminów z języka angielskiego (FCE, CAE, B2 First). Główna hipoteza produktowa: student przerabia konkretny podręcznik rozdział po rozdziale, wykonuje ćwiczenia z deterministyczną weryfikacją odpowiedzi i zostawia nieodwracalny ślad ukończenia.

## Źródła wymagań

- `context/foundation/prd.md` — wymagania funkcjonalne, reguły biznesowe, kryteria sukcesu, non-goals.
- `context/foundation/roadmap.md` — mapa drogowa; wszystkie slice'y S-01..S-07 są wdrożone i zarchiwizowane.
- `context/foundation/tech-stack.md` — stos: Astro 6 + React 19 + TypeScript + Supabase (PostgreSQL + auth) + Cloudflare Pages.

## Stos i rozmieszczenie logiki biznesowej

| Warstwa | Technologia | Gdzie żyje logika domenowa |
|---|---|---|
| Frontend / SSR | Astro 6.3.1 + React 19 + TypeScript 5.9 | Strony (`src/pages/**/*.astro`), komponenty lekcji (`src/components/lesson/*`), API routes (`src/pages/api/**/*.ts`) |
| Baza danych | PostgreSQL via Supabase | `supabase/migrations/20260625184555_init.sql`, `supabase/migrations/20260629000000_open_book_access_for_students.sql`, `supabase/migrations/20260701190000_add_exercise_submissions.sql` |
| Auth / role | Supabase Auth + tabela `public.user_roles` | `src/middleware.ts:22-40`, RLS w migracji |
| Walidacja / weryfikacja | Zod v4 (`package.json`) | `src/lib/exercise-schemas.ts`, `src/lib/verify-exercise.ts`, `src/lib/services/lesson-completion.ts` |

Logika biznesowa jest obecnie rozdzielona między warstwę domenową (pojedyncza klasa `LessonCompletion` w `src/lib/services/lesson-completion.ts`), warstwę API (Astro routes) oraz schemat bazy danych z widokami i RLS. Nie ma wyraźnej warstwy aplikacji ani repozytoriów domenowych — API routes bezpośrednio wywołują klienta Supabase.

---

# KROK 1 — Ubiquitous Language

| Pojęcie | Definicja | Cytat źródłowy | Lokalizacja w kodzie |
|---|---|---|---|
| **Książka (Book)** | Top-level content unit — podręcznik / kurs przygotowujący do egzaminu. | „books — top-level content unit (a preparation course / textbook)." | `supabase/migrations/20260625184555_init.sql:43-49` |
| **Rozdział (Chapter)** | Uporządkowana część książki. | „chapters — ordered subdivisions of a book." | `supabase/migrations/20260625184555_init.sql:60-66` |
| **Lekcja (Lesson)** | Blog-postowa treść w ramach rozdziału; jednostka nauki z ćwiczeniami. | „lessons — ordered blog-post content within a chapter (FR-014)." | `supabase/migrations/20260625184555_init.sql:69-77`, `src/pages/lessons/[id].astro:29-37` |
| **Ćwiczenie (Exercise)** | Zadanie przypięte do lekcji, dyskryminowane polem `type`; payload JSONB. | „exercises — per-lesson, discriminated by `type`." | `supabase/migrations/20260625184555_init.sql:80-89`, `src/lib/exercise-schemas.ts:3-6` |
| **Ćwiczenie zamknięte (Closed exercise)** | Ćwiczenie weryfikowane deterministycznie; liczy się do ukończenia lekcji. | „wszystkie ćwiczenia zamknięte (fill-in-blank, matching, multiple-choice, true/false, transformacje zdań) zostały poprawnie odpowiedziane — otwarte pytania nie wchodzą w skład warunku zaliczenia." | `context/foundation/prd.md:131-132`, `src/lib/services/lesson-completion.ts:24-37` |
| **Ćwiczenie otwarte (Open-ended exercise)** | Pytanie bez deterministycznej oceny; wyświetla wzorzec do samooceny; **nie blokuje** ukończenia. | „otwarte pytania nie blokują postępu — student widzi wzorzec, ocenia siebie sam." | `context/foundation/prd.md:116`, `src/components/lesson/OpenEndedExercise.tsx:1-46` |
| **Klucz odpowiedzi (ExerciseKey)** | Lista dopuszczalnych wariantów odpowiedzi dla ćwiczenia zamkniętego; dla pytań otwartych flaga `is_reference_only`. | „exercise_keys — flat list of acceptable answer variants per FR-024." | `supabase/migrations/20260625184555_init.sql:92-99`, `src/lib/verify-exercise.ts:4-8` |
| **Wariant dopuszczalny (Acceptable variant)** | Jedna z poprawnych form odpowiedzi (np. synonimiczne sformułowanie transformacji zdania). | „Transformacje zdań mogą mieć wiele poprawnych odpowiedzi — jeden klucz nie wystarczy. Rozwiązanie: klucz to lista dopuszczalnych wariantów." | `context/foundation/prd.md:111-113` |
| **Student** | Rola użytkownika; dostęp do przypisanych książek i własnego postępu. | „Student — dostęp tylko do przypisanych książek: czytanie lekcji, wykonywanie ćwiczeń, śledzenie własnego postępu." | `context/foundation/prd.md:138`, `src/middleware.ts:22-40` |
| **Admin** | Rola użytkownika; pełny dostęp do treści, kont i nadawania dostępu. | „Admin — pełny dostęp: zarządzanie treściami, zarządzanie użytkownikami, nadawanie/odbieranie dostępu do książek." | `context/foundation/prd.md:137` |
| **Dostęp do książki (UserBookAccess)** | Przyznany studentowi dostęp do konkretnej książki (FR-003). | „user_book_access — granted access per (FR-003)." | `supabase/migrations/20260625184555_init.sql:52-58` |
| **Postęp lekcji (LessonProgress)** | Nieodwracalny marker ukończenia lekcji przez studenta; wiersz = ukończono. | „lesson_progress — append-only completion marker. Row presence equals 'lesson completed'." | `supabase/migrations/20260625184555_init.sql:102-108`, `src/pages/api/lessons/[id]/complete.ts:36-39` |
| **Postęp rozdziału (ChapterProgress)** | Widok agregujący: rozdział ukończony, gdy wszystkie lekcje ukończone. | „view `chapter_progress` (FR-016 derived state)." | `supabase/migrations/20260625184555_init.sql:153-174`, `src/pages/lessons/[id].astro:181-187` |
| **Weryfikacja deterministyczna** | Ocena odpowiedzi zamkniętej poprzez porównanie z listą kluczy (normalizacja trim + lowercase). | „System weryfikuje odpowiedzi do ćwiczeń zamkniętych deterministycznie wg listy dopuszczalnych wariantów." | `context/foundation/prd.md:111`, `src/lib/verify-exercise.ts:20-55` |
| **Przycisk „Przeczytano"** | Świadome potwierdzenie przeczytania treści lekcji; jeden z dwóch warunków ukończenia. | „wprowadzamy przycisk 'Przeczytano' jako świadome potwierdzenie." | `context/foundation/prd.md:99`, `src/components/lesson/LessonInteractive.tsx:42-62` |
| **Kontynuuj naukę** | Nawigacja studenta do pierwszej nieukończonej lekcji w aktywnej/ostatnio otwartej książce. | „'Kontynuuj naukę' kontynuuje w aktywnej/ostatnio otwartej książce." | `context/foundation/prd.md:94`, `src/pages/dashboard.astro:103-148` |
| **Nieodwracalność postępu** | Brak możliwości cofnięcia / usunięcia zapisu ukończenia przez użytkownika. | „Stan ukończenia jest nieodwracalny — nie resetuje się przy ponownym wejściu do lekcji." | `context/foundation/prd.md:133`, `supabase/migrations/20260625184555_init.sql:319-323` |
| **Zgłoszenie odpowiedzi (ExerciseSubmission)** | Append-only zapis poprawnej odpowiedzi do ćwiczenia zamkniętego; brak zgłoszenia = ćwiczenie nierozwiązane. | „exercise_submissions: append-only record of verified correct closed answers." | `supabase/migrations/20260701190000_add_exercise_submissions.sql:12-25` |

**Pojęcia z PRD nie reprezentowane explicite w kodzie:**

- **Aktywna książka / ostatnio otwarta książka** — PRD mówi o „aktywnej/ostatnio otwartej książce" (`context/foundation/prd.md:94`), ale dashboard wybiera pierwszą nieukończoną lekcję we wszystkich książkach — **BRAK w kodzie** modelu „aktywnej książki".
- **Świadome potwierdzenie przeczytania jako zdarzenie domenowe** — przycisk „Przeczytano" istnieje w UI, ale serwer nie rejestruje tego zdarzenia; traktuje każdy `POST /api/lessons/{id}/complete` jako równoważny z potwierdzeniem — **BRAK w kodzie** encji/zdarzenia `LessonRead`.
- **Liczba prób / historia odpowiedzi błędnych** — nie jest przechowywana — **BRAK w kodzie**.

---

# KROK 2 — Klasyfikacja poddomen (Core / Supporting / Generic)

Kryterium podziału: które fragmenty systemu realizują unikalną przewagę produktową (hipoteza „rozdział po rozdziale z weryfikacją i nieodwracalnym śladem ukończenia"), a które są wspierającą szyną lub generyczną infrastrukturą.

| Poddomena | Klasa | Uzasadnienie powiązane z celami produktu | Kluczowe pliki / linie |
|---|---|---|---|
| **Flow nauki studenta** (lekcja → ćwiczenia → ukończenie → postęp → nawigacja) | **Core** | Bezpośrednio realizuje główne kryterium sukcesu: *„Student… wykonuje ćwiczenie — i widzi że lekcja / rozdział zaliczyły się"* (`prd.md:35`) oraz guardrail *„Postęp studenta nie może zaginąć ani się zresetować"* (`prd.md:46`). To główna różnica wobec Duolingo/Anki. | `src/pages/lessons/[id].astro`, `src/components/lesson/LessonInteractive.tsx`, `src/lib/services/lesson-completion.ts`, `src/pages/api/lessons/[id]/complete.ts` |
| **Weryfikacja odpowiedzi** (deterministyczne sprawdzanie zamkniętych ćwiczeń) | **Core** | Guardrail *„Ćwiczenia nie mogą zaliczać błędnych odpowiedzi jako poprawnych"* (`prd.md:45`). Właściwa weryfikacja jest podstawą wiarygodności platformy. | `src/lib/verify-exercise.ts:1-60`, `src/pages/api/exercises/verify.ts:45-62` |
| **Zarządzanie treścią** (CRUD książek, rozdziałów, lekcji, ćwiczeń przez admina) | **Supporting** | Drugie główne kryterium sukcesu: *„Admin może dodać książkę, rozdział, lekcję i ćwiczenie bez pisania kodu"* (`prd.md:36`). Ważne, ale nie różnicuje produktu na rynku — to standardowy CMS. | `src/pages/api/admin/books/index.ts`, `src/pages/api/admin/exercises/index.ts`, `src/components/admin/ExerciseForm.tsx` |
| **Zarządzanie użytkownikami i dostępem** (role, przyznawanie / odbieranie dostępu do książek) | **Supporting** | FR-002, FR-003; bez tego student nie widzi treści, ale sama logika nie jest unikalna dla BET. | `src/lib/services/user-admin.server.ts`, `src/middleware.ts:22-40`, `supabase/migrations/20260625184555_init.sql:125-148` |
| **Uwierzytelnianie** (logowanie, rejestracja, sesja) | **Generic** | Używamy Supabase Auth; BET nie implementuje własnego auth. | `src/lib/supabase.server.ts`, `src/pages/api/auth/*.ts` |
| **Renderowanie i prezentacja** (Markdown → HTML, Tailwind, komponenty UI) | **Generic** | Działa na treści, ale nie niesie reguł biznesowych. | `src/lib/markdown.ts`, `src/components/ui/*`, layouty Astro |
| **Hosting / wdrożenie** (Cloudflare Pages, observability) | **Generic** | Infrastruktura, nie logika domenowa. | `wrangler.jsonc`, `.github/workflows/ci.yml` |

**Wniosek strategiczny:** Wartość BET kryje się w **poprawnym, nieodwracalnym flow ukończenia lekcji** i **bezbłędnej weryfikacji odpowiedzi**. Te dwie poddomeny powinny być najlepiej odizolowane od infrastruktury (Supabase, React, Astro) i objęte najmocniejszymi testami jednostkowymi / kontraktowymi.

---

# KROK 3 — Kandydaci na agregaty i niezmienniki

## Kandydat A: LessonCompletion — ukończenie lekcji

- **Niezmiennik:** Lekcję można oznaczyć jako ukończoną **wtedy i tylko wtedy, gdy** student potwierdził przeczytanie treści (kliknął „Przeczytano") **ORAZ** wszystkie ćwiczenia zamknięte w tej lekcji zostały poprawnie rozwiązane. Ćwiczenia otwarte nie blokują ukończenia. Ukończenie jest nieodwracalne.
- **Źródło słowne:** `context/foundation/prd.md:96-99`, `context/foundation/prd.md:131-133`.
- **Egzekwowanie w kodzie:**
  - **Egzekwowane po stronie serwera** dla ćwiczeń zamkniętych: `src/lib/services/lesson-completion.ts:24-37` sprawdza, czy wszystkie `closedExerciseIds` znajdują się w `solvedExerciseIds`; w przeciwnym razie rzuca `ClosedExercisesNotSolvedError`.
  - **Egzekwowane w endpoincie:** `src/pages/api/lessons/[id]/complete.ts:36-39` wywołuje `completion.markComplete()` i obsługuje `ClosedExercisesNotSolvedError` (`complete.ts:41-44`).
  - **Deklarowane w UI:** `src/components/lesson/LessonInteractive.tsx:156-157` blokuje przycisk „Przeczytano", dopóki `completedExercises.size < closedExerciseCount`.
  - **Ignorowane po stronie serwera** dla warunku „Przeczytano": serwer nie rejestruje ani nie weryfikuje, czy student rzeczywiście potwierdził przeczytanie treści — każdy autoryzowany `POST` do `/api/lessons/{id}/complete` jest traktowany jako równoważny z kliknięciem przycisku.
  - **Egzekwowana nieodwracalność:** `supabase/migrations/20260625184555_init.sql:319-323` — brak polityk UPDATE/DELETE na `lesson_progress`.
- **Ocena:** Najwyższy priorytet refaktoryzacji — serwer już broni gatingu ćwiczeń zamkniętych, ale nie broni warunku „Przeczytano" oraz brakuje mu ochrony CSRF w porównaniu do admin endpointów.

## Kandydat B: ExerciseVerification — poprawność odpowiedzi zamkniętych

- **Niezmiennik:** Odpowiedź zamknięta jest poprawna wtedy, gdy po normalizacji (trim + lowercase) pasuje do co najmniej jednego klucza `exercise_keys`, który nie jest `is_reference_only`. Dla `matching` porównywane są mapy lewo-prawo; `open_ended` zawsze zwraca `false`.
- **Źródło słowne:** `context/foundation/prd.md:111-113`, `context/foundation/prd.md:45`.
- **Egzekwowanie w kodzie:**
  - **Egzekwowane** w `src/lib/verify-exercise.ts:20-55` (`normalizeAnswer`, `verifyClosedAnswer`, `verifyMatchingAnswer`).
  - **Egzekwowane** w `src/pages/api/exercises/verify.ts:45-62`.
  - Testy jednostkowe: `src/lib/verify-exercise.test.ts`.
- **Ocena:** Dobrze zabezpieczona poddomena core; nie jest #1, ale wymaga uważności przy dodawaniu nowych typów ćwiczeń.

## Kandydat C: ChapterCompletion — ukończenie rozdziału

- **Niezmiennik:** Rozdział jest ukończony, gdy wszystkie lekcje w nim są ukończone.
- **Źródło słowne:** `context/foundation/prd.md:101`.
- **Egzekwowanie w kodzie:**
  - **Egzekwowane** jako widok SQL `chapter_progress` w `supabase/migrations/20260625184555_init.sql:153-174`.
  - Wykorzystywane w `src/pages/lessons/[id].astro:181-187` i `src/pages/dashboard.astro:115-132`.
- **Ocena:** Poddomena core, obecnie zamodelowana poprawnie jako read-model. Nie wymaga pilnej refaktoryzacji agregatu.

## Kandydat D: UserBookAccess — dostęp studenta do książki

- **Niezmiennik:** Student może widzieć / uczyć się tylko z książek, do których ma nadany dostęp.
- **Źródło słowne:** `context/foundation/prd.md:138`, FR-003.
- **Egzekwowanie w kodzie:**
  - **Egzekwowane** przez RLS w `supabase/migrations/20260625184555_init.sql:125-148` (funkcje `has_book_access`, `has_lesson_access`, `has_exercise_access`).
  - W MVP celowo rozluźnione migracją `20260629000000_open_book_access_for_students.sql`, która zwraca `true` dla wszystkich zalogowanych studentów.
- **Ocena:** Ważne, ale świadomie rozluźnione w MVP; nie jest najpilniejszym agregatem do refaktoryzacji.

---

# KROK 4 — Rozjazdy MODEL vs KOD

| # | Model (dokument / PRD mówi X) | Kod robi Y | Dowód | Waga |
|---|---|---|---|---|
| 1 | **FR-015:** Lekcję uznaje się za ukończoną dopiero po kliknięciu „Przeczytano" **ORAZ** poprawnym rozwiązaniu wszystkich ćwiczeń zamkniętych. | Serwer weryfikuje rozwiązanie ćwiczeń zamkniętych (`closedExerciseIds ⊆ solvedExerciseIds`), ale **nie rejestruje ani nie weryfikuje** zdarzenia „Przeczytano". Każde autoryzowane wywołanie `POST /api/lessons/{id}/complete` jest traktowane jako kompletne potwierdzenie. | `context/foundation/prd.md:96-99`; `src/lib/services/lesson-completion.ts:24-37` (sprawdza tylko ćwiczenia); `src/pages/api/lessons/[id]/complete.ts:36-39` (brak walidacji przeczytania). | Wysoka — narusza jeden z dwóch warunków ukończenia lekcji; atakujący może oznaczyć lekcję jako ukończoną bez deklaracji przeczytania. |
| 2 | **FR-015 / bezpieczeństwo:** Brama ukończenia lekcji jest chroniona przed manipulacją (serwer jako źródło prawdy). | Gating ćwiczeń zamkniętych jest już po stronie serwera (`LessonCompletion.markComplete`), ale sam endpoint `complete.ts` nie stosuje ochrony `requireSameOrigin` w przeciwieństwie do endpointów admina. | `src/pages/api/lessons/[id]/complete.ts:1-52` (brak `requireSameOrigin`); `src/pages/api/admin/exercises/index.ts:16-28` (ma `isSameOrigin`). | Średnia / wysoka — RLS ogranicza do `user_id = auth.uid()`, ale brak CSRF może umożliwić cross-site state-changing request przy odpowiedniej konfiguracji ciasteczek. |
| 3 | **FR-025:** Ćwiczenia otwarte nie blokują ukończenia. | UI wyklucza `open_ended` z licznika `closedExerciseCount`; serwer w `loadLessonCompletion` również wyklucza `open_ended` z `closedExerciseIds`. | `src/pages/lessons/[id].astro:55` (`e.type !== "open_ended"`); `src/lib/services/lesson-completion.repository.ts:28-30` (`CLOSED_EXERCISE_LOOKUP` nie zawiera `open_ended`). | Zgodne z intencją — brak luki. |
| 4 | **FR-024:** Weryfikacja deterministyczna wg listy wariantów. | Funkcja `verifyExercise` poprawnie normalizuje i dopasowuje do kluczy; jednak dla `matching` odpowiedź studenta jest parsowana przez `JSON.parse` i konwertowana na stringi bez ścisłej walidacji struktury. | `src/lib/verify-exercise.ts:32-50`; `src/lib/exercise-schemas.ts:35-42` (`parseMatchingKey` rzuca tylko przy nie-obiekcie). | Średnia — ryzyko fałszywie negatywnych wyników przy złym JSON lub nieoczekiwanych wartościach. |
| 5 | **FR-024 / admin model:** Klucze do ćwiczeń zamkniętych i otwartych są jednoznacznie rozróżniane. | Admin API automatycznie ustawia `is_reference_only: true` tylko dla `open_ended`, ale `fill_in_blank`, `true_false` mają puste schematy payload (`{}`), więc klucze tych typów są czysto tekstowe bez metadanych. | `src/lib/exercise-schemas.ts:10-11` (`FillInBlankPayloadSchema`, `TrueFalsePayloadSchema` jako `.strict()` `{}`); `src/pages/api/admin/exercises/index.ts:133-144` (flaga tylko dla `open_ended`). | Niska / średnia — działa, ale brak jednoznacznego modelu wartości `ClosedKey` vs `ReferenceKey` utrudnia rozszerzalność. |
| 6 | **Business Logic:** Postęp lekcji jest nieodwracalny. | `lesson_progress` nie ma polityk UPDATE/DELETE — zapis jest append-only. | `supabase/migrations/20260625184555_init.sql:319-323`. | Zgodne z modelem. |
| 7 | **FR-016:** Rozdział ukończony, gdy wszystkie lekcje ukończone. | Widok `chapter_progress` agreguje poprawnie. | `supabase/migrations/20260625184555_init.sql:153-174`. | Zgodne z modelem (read-model). |
| 8 | **US-01:** „Kontynuuj naukę" kontynuuje w aktywnej/ostatnio otwartej książce. | Kod dashboardu wybiera **pierwszą nieukończoną lekcję we wszystkich książkach**, nie pamiętając „aktywnej" książki. | `context/foundation/prd.md:94`; `src/pages/dashboard.astro:103-148` iteruje po `bookData`, nie ma pola `active_book_id`. | Niska — nie psuje MVP, ale rozmija się z ustalonym modelem nawigacji. |
| 9 | **FR-018 / FR-023:** Payload ćwiczenia ma sensowny kształt dla każdego typu. | `fill_in_blank` i `true_false` mają puste schematy (`{}`), więc nie ma w nich domenowych danych poza `prompt`; `multiple_choice` ma listę opcji; `matching` ma pary; `sentence_transformation` ma `original`; `open_ended` jest pusty. | `src/lib/exercise-schemas.ts:10-11`, `src/lib/exercise-schemas.ts:13-26`. | Niska — działa w v1, ale brak jednolitego modelu payloadu ćwiczenia. |

---

# KROK 5 — Ranking refaktoryzacji

| Pozycja | Kandydat | Uzasadnienie priorytetu | Propozycja działania |
|---|---|---|---|
| **#1** | **LessonCompletion — serwerowa brama ukończenia lekcji** | Serwer już broni gatingu ćwiczeń zamknietych, ale nie broni warunku „Przeczytano" oraz brakuje ochrony CSRF. Jest to luka **trust boundary**: klient może być zmieniony / ominąć. Bezpośrednio dotyczy głównego kryterium sukcesu (`prd.md:35`) i guardraila „postęp nie ginie / nie jest fałszowany" (`prd.md:46`). | Wprowadzić zdarzenie domenowe `LessonMarkedAsRead`, wymagać go w agregacie `LessonCompletion`, dodać `requireSameOrigin` do endpointu `complete.ts`. |
| **#2** | **ExerciseKey — jednoznaczna klasyfikacja kluczy** | Brak formalnego rozróżnienia `ClosedKey` vs `ReferenceKey`; klucze do `fill_in_blank` / `true_false` są czysto tekstowe bez metadanych. Przy skalowaniu typów ćwiczeń łatwo o pomyłkę. | Wprowadzić dwa typy wartości / etykiety klucza i walidować spójność `type + key_metadata` przy zapisie przez admina. |
| **#3** | **Matching answer contract** | Payload JSON dla matchingu jest ręcznie parsowany; brak jasnego kontraktu na `answer` może prowadzić do fałszywie negatywnych wyników. | Dodać walidację `answer` w `verifyExercise` (np. przez Zod) przed porównaniem map; upewnić się, że `parseMatchingKey` odrzuca wartości inne niż oczekiwane indeksy. |
| **#4** | **Active book navigation** | Rozbieżność między „aktywną książką" z PRD a implementacją dashboardu. | Dodać pole `active_book_id` do profilu / sesji i używać go w dashboardzie; albo doprecyzować PRD. |
| **#5** | **ChapterCompletion jako agregat zapisu** | Obecnie widok SQL wystarcza, ale przy rozroście logiki (np. certyfikaty) warto rozważyć event / projection. | Pozostawić jako read-model; nie refaktoryzować w MVP. |

---

# Ograniczenia

1. Analiza bazuje na migawkach kodu z dnia 2026-07-02; pliki mogą ulec zmianie.
2. Nie uruchamiano testów w tym środowisku — wnioski o pokryciu pochodzą z zawartości plików testowych (`src/lib/verify-exercise.test.ts`, `src/lib/services/lesson-completion.test.ts`, `tests/integration/lesson-completion.spec.ts`).
3. Poddomena AI / LLM jest poza zakresem MVP (Non-Goals w PRD), więc nie została przeanalizowana.
4. Model dostępu do książek został celowo rozluźniony migracją `20260629000000_open_book_access_for_students.sql` — zakładamy, że to świadoma decyzja MVP, nie błąd.
5. Nie badano frontendowych aspektów UX (secondary success criteria) pod kątem domeny.

# Podsumowanie

BET to platforma edukacyjna, której wartość rynkowa opiera się na nieodwracalnym flow ukończenia lekcji z deterministyczną weryfikacją odpowiedzi. W wyniku destylacji wyodrębniono cztery kandydaty na agregaty / niezmienniki: ukończenie lekcji, weryfikacja odpowiedzi, ukończenie rozdziału oraz dostęp do książek. Najpoważniejsza luka model-kod dotyczy inwariantu ukończenia lekcji (FR-015): serwer już egzekwuje rozwiązanie wszystkich ćwiczeń zamkniętych, ale nie rejestruje ani nie wymaga świadomego potwierdzenia „Przeczytano", które w PRD jest niezbędnym warunkiem ukończenia. Pozostałe inwarianty są lepiej zabezpieczone — weryfikacja odpowiedzi ma dedykowany, przetestowany moduł, a ukończenie rozdziału jest poprawnie zamodelowane jako widok SQL. Dlatego refaktoryzacja #1 powinna wzmocnić serwerową bramę ukończenia lekcji o zdarzenie przeczytania i ochronę CSRF, zanim system zostanie poszerzony o kolejne typy ćwiczeń.
