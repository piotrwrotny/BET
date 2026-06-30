export const prerender = false;

import type { APIRoute } from "astro";
import { z } from "zod";
import { createClient } from "@/lib/supabase";
import {
  ExerciseTypeEnum,
  MultipleChoicePayloadSchema,
  MatchingPayloadSchema,
  SentenceTransformationPayloadSchema,
  OpenEndedPayloadSchema,
  parseMatchingKey,
} from "@/lib/exercise-schemas";

const CreateExerciseSchema = z.object({
  lesson_id: z.string().min(1, "lesson_id jest wymagany"),
  type: ExerciseTypeEnum,
  prompt: z.string().min(1, "Treść ćwiczenia jest wymagana"),
  payload: z.record(z.string(), z.unknown()),
  keys: z.array(z.string().min(1)).min(1, "Wymagany co najmniej jeden klucz"),
});

export const POST: APIRoute = async ({ request, cookies, locals }) => {
  if (locals.role !== "admin") {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const origin = request.headers.get("origin");
  const referer = request.headers.get("referer");
  const siteUrl = new URL(request.url);
  const isSameOrigin = origin === siteUrl.origin || (!origin && referer?.startsWith(siteUrl.origin));
  if (!isSameOrigin) {
    return Response.json({ error: "Invalid origin" }, { status: 403 });
  }

  const supabase = createClient(request.headers, cookies);
  if (!supabase) {
    return Response.json({ error: "Service unavailable" }, { status: 503 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = CreateExerciseSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: parsed.error.issues[0]?.message ?? "Błąd walidacji" }, { status: 400 });
  }

  const { lesson_id, type, prompt, payload, keys } = parsed.data;

  // Type-specific validation
  if (type === "multiple_choice") {
    const payloadResult = MultipleChoicePayloadSchema.safeParse(payload);
    if (!payloadResult.success) {
      return Response.json(
        { error: payloadResult.error.issues[0]?.message ?? "Nieprawidłowy payload" },
        { status: 400 },
      );
    }
    const options = payloadResult.data.options;
    const firstKey = keys[0];
    if (!firstKey || !options.includes(firstKey)) {
      return Response.json({ error: "Poprawna odpowiedź musi być jedną z opcji" }, { status: 400 });
    }
  }

  if (type === "matching") {
    const payloadResult = MatchingPayloadSchema.safeParse(payload);
    if (!payloadResult.success) {
      return Response.json(
        { error: payloadResult.error.issues[0]?.message ?? "Nieprawidłowy payload" },
        { status: 400 },
      );
    }
    if (keys.length !== 1) {
      return Response.json({ error: "Ćwiczenie matchingu wymaga dokładnie jednego klucza" }, { status: 400 });
    }
    const firstKey = keys[0];
    if (!firstKey) {
      return Response.json({ error: "Klucz matchingu jest wymagany" }, { status: 400 });
    }

    let correctMap: Record<string, string>;
    try {
      correctMap = parseMatchingKey(firstKey);
    } catch {
      return Response.json({ error: "Klucz matchingu musi być poprawną mapą JSON" }, { status: 400 });
    }

    const pairs = payloadResult.data.pairs;
    const leftIndices = new Set(Object.keys(correctMap));
    if (leftIndices.size !== pairs.length) {
      return Response.json({ error: "Mapa matchingu musi zawierać każdy lewy indeks" }, { status: 400 });
    }

    const validLeft = Array.from({ length: pairs.length }, (_, i) => String(i));
    const validRight = Array.from({ length: pairs.length }, (_, i) => String(i));
    for (const left of leftIndices) {
      if (!validLeft.includes(left)) {
        return Response.json({ error: `Nieprawidłowy lewy indeks: ${left}` }, { status: 400 });
      }
      const right = correctMap[left];
      if (!right || !validRight.includes(right)) {
        return Response.json(
          { error: `Nieprawidłowy prawy indeks dla lewej strony ${left}: ${right}` },
          { status: 400 },
        );
      }
    }
  }

  if (type === "sentence_transformation") {
    const payloadResult = SentenceTransformationPayloadSchema.safeParse(payload);
    if (!payloadResult.success) {
      return Response.json(
        { error: payloadResult.error.issues[0]?.message ?? "Nieprawidłowy payload" },
        { status: 400 },
      );
    }
  }

  if (type === "open_ended") {
    const payloadResult = OpenEndedPayloadSchema.safeParse(payload);
    if (!payloadResult.success) {
      return Response.json(
        { error: payloadResult.error.issues[0]?.message ?? "Nieprawidłowy payload" },
        { status: 400 },
      );
    }
    if (keys.length !== 1) {
      return Response.json({ error: "Pytanie otwarte wymaga dokładnie jednej wzorcowej odpowiedzi" }, { status: 400 });
    }
  }

  // Auto-append ord
  const { data: maxRow } = await supabase
    .from("exercises")
    .select("ord")
    .eq("lesson_id", lesson_id)
    .order("ord", { ascending: false })
    .limit(1)
    .single();

  const ord: number = maxRow ? (maxRow.ord as number) + 1 : 0;

  const { data: exercise, error: insertError } = await supabase
    .from("exercises")
    .insert({ lesson_id, type, prompt, payload, ord })
    .select("id")
    .single();

  if (insertError) {
    return Response.json({ error: insertError.message }, { status: 500 });
  }

  const keyRows: { exercise_id: string; key_text: string; ord: number; key_metadata?: { is_reference_only: true } }[] =
    keys.map((key_text, ord) => ({
      exercise_id: exercise.id as string,
      key_text,
      ord,
      ...(type === "open_ended" ? { key_metadata: { is_reference_only: true } } : {}),
    }));
  const { error: keysError } = await supabase.from("exercise_keys").insert(keyRows);

  if (keysError) {
    return Response.json({ error: keysError.message }, { status: 500 });
  }

  return Response.json({ ok: true }, { status: 200 });
};
