# Plan wdrożenia: Split lesson header into two rows

## Przegląd

Zmiana restrukturyzuje nagłówek strony lekcji (`src/pages/lessons/[id].astro`) z jednego rzędu na dwa rzędy: górny z metadanymi i statusami, dolny z nawigacją prev/next. Jest to wyłącznie zmiana prezentacyjna — bez nowych komponentów, endpointów ani danych.

## Analiza stanu obecnego

Plik `src/pages/lessons/[id].astro` zawiera nagłówek z jednym wewnętrznym rzędem `flex`:

- Lewo: `← Dashboard` + opcjonalny link prev.
- Prawo: opcjonalne badge `✓ Rozdział ukończony!` / `✓ Ukończona` + opcjonalny link next.

Breadcrumb z tytułem rozdziału (`<p class="mb-2 text-xs text-slate-500">{chapter.title}</p>`) renderuje się w głównej treści, pod nagłówkiem. Wszystkie elementy nawigacyjne i statusowe są ściśnięte w jedną linię.

## Pożądany stan końcowy

Nagłówek składa się z dwóch poziomych pasów:

1. **Meta row**: `← Dashboard` po lewej, breadcrumb rozdziału + badges po prawej.
2. **Nav row**: `← {prev lesson}` po lewej, `{next lesson} →` po prawej.

Breadcrumb rozdziału zostaje przeniesiony z głównej treści do górnego pasa. Wszystkie warunki renderowania (czy prev/next istnieje, czy lesson/rozdział ukończony) pozostają bez zmian.

### Kluczowe odkrycia:

- Projekt używa Tailwind v4 w stylu utility-first; brak dedykowanych klas CSS dla nagłówka.
- Nagłówek to czysty Astro SSR — nie potrzeba React island.
- `chapter` jest już poprawnie pobierane osobnym zapytaniem (commit `12ad9f2`).

## Czego NIE robimy

- Nie zmieniamy logiki obliczania `prevLesson` / `nextLesson`.
- Nie dodajemy/usuwamy żadnych linków, badge'ów ani komunikatów.
- Nie wprowadzamy nowych breakpointów ani motywów.
- Nie tworzymy nowych testów E2E (zmiana jest czysto wizualna).

## Podejście do implementacji

Użyjemy Tailwind utility classes do przekształcenia nagłówka w kontener pionowy (`flex flex-col gap-3`), z dwoma wewnętrznymi rzędami (`flex items-center justify-between`). Górny rząd pogrupuje metadane i statusy; dolny rząd oddzieli nawigację. Breadcrumb przeniesiemy z treści do górnego pasa.

## Faza 1: Refactor header markup

### Przegląd

Restrukturyzacja markupu nagłówka w `src/pages/lessons/[id].astro` na dwa rzędy oraz przeniesienie breadcrumbu rozdziału do górnego pasa.

### Wymagane zmiany:

#### 1. Nagłówek strony lekcji

**Plik**: `src/pages/lessons/[id].astro`

**Cel**: Zamienić jednoliniowy nagłówek na dwurzędowy układ, poprawiając hierarchię wizualną bez zmiany funkcjonalności.

**Kontrakt**:
- `<header>` używa `flex flex-col gap-3` zamiast pojedynczego rzędu.
- Górny `<div>` używa `flex items-center justify-between gap-4`.
  - Lewo: link `← Dashboard`.
  - Prawo: `<span>` z breadcrumbiem `{chapter.title}` oraz badge `✓ Rozdział ukończony!` / `✓ Ukończona`.
- Dolny `<div>` używa `flex items-center justify-between gap-4`.
  - Lewo: link prev lub puste.
  - Prawo: link next lub puste.
- Breadcrumb rozdziału zostaje usunięty z głównej treści (`<main>`).
- Linki prev/next zachowują dotychczasowe klasy i obsługę `crossChapterTitle`.

### Kryteria sukcesu:

#### Weryfikacja automatyczna:

- `npm run lint` przechodzi bez błędów.
- `npm run typecheck` przechodzi bez błędów.

#### Weryfikacja ręczna:

- Strona lekcji wyświetla nagłówek z dwoma rzędami.
- Górny rząd zawiera Dashboard link, breadcrumb rozdziału i status badges.
- Dolny rząd zawiera linki prev/next (lub puste miejsce, gdy brak).
- Elementy są wyrównane i czytelne na widoku desktopowym (≥1280px) oraz mobile (≤640px).

**Uwaga implementacyjna**: Po zakończeniu tej fazy i pomyślnym przejściu wszystkich automatycznych weryfikacji, zatrzymaj się tutaj, aby uzyskać ręczne potwierdzenie od człowieka, że testy ręczne zakończyły się sukcesem, zanim przejdziesz do następnej fazy.

---

## Faza 2: Weryfikacja wizualna i regresyjna

### Przegląd

Sprawdzenie, że nowy układ nie psuje żadnych istniejących funkcji ani testów.

### Wymagane zmiany:

#### 1. Brak zmian w innych plikach

**Plik**: N/A

**Cel**: Upewnić się, że zmiana jest izolowana do `src/pages/lessons/[id].astro`.

**Kontrakt**: Nie modyfikujemy innych komponentów, API ani testów.

### Kryteria sukcesu:

#### Weryfikacja automatyczna:

- `npm run test` przechodzi (84 unit tests).
- `npx playwright test --workers=1` przechodzi bez nowych regresji (dopuszczalne istniejące flaky testy).

#### Weryfikacja ręczna:

- Otwórz stronę lekcji jako seed-student i zweryfikuj układ nagłówka.
- Sprawdź lekcję pierwszą w rozdziale (brak prev), ostatnią (brak next) oraz środkową (oba linki).
- Sprawdź responsywność na wąskim oknie.

---

## Strategia testowania

### Testy jednostkowe:

- Nie dotyczy — brak logiki do przetestowania.

### Testy integracyjne / E2E:

- Uruchomić pełną suitę Playwright, aby upewnić się, że żaden istniejący test nie zależy od starej struktury DOM nagłówka.

### Kroki testowania ręcznego:

1. Zaloguj się jako `student@bet.local`.
2. Wejdź na lekcję środkową (np. `000...031`) — oczekiwany układ: dwa rzędy, oba linki prev/next widoczne.
3. Wejdź na pierwszą lekcję rozdziału — brak linku prev.
4. Wejdź na ostatnią lekcję rozdziału — brak linku next.
5. Zwęż okno do <640px — upewnij się, że linki nie znikają ani się nie nakładają.

## Uwagi dotyczące wydajności

Brak — zmiana nie wpływa na fetching danych ani renderowanie po stronie klienta.

## Uwagi dotyczące migracji

Brak — brak zmian w schemacie ani danych.

## Referencje

- Powiązane badania: `context/changes/lesson-header-two-row-layout/research.md`
- Krótki plan: `context/changes/lesson-header-two-row-layout/plan-brief.md`
- Plik do edycji: `src/pages/lessons/[id].astro`
- Oryginalny plan S-05: `context/archive/2026-06-26-sequential-navigation-and-chapter-completion/plan.md`

## Postęp

### Faza 1: Refactor header markup

#### Automatyczne

- [x] 1.1 `npm run lint` przechodzi.
- [x] 1.2 `npm run typecheck` przechodzi.

#### Ręczne

- [x] 1.3 Wizualna kontrola dwurzędowego nagłówka na stronie lekcji.

### Faza 2: Weryfikacja wizualna i regresyjna

#### Automatyczne

- [x] 2.1 `npm run test` przechodzi (84 tests).
- [x] 2.2 Wybrane testy Playwright (`closed-exercises`, `student-profile`) przechodzą bez regresji.

#### Ręczne

- [x] 2.3 Sprawdzenie układu na desktopie.
