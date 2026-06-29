# Lessons Learned

> Append-only register of recurring rules and patterns. Re-read at start by /10x-frame, /10x-research, /10x-plan, /10x-plan-review, /10x-implement, /10x-impl-review.

## Zod v4 record schema

- **Context**: `src/pages/api/admin/exercises/index.ts`, `src/pages/api/admin/exercises/[id].ts`
- **Problem**: `z.record(z.unknown())` użyte do walidacji `exercise.payload` jest niepoprawne w zod v4 — zgłasza `TS2554: Expected 2-3 arguments, but got 1`. Plan zakładał starszy zapis, który nie działa w aktualnej wersji.
- **Rule**: W zod v4 zawsze podawaj dwa argumenty w `z.record()`: `z.record(z.string(), z.unknown())` lub użyj `z.object({...}).passthrough()` dla dyskryminowanych payloadów JSONB.
- **Applies to**: Wszystkie API routes walidujące payloady / obiekty JSONB.
