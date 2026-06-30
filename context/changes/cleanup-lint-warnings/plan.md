# Plan wdrożenia: Clean up remaining ESLint warnings

## Przegląd

Wyczyścić pozostałe 31 ostrzeżeń ESLint, które pozostały po naprawie głównych
błędów lint i normalizacji końców linii. Celem jest uzyskanie czystego
`npm run lint` (bez ostrzeżeń), który można potraktować jako bramkę CI.

## Analiza stanu obecnego

Po zmianie `df48440` `npm run lint` kończy się kodem `0`, ale zgłasza 31
ostrzeżeń w trzech grupach:

1. **`no-console` (15 wystąpień w 7 plikach)**
   - `scripts/seed-students.ts:21-60` — logi postępu i błędów CLI.
   - `src/lib/services/user-admin.ts:66,101,106` — `console.error` przed
     rzuceniem wyjątku.
   - `src/pages/api/admin/users.ts:42`,
     `src/pages/api/admin/users/[id]/grant.ts:84`,
     `src/pages/api/admin/users/[id]/revoke.ts:77` — `console.error` w
     catch-all / po błędzie bazy.
   - `tests/e2e/closed-exercises.spec.ts:15`,
     `tests/e2e/sentence-transformation-and-open-ended.spec.ts:15` —
     `console.warn` w cleanup `afterEach`.
   - W repo nie ma obecnie żadnego loggera ani biblioteki do logowania.

2. **`astro/no-unused-css-selector` (14 selektorów w `src/pages/lessons/[id].astro:286-339`)**
   - Selektory `.lesson-content h1/h2/h3/p/strong/em/ul/ol/li/code/pre/blockquote`
     są używane przez Markdown renderowany dynamicznie przez
     `set:html={contentHtml}` (`src/pages/lessons/[id].astro:265`).
   - Linter Astro nie widzi HTML wstrzykiwanego w runtime, więc traktuje je
     jako martwe.
   - Dodatkowo style Astro są scope'owane, więc bez `:global()` nie
     trafiają do wstrzykniętych elementów.

3. **`react-hooks/incompatible-library` (1 wystąpienie w `src/components/admin/UsersTable.tsx:311`)**
   - `useReactTable` z `@tanstack/react-table` jest na liście bibliotek
     niekompatybilnych z React Compiler.
   - Komponent używa ręcznej memoizacji `visibleRows` i `columns`, a
     zachowanie jest pokryte przez `tests/e2e/admin-users.spec.ts`.

## Pożądany stan końcowy

- `npm run lint` zwraca `0` i **nie zgłasza żadnych ostrzeżeń**.
- Błędy serwerowe są kierowane przez dedykowany helper `logServerError` w
  `src/lib/logger.ts`.
- Skrypty CLI i testy E2E mogą używać `console.*` bez warningów (reguła
  `no-console` wyłączona dla `scripts/` i `tests/e2e/`).
- Style `.lesson-content` faktycznie działają dla renderowanego Markdownu
  dzięki `:global()`.
- Ostrzeżenie React Compiler w `UsersTable.tsx` jest wyciszone lokalnym
  komentarzem z uzasadnieniem.

## Czego NIE robimy

- Nie tworzymy pełnego frameworku logowania (Sentry, structured logging).
- Nie refaktoryzujemy `UsersTable.tsx`, by nie używać `useReactTable`.
- Nie zmieniamy semantyki logów (pozostają jako diagnostics, nie produkcyjne
  telemetry).
- Nie dotykamy warningów, które nie są na liście powyżej (np. ewentualnych
  nowych w przyszłości).

## Podejście do implementacji

- Wprowadzić minimalny logger serwerowy, aby nadać kontrakt dla błędów
  produkcyjnych bez zależności zewnętrznych.
- Rozluźnić `no-console` tylko tam, gdzie `console.*` jest uzasadniony
  (skrypty CLI, teardown E2E).
- Użyć `:global()` w Astro, by style scope'owane poprawnie objęły dynamiczny
  Markdown.
- Wyciszyć znane upstreamowe ostrzeżenie React Compiler komentarzem, nie
  kodem.

## Faza 1: Logger serwerowy i konfiguracja `no-console`

### Przegląd

Tworzy minimalny helper do logowania błędów serwerowych oraz relaksuje
`no-console` dla plików CLI/testowych.

### Wymagane zmiany:

#### 1.1 Nowy moduł `src/lib/logger.ts`

**Plik**: `src/lib/logger.ts`

**Cel**: Dać typowany punkt wejścia dla logowania błędów po stronie serwera.

**Kontrakt**:
- Eksportuj `logServerError(message: string, error?: unknown): void`.
- Wewnętrznie używaj `console.error` (brak zewnętrznych loggerów), ale kod
  konsumentów nie powinien bezpośrednio importować `console`.
- Parametr `error` typu `unknown`, aby uniknąć wymuszanych castów w miejscach
  wywołania.

#### 1.2 Zastąpienie `console.error` w serwerowej logice

**Pliki**:
- `src/lib/services/user-admin.ts:66,101,106`
- `src/pages/api/admin/users.ts:42`
- `src/pages/api/admin/users/[id]/grant.ts:84`
- `src/pages/api/admin/users/[id]/revoke.ts:77`

**Cel**: Kierować błędy przez `logServerError` zamiast bezpośrednio przez
`console.error`.

**Kontrakt**: Zachowaj obecny format komunikatu i kontekst błędu; zmień tylko
funkcję wywołania.

#### 1.3 Relaksacja `no-console` dla skryptów i testów E2E

**Plik**: `eslint.config.js`

**Cel**: Nie karć `console.*` w plikach, które z natury wypisują diagnostykę.

**Kontrakt**: Dodaj obiekt konfiguracji po `baseConfig`:

```js
{
  files: ["scripts/**/*.ts", "tests/e2e/**/*.ts"],
  rules: { "no-console": "off" },
}
```

### Kryteria sukcesu:

#### Weryfikacja automatyczna:

- `npm run lint` nie zgłasza już `no-console` w `src/`, `scripts/`,
  `tests/e2e/`.
- `npm run typecheck` przechodzi.

#### Weryfikacja ręczna:

- Przegląd API `src/lib/logger.ts` — czy kontrakt jest wystarczający do
  późniejszego podpięcia prawdziwego loggera.

---

## Faza 2: Style lesson-content i wyciszenie React Compiler

### Przegląd

Naprawia scope'owanie CSS dla dynamicznego Markdownu i wycisza znane
upstreamowe ostrzeżenie React Compiler.

### Wymagane zmiany:

#### 2.1 `:global()` dla selektorów Markdownu

**Plik**: `src/pages/lessons/[id].astro`

**Cel**: Sprawić, by style `.lesson-content *` trafiały do wstrzykiwanych
elementów HTML, jednocześnie usuwając fałszywe ostrzeżenia lintera.

**Kontrakt**: Zamień każdy selektor potomka na formę
`.lesson-content :global(tag)`. Klasa `.lesson-content` sama pozostaje
scope'owana; tylko tagi wewnątrz `set:html` są globalne.

#### 2.2 Wyciszenie ostrzeżenia React Compiler

**Plik**: `src/components/admin/UsersTable.tsx`

**Cel**: Uzyskać czysty `npm run lint` bez refaktoryzacji komponentu.

**Kontrakt**: Dodaj przed wywołaniem `useReactTable` komentarz:

```ts
// eslint-disable-next-line react-hooks/incompatible-library -- useReactTable is on React's known incompatible-library list; component is covered by E2E tests
```

### Kryteria sukcesu:

#### Weryfikacja automatyczna:

- `npm run lint` nie zgłasza `astro/no-unused-css-selector` ani
  `react-hooks/incompatible-library`.
- `npm run typecheck` przechodzi.

#### Weryfikacja ręczna:

- Wizualna kontrola wyrenderowanej lekcji — nagłówki, listy, pogrubienia,
  kod i cytaty zachowują style.

---

## Faza 3: Pełna regresja

### Przegląd

Potwierdzić, że żadna ze zmian nie wprowadziła regresji.

### Wymagane zmiany:

Brak nowego kodu. Uruchomić pełną bramkę jako dowód zamknięcia zmiany.

### Kryteria sukcesu:

#### Weryfikacja automatyczna:

- `npm run lint` — 0 błędów, 0 ostrzeżeń.
- `npm run typecheck` — 0 błędów.
- `npm run test:unit` — wszystkie testy przechodzą.
- `npm run test:coverage` — `verify-exercise.ts` pozostaje na 100%.
- `npx playwright test admin-users closed-exercises sentence-transformation` —
  wszystkie specy przechodzą.

#### Weryfikacja ręczna:

- Przegląd diffu: żadnych niezamierzonych zmian poza warningami.

## Strategia testowania

### Testy automatyczne:

- `npm run lint` jako główna asercja zmiany.
- `npm run typecheck` dla bezpieczeństwa typów po wprowadzeniu `logger.ts`.
- `npm run test:unit` i `npm run test:coverage` dla regresji logiki
  weryfikacji.
- Wybrane testy Playwright (`admin-users`, `closed-exercises`,
  `sentence-transformation`) dla regresji UI i API.

### Testy ręczne:

- Weryfikacja stylu wyrenderowanej treści lekcji (nagłówki, listy, kod,
  cytaty).

## Uwagi dotyczące wydajności

Brak. Zmiana nie wprowadza nowych zależności ani kosztownej logiki w runtime.

## Uwagi dotyczące migracji

Brak. Nie dotyczy danych ani schematu.

## Referencje

- Folder zmiany: `context/changes/cleanup-lint-warnings/change.md`
- Poprzednia naprawa lint/CRLF:
  `context/changes/testing-unit-contract-runner/plan.md`
- Lekcja o LF i higienie lint:
  `context/foundation/lessons.md`

## Postęp

### Faza 1: Logger serwerowy i konfiguracja `no-console`

#### Automatyczne

- [ ] 1.1 Utworzyć `src/lib/logger.ts` z `logServerError`
- [ ] 1.2 Zamienić `console.error` na `logServerError` w serwerowych plikach
- [ ] 1.3 Dodać wyjątek `no-console: off` dla `scripts/` i `tests/e2e/` w ESLint

#### Ręczne

- [ ] 1.4 Przegląd API loggera

### Faza 2: Style lesson-content i wyciszenie React Compiler

#### Automatyczne

- [ ] 2.1 Dodać `:global()` do selektorów `.lesson-content` w `src/pages/lessons/[id].astro`
- [ ] 2.2 Dodać `eslint-disable-next-line react-hooks/incompatible-library` w `UsersTable.tsx`

#### Ręczne

- [ ] 2.3 Wizualna weryfikacja stylów lekcji

### Faza 3: Pełna regresja

#### Automatyczne

- [ ] 3.1 `npm run lint` — 0 errors, 0 warnings
- [ ] 3.2 `npm run typecheck`
- [ ] 3.3 `npm run test:unit` i `npm run test:coverage`
- [ ] 3.4 E2E: `admin-users`, `closed-exercises`, `sentence-transformation`

#### Ręczne

- [ ] 3.5 Przegląd diffu pod kątem niezamierzonych zmian
