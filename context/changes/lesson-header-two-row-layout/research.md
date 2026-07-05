---
date: "2026-07-05T22:45:00+02:00"
researcher: AI Coding Assistant
git_commit: 12ad9f2
branch: dev
repository: BET
topic: "Split lesson page header into two rows using Tailwind CSS"
tags: [research, ui, tailwind, layout, lesson-page]
status: complete
last_updated: "2026-07-05"
last_updated_by: AI Coding Assistant
---

# Badanie: Rozbicie nagłówka lekcji na dwa pasy

**Data**: 2026-07-05  
**Badacz**: AI Coding Assistant  
**Git Commit**: `12ad9f2`  
**Gałąź**: `dev`  
**Repozytorium**: BET

## Pytanie badawcze

Jak najlepiej przekształcić obecny jednoliniowy nagłówek strony lekcji na układ dwurzędowy, zachowując wszystkie istniejące elementy i stosując się do konwencji projektu (Tailwind CSS, Astro, mobile-first)?

## Podsumowanie

Nagłówek strony lekcji (`src/pages/lessons/[id].astro`) obecnie renderuje Dashboard link, status badges, prev/next navigation oraz breadcrumb w jednym rzędzie flex. Aby poprawić czytelność, zaproponowano podział na **dwa poziome pasy**:

1. **Górny pas**: nawigacja powrotu do Dashboardu (lewa strona), breadcrumb rozdziału oraz status badges (prawa strona).
2. **Dolny pas**: nawigacja prev/next między lekcjami — poprzednia lekcja po lewej, następna po prawej.

Układ można osiągnąć czysto za pomocą Tailwind utility classes (`flex flex-col` + dwie wewnętrzne `flex` rows), bez nowych komponentów React, bez zmian w modelu danych i bez nowych API.

## Szczegółowe ustalenia

### Stan obecny kodu

Plik: `src/pages/lessons/[id].astro`

- Nagłówek to jeden `<header>` z wewnętrznym `div` używającym `flex items-center justify-between gap-4`.
- Lewa strona zawiera: Dashboard link oraz opcjonalny link prev.
- Prawa strona zawiera: badge „Rozdział ukończony!”, badge „Ukończona” oraz opcjonalny link next.
- Poniżej nagłówka znajduje się breadcrumb z tytułem rozdziału (`<p class="mb-2 text-xs text-slate-500">{chapter.title}</p>`).

Fragment aktualnego markupu nagłówka (po ostatniej poprawce `12ad9f2`):

```astro
<header class="border-b border-white/10 bg-white/5 px-6 py-4">
  <div class="mx-auto flex max-w-3xl items-center justify-between gap-4">
    <!-- Left: back + prev -->
    <div class="flex items-center gap-4 text-sm text-slate-400">...</div>
    <!-- Right: badges + next -->
    <div class="flex items-center gap-3 text-sm">...</div>
  </div>
</header>
```

### Problem UX

Wszystkie elementy (link Dashboard, link prev, badges, link next) są wymuszone w jednym rzędzie. Przy dłuższych tytułach lekcji lub rozdziałów linki prev/next mogą być przycięte lub zlewać się z badge'ami. Dodatkowo breadcrumb rozdziału znajduje się pod nagłówkiem, poza główną nawigacją, co rozprasza hierarchię informacji.

### Rekomendowany układ

- **Górny pas (meta + status)**:
  - Lewo: `← Dashboard`
  - Prawo: breadcrumb `{chapter.title}` + badges `✓ Rozdział ukończony!` / `✓ Ukończona`
- **Dolny pas (nawigacja lekcji)**:
  - Lewo: `← {poprzednia lekcja}` (lub puste, gdy brak)
  - Prawo: `{następna lekcja} →` (lub puste, gdy brak)

### Decyzje techniczne

- **Technologia**: czysty Astro + Tailwind CSS (projekt nie używa React islands dla nawigacji).
- **Kontener**: `header` z `flex flex-col gap-3` zamiast pojedynczego rzędu.
- **Dwa wewnętrzne rzędy**: każdy używa `flex items-center justify-between`.
- **Breadcrumb**: przeniesiony z głównej treści do górnego pasa, aby stworzyć spójną linię meta-informacji.
- **Responsywność**: na bardzo wąskich ekranach linki prev/next mogą zawijać się w pionie (`flex-wrap` lub `flex-col` dla dolnego pasa na `sm` i mniejszych), ale domyślnie pozostają w jednej linii.
- **Brak zmian funkcjonalnych**: nie dodajemy/usuwamy żadnych linków, badge'ów ani warunków renderowania — tylko zmieniamy układ.

### Odniesienia do kodu

- `src/pages/lessons/[id].astro:27-120` — obszar nagłówka do refaktoryzacji.
- `src/pages/lessons/[id].astro:122-125` — breadcrumb rozdziału do przeniesienia do nagłówka.

## Wnioski architektoniczne

- Projekt używa Tailwind v4 w trybie utility-first; wszystkie style strony lekcji znajdują się bezpośrednio w komponencie `.astro`.
- Nagłówek nie używa React island, więc zmiana jest czysto strukturalna (Astro template).
- Brak potrzeby zmiany testów funkcjonalnych; wystarczy wizualna weryfikacja i upewnienie się, że lint/typecheck przechodzą.

## Kontekst historyczny

- `context/archive/2026-06-26-sequential-navigation-and-chapter-completion/plan.md` — oryginalny plan S-05, który dodał prev/next navigation i badge rozdziału do strony lekcji.
- `context/archive/2026-06-26-sequential-navigation-and-chapter-completion/research.md` — badanie S-05; zalecało użycie pure Astro SSR dla nawigacji.
- Commit `12ad9f2` — ostatnia poprawka przywracająca dane rozdziału (osobne zapytanie do `chapters`).

## Otwarte pytania

- Brak — zakres jest czysto prezentacyjny i jednoznaczny.
