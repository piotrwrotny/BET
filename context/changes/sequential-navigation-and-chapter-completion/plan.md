# Plan wdrożenia S-05: Nawigacja sekwencyjna i ukończenie rozdziału

## Przegląd

Implementacja S-05 dodaje nawigację prev/next między lekcjami na stronie lekcji, badge ukończenia rozdziału oraz listę rozdziałów z progressem na dashboardzie. Wszystkie zmiany są server-side SSR — zero nowych React islands, zero nowych API endpoints, zero zmian schematu DB.

## Analiza stanu obecnego

**Już gotowe (nie ruszamy):**
- `src/pages/dashboard.astro:92-111` — "Kontynuuj naukę" → pierwsza nieukończona lekcja ✓
- `src/pages/dashboard.astro:106-108` — "✓ Gratulacje, książka ukończona!" ✓
- `supabase/migrations/…:219-238` — VIEW `public.chapter_progress` (FR-016 aggregate) ✓

**Brakuje:**
- Strona lekcji: brak danych o sąsiednich lekcjach; `chapters(id, title, book_id)` nie zawiera `ord`
- Strona lekcji: brak badge ukończenia rozdziału
- Dashboard: brak per-chapter progress breakdown (tylko poziom książki)

**Kluczowe odkrycia:**
- `lessons.UNIQUE(chapter_id, ord)` — implicit B-tree index wspiera `WHERE chapter_id = X ORDER BY ord`
- `chapters.UNIQUE(book_id, ord)` — analogicznie dla cross-chapter navigation
- `chapter_progress` view: SECURITY INVOKER → RLS na `user_book_access` i `lesson_progress` filtruje do bieżącego usera
- Lesson URL pozostaje `/lessons/[id]` UUID-based — brak zmian routingu
- Strona lekcji używa własnego inline `<header>`, nie komponentu `Topbar.astro`

## Pożądany stan końcowy

Po wdrożeniu:
1. Student widzi przyciski `← {tytuł poprzedniej lekcji}` / `{tytuł następnej lekcji} →` w nagłówku strony lekcji. Na granicy rozdziału przycisk "następna" mówi `{tytuł rozdziału} →`. Na pierwszej/ostatniej lekcji książki odpowiedni przycisk jest niewidoczny.
2. Nagłówek strony lekcji pokazuje badge `✓ Rozdział ukończony!` gdy `chapter_progress.completed_at IS NOT NULL`.
3. Dashboard pod każdą książką wyświetla listę rozdziałów z licznikiem `x/y lekcji` i badge ukończenia gdy rozdział gotowy.
4. `tsc --noEmit` i `npm run build` przechodzą.

## Czego NIE robimy

- Nie dodajemy `last_accessed_at` ani `current_book_id` do schematu DB
- Nie budujemy React island dla nawigacji — pure Astro SSR HTML
- Nie zmieniamy routingu URL lekcji
- Nie implementujemy per-lekcja detail listy na dashboardzie (tylko licznik x/y na rozdział)
- Nie dodajemy animacji ani progress bars — minimal UI
- Nie implementujemy S-06/S-07 (fill_in_blank, true_false interactive) — to oddzielne zmiany
- Nie ruszamy komponentu `Topbar.astro`

## Podejście do implementacji

**Faza 1** — rozszerzenie query lekcji o `chapters.ord`, nowe query dla siblings w rozdziale, warunkowe queries cross-chapter na granicach, renderowanie nav buttons + chapter badge w SSR.

**Faza 2** — nowe query `chapter_progress` na dashboardzie, renderowanie listy rozdziałów.

Obie fazy są czysto Astro SSR — brak zmian do komponentów React, brak nowych API endpoints. Przycisk prev/next to zwykły `<a href>` link. Dane przepływają jednostronnie: DB → Astro frontmatter → HTML.

## Krytyczne szczegóły implementacji

**Cross-chapter query RLS:** Query o sąsiedni rozdział (`chapters` + `lessons`) przejdzie przez te same polityki RLS co obecne query. `chapters_select: has_book_access(book_id)` i `lessons_select: has_lesson_access(id)`. Student widzi tylko lekcje z książek, do których ma dostęp — gwarancja z istniejącego schematu.

**`chapter_progress` GRANT:** View jest SECURITY INVOKER, brak jawnego `GRANT` w migracji. Supabase domyślnie nadaje `authenticated` SELECT na `public.*`. Jeśli zapytanie zwróci błąd 403, konieczne będzie dodanie `GRANT SELECT ON public.chapter_progress TO authenticated;` w nowej migracji (blokada fazy).

**Warunkowe cross-chapter queries:** Queries o sąsiedni rozdział uruchamiamy TYLKO gdy bieżąca lekcja jest na granicy (pierwsze/ostatnie `ord` w rozdziale). Nie wykonujemy ich zawsze — oszczędza round-tripy dla lekcji środkowych.

---

## Faza 1: Strona lekcji — nawigacja prev/next + badge rozdziału

### Przegląd

Rozszerzyć `src/pages/lessons/[id].astro` o dane nawigacyjne i badge ukończenia rozdziału. Wszystkie zmiany w frontmatter Astro — zero zmian do komponentów React.

### Wymagane zmiany

#### 1. Rozszerzenie query lekcji o `chapters.ord`

**Plik:** `src/pages/lessons/[id].astro:19-29`

**Cel:** Bieżące query pobiera `chapters(id, title, book_id)` bez `ord`. `ord` rozdziału jest konieczne do cross-chapter navigation queries.

**Kontrakt:** W nested select zmienić `chapters ( id, title, book_id )` na `chapters ( id, title, book_id, ord )`. Cast w linii 81 rozszerzyć o pole `ord: number`.

#### 2. Nowe query — sibling lessons w rozdziale

**Plik:** `src/pages/lessons/[id].astro` (po pobraniu lekcji i chapter cast, przed `closedExerciseCount`)

**Cel:** Pobrać wszystkie lekcje w bieżącym rozdziale, aby wyznaczyć `prevLesson` i `nextLesson` w obrębie rozdziału.

**Kontrakt:**
```ts
const { data: siblings } = await supabase
  .from("lessons")
  .select("id, title, ord")
  .eq("chapter_id", chapter!.id)
  .order("ord", { ascending: true });

const sibs = siblings ?? [];
const currentIdx = sibs.findIndex((s) => s.id === lesson.id);
```

#### 3. Compute prevLesson / nextLesson z warunkowym cross-chapter

**Plik:** `src/pages/lessons/[id].astro` (bezpośrednio po query siblings)

**Cel:** Wyznaczyć `prevLesson` i `nextLesson` — w obrębie rozdziału lub z sąsiedniego rozdziału na granicy.

**Kontrakt:**

```ts
type NavLesson = { id: string; title: string; crossChapterTitle?: string } | null;

let prevLesson: NavLesson = currentIdx > 0
  ? { id: sibs[currentIdx - 1].id, title: sibs[currentIdx - 1].title }
  : null;

let nextLesson: NavLesson = currentIdx < sibs.length - 1
  ? { id: sibs[currentIdx + 1].id, title: sibs[currentIdx + 1].title }
  : null;

// Cross-chapter: only query when at boundary
if (!prevLesson && chapter) {
  const { data: prevCh } = await supabase
    .from("chapters")
    .select("id, title, lessons(id, title, ord)")
    .eq("book_id", chapter.book_id)
    .lt("ord", chapter.ord)
    .order("ord", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (prevCh) {
    const sorted = ((prevCh.lessons ?? []) as { id: string; title: string; ord: number }[])
      .sort((a, b) => b.ord - a.ord);
    if (sorted[0]) prevLesson = { id: sorted[0].id, title: sorted[0].title, crossChapterTitle: prevCh.title };
  }
}

if (!nextLesson && chapter) {
  const { data: nextCh } = await supabase
    .from("chapters")
    .select("id, title, lessons(id, title, ord)")
    .eq("book_id", chapter.book_id)
    .gt("ord", chapter.ord)
    .order("ord", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (nextCh) {
    const sorted = ((nextCh.lessons ?? []) as { id: string; title: string; ord: number }[])
      .sort((a, b) => a.ord - b.ord);
    if (sorted[0]) nextLesson = { id: sorted[0].id, title: sorted[0].title, crossChapterTitle: nextCh.title };
  }
}
```

#### 4. Query `chapter_progress` dla badge ukończenia

**Plik:** `src/pages/lessons/[id].astro` (po obliczeniu nav, przed chapter cast na breadcrumb)

**Cel:** Pobrać stan ukończenia bieżącego rozdziału, aby pokazać badge "✓ Rozdział ukończony!" gdy wszystkie lekcje rozdziału done.

**Kontrakt:**
```ts
const { data: chapterProgress } = chapter
  ? await supabase
      .from("chapter_progress")
      .select("lessons_total, lessons_completed, completed_at")
      .eq("chapter_id", chapter.id)
      .maybeSingle()
  : { data: null };

const isChapterCompleted = !!(chapterProgress?.completed_at);
```

#### 5. Nav buttons i chapter badge w szablonie HTML

**Plik:** `src/pages/lessons/[id].astro` — inline `<header>` (linie 87-100)

**Cel:** Dodać przyciski prev/next do istniejącego nagłówka, pokazać badge rozdziału obok istniejącego badge lekcji.

**Kontrakt:** Aktualny header (linie 87-100) zawiera `← Dashboard` link po lewej i opcjonalny badge `✓ Ukończona` po prawej. Rozszerzyć:

- Lewa strona: zamiast statycznego `← Dashboard` link — trzy elementy inline:
  - `← Dashboard` (zawsze)
  - separator (opcjonalnie)
  - `← {prevLesson.title}` (jeśli `prevLesson != null`; gdy `crossChapterTitle` — poprzedź małym labelem rozdziału)
- Prawa strona: istniejący badge lekcji + nowy badge rozdziału (gdy `isChapterCompleted`) + `{nextLesson.title} →` link (jeśli `nextLesson != null`; gdy `crossChapterTitle` — label to `{crossChapterTitle} →`)

Zalecana struktura nagłówka (inline `<header>`):
```astro
<header class="border-b border-white/10 bg-white/5 px-6 py-4">
  <div class="mx-auto flex max-w-3xl items-center justify-between gap-4">
    <!-- Left: back + prev -->
    <div class="flex items-center gap-4 text-sm text-slate-400">
      <a href="/dashboard" class="hover:text-white">← Dashboard</a>
      {prevLesson && (
        <a href={`/lessons/${prevLesson.id}`} class="hover:text-white">
          {prevLesson.crossChapterTitle
            ? <>← <span class="text-slate-500">{prevLesson.crossChapterTitle}:</span> {prevLesson.title}</>
            : <>← {prevLesson.title}</>
          }
        </a>
      )}
    </div>
    <!-- Right: badges + next -->
    <div class="flex items-center gap-3 text-sm">
      {isChapterCompleted && (
        <span class="rounded-full bg-blue-500/20 px-3 py-1 text-xs font-medium text-blue-400">
          ✓ Rozdział ukończony!
        </span>
      )}
      {isAlreadyCompleted && (
        <span class="rounded-full bg-emerald-500/20 px-3 py-1 text-xs font-medium text-emerald-400">
          ✓ Ukończona
        </span>
      )}
      {nextLesson && (
        <a href={`/lessons/${nextLesson.id}`} class="text-slate-400 hover:text-white">
          {nextLesson.crossChapterTitle
            ? <>{nextLesson.crossChapterTitle} →</>
            : <>{nextLesson.title} →</>
          }
        </a>
      )}
    </div>
  </div>
</header>
```

### Kryteria sukcesu

#### Weryfikacja automatyczna

- `npx tsc --noEmit` przechodzi bez błędów
- `npm run build` kończy się bez błędów

#### Weryfikacja ręczna

- Lekcja środkowa (`...0031` — Time Expressions): nagłówek pokazuje `← Past Simple vs Present Perfect` po lewej i `Reading: Common Tense Mistakes →` po prawej
- Lekcja pierwsza w rozdziale (`...0030`): brak przycisku ← (lub ← Dashboard tylko)
- Ostatnia lekcja rozdziału 1 (`...0032` — Reading): `Chapter 2: Sentence Transformations →` po prawej
- Pierwsza lekcja rozdziału 2 (`...0033`): po lewej label wskazujący na ostatnią lekcję rozdziału 1 (`...0032`)
- Ostatnia lekcja książki (`...0034`): brak przycisku → po prawej
- Klikniecie prev/next przenosi do właściwej lekcji
- Na ukończonej lekcji gdzie cały rozdział ukończony: badge `✓ Rozdział ukończony!` widoczny w nagłówku

---

## Faza 2: Dashboard — lista rozdziałów z progress

### Przegląd

Rozszerzyć `src/pages/dashboard.astro` o query `chapter_progress` i wyświetlanie per-chapter progress (licznik x/y + badge ukończenia) pod każdą kartą książki.

### Wymagane zmiany

#### 1. Nowe query `chapter_progress`

**Plik:** `src/pages/dashboard.astro` (po istniejących trzech queries, wewnątrz bloku `if (supabase)`)

**Cel:** Pobrać liczniki lekcji i timestamp ukończenia dla wszystkich rozdziałów, do których student ma dostęp.

**Kontrakt:**
```ts
type ChapterProgressRow = {
  chapter_id: string;
  lessons_total: number;
  lessons_completed: number;
  completed_at: string | null;
};

let chapterProgressRows: ChapterProgressRow[] = [];
if (supabase) {
  // ... existing queries ...
  const { data: cpData } = await supabase
    .from("chapter_progress")
    .select("chapter_id, lessons_total, lessons_completed, completed_at");
  chapterProgressRows = (cpData ?? []) as ChapterProgressRow[];
}

// Build lookup map: chapter_id → progress
const chapterProgressMap = Object.fromEntries(
  chapterProgressRows.map((cp) => [cp.chapter_id, cp])
);
```

#### 2. Rozszerzenie query rozdziałów o `title`

**Plik:** `src/pages/dashboard.astro:29-32`

**Cel:** Bieżące query pobiera `chapters(id, book_id, ord, lessons(id, ord))` bez tytułu rozdziału. Tytuł potrzebny do wyświetlenia listy.

**Kontrakt:** Zmienić `.select("id, book_id, ord, lessons(id, ord)")` na `.select("id, book_id, ord, title, lessons(id, ord)")`. Zaktualizować typ `ChapterRow` o pole `title: string`.

#### 3. Renderowanie listy rozdziałów w karcie książki

**Plik:** `src/pages/dashboard.astro:92-111` — karta książki w szablonie

**Cel:** Pod istniejącym tytułem i opisem książki, przed przyciskiem "Kontynuuj naukę", wyświetlić listę rozdziałów z licznikiem `x/y lekcji` i badge ukończenia.

**Kontrakt:** Dla każdego rozdziału z `bookChapters` (sortowane po `ord`) wyświetlić:
- Tytuł rozdziału
- `{lessons_completed}/{lessons_total} lekcji` (z `chapterProgressMap[chapter.id]`)
- Badge `✓` gdy `chapterProgressMap[chapter.id]?.completed_at != null`

Przykładowa struktura:
```astro
<!-- Chapter list -->
{bookChapters.length > 0 && (
  <ul class="mb-4 space-y-1">
    {bookChapters.map((chapter) => {
      const cp = chapterProgressMap[chapter.id];
      const isChDone = !!(cp?.completed_at);
      return (
        <li class="flex items-center justify-between text-sm text-slate-400">
          <span>{chapter.title}</span>
          <span class="flex items-center gap-2">
            <span>{cp ? `${cp.lessons_completed}/${cp.lessons_total} lekcji` : ''}</span>
            {isChDone && (
              <span class="text-emerald-400">✓</span>
            )}
          </span>
        </li>
      );
    })}
  </ul>
)}
```

### Kryteria sukcesu

#### Weryfikacja automatyczna

- `npx tsc --noEmit` przechodzi bez błędów
- `npm run build` kończy się bez błędów

#### Weryfikacja ręczna

- Dashboard pokazuje listę rozdziałów pod tytułem książki
- Każdy rozdział pokazuje `x/y lekcji` — wartości zgodne z aktualnym `lesson_progress` usera
- Ukończony rozdział pokazuje `✓` obok licznika
- `bookChapters` w szablonie korzysta z poprawnie przefiltrowanej + posortowanej listy (identycznie jak dla `firstUnfinishedId` — ta sama zmienna)
- Przycisk "Kontynuuj naukę" nadal kieruje do poprawnej lekcji
- "✓ Gratulacje, książka ukończona!" nadal pokazuje się gdy wszystkie lekcje done

---

## Strategia testowania

### Weryfikacja automatyczna (po każdej fazie)

- `npx tsc --noEmit` — sprawdzenie typów
- `npm run build` — pełny build Astro + Cloudflare

### Testy ręczne — przypadki brzegowe

1. **Lekcja bez poprzedniej**: `...0030` (pierwsza lekcja rozdziału 1, pierwsza książki) — brak `← prev` przycisku
2. **Lekcja bez następnej**: `...0034` (ostatnia lekcja rozdziału 2, ostatnia książki) — brak `→ next` przycisku
3. **Granica rozdziału next**: `...0032` → przycisk `→` mówi `Rozdział 2: Sentence Transformations →`
4. **Granica rozdziału prev**: `...0033` → przycisk `←` mówi `← Chapter 1: ... : Reading: Common Tense Mistakes`
5. **Badge rozdziału**: po ukończeniu wszystkich lekcji rozdziału 1 — badge "✓ Rozdział ukończony!" pojawia się na każdej lekcji tego rozdziału
6. **Dashboard chapter list**: liczniki poprawne, badge ✓ na ukończonych rozdziałach
7. **`chapter_progress` GRANT**: jeśli query zwraca błąd 403 — dodać migrację `GRANT SELECT ON public.chapter_progress TO authenticated;`

---

## Uwagi dotyczące migracji

Brak zmian schematu DB. `chapter_progress` view istnieje od F-01. Jeśli pojawi się błąd 403 przy query `chapter_progress`, konieczna będzie nowa migracja z GRANT — nie wymaga `db reset`, tylko `supabase db push`.

## Referencje

- Badania: `context/changes/sequential-navigation-and-chapter-completion/research.md`
- Dashboard query (istniejące): `src/pages/dashboard.astro:29-32`
- Lesson page query (istniejące): `src/pages/lessons/[id].astro:19-29`
- Inline header lekcji: `src/pages/lessons/[id].astro:87-100`
- View chapter_progress: `supabase/migrations/20260625184555_init.sql:219-238`

---

## Postęp

> Konwencja: `- [ ]` oczekujące, `- [x]` wykonane. Dodaj ` — <commit sha>`, gdy krok zostanie zrealizowany.

### Faza 1: Strona lekcji — nawigacja prev/next + badge rozdziału

#### Automatyczne

- [x] 1.1 `npx tsc --noEmit` przechodzi
- [x] 1.2 `npm run build` przechodzi

#### Ręczne

- [x] 1.3 Lekcja środkowa (`...0031`): prev wskazuje na `...0030`, next na `...0032`
- [x] 1.4 Pierwsza lekcja rozdziału 1 (`...0030`): brak przycisku ← (tylko `← Dashboard`)
- [x] 1.5 Ostatnia lekcja rozdziału 1 (`...0032`): next wskazuje `Rozdział 2: Sentence Transformations →`
- [x] 1.6 Pierwsza lekcja rozdziału 2 (`...0033`): prev wskazuje ostatnią lekcję rozdziału 1 (`...0032`)
- [x] 1.7 Ostatnia lekcja książki (`...0034`): brak przycisku →
- [x] 1.8 Kliknięcie prev/next przenosi do właściwej lekcji
- [x] 1.9 Badge `✓ Rozdział ukończony!` widoczny na lekcji ukończonego rozdziału

### Faza 2: Dashboard — lista rozdziałów z progress

#### Automatyczne

- [ ] 2.1 `npx tsc --noEmit` przechodzi
- [ ] 2.2 `npm run build` przechodzi

#### Ręczne

- [ ] 2.3 Dashboard pokazuje listę rozdziałów pod tytułem książki z licznikami `x/y lekcji`
- [ ] 2.4 Ukończony rozdział pokazuje `✓` obok licznika
- [ ] 2.5 Przycisk "Kontynuuj naukę" nadal kieruje do pierwszej nieukończonej lekcji
- [ ] 2.6 "✓ Gratulacje, książka ukończona!" nadal wyświetla się przy pełnym ukończeniu
