export const prerender = false;

import type { APIRoute } from "astro";
import { z } from "zod";
import { createClient } from "@/lib/supabase";
import { uuidSchema } from "@/lib/utils";
import {
  ExerciseTypeEnum,
  MultipleChoicePayloadSchema,
  MatchingPayloadSchema,
  parseMatchingKey,
} from "@/lib/exercise-schemas";

const UpdateExerciseSchema = z.object({
  lesson_id: z.string().min(1),
  type: ExerciseTypeEnum,
  prompt: z.string().min(1, "Treść ćwiczenia jest wymagana"),
  payload: z.record(z.string(), z.unknown()),
  keys: z.array(z.string().min(1)).min(1, "Wymagany co najmniej jeden klucz"),
});

export const POST: APIRoute = async ({ params, request, cookies, locals }) => {
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

  const { id } = params;
  const idResult = uuidSchema.safeParse(id);
  if (!idResult.success) {
    return Response.json({ error: "Invalid UUID" }, { status: 400 });
  }
  const validId = idResult.data;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = UpdateExerciseSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: parsed.error.issues[0]?.message ?? "Błąd walidacji" }, { status: 400 });
  }

  const { type, prompt, payload, keys } = parsed.data;

  if (type === "sentence_transformation" || type === "open_ended") {
    return Response.json({ error: "Ten typ ćwiczenia nie jest jeszcze edytowalny" }, { status: 400 });
  }

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

  // Update exercise
  const { error: updateError } = await supabase.from("exercises").update({ type, prompt, payload }).eq("id", validId);

  if (updateError) {
    return Response.json({ error: updateError.message }, { status: 500 });
  }

  // Replace-all keys: backup old, delete, insert new, restore on failure
  const { data: oldKeys, error: readOldError } = await supabase
    .from("exercise_keys")
    .select("key_text,ord")
    .eq("exercise_id", validId);

  if (readOldError) {
    return Response.json({ error: readOldError.message }, { status: 500 });
  }

  const { error: deleteError } = await supabase.from("exercise_keys").delete().eq("exercise_id", validId);

  if (deleteError) {
    return Response.json({ error: deleteError.message }, { status: 500 });
  }

  const keyRows = keys.map((key_text, ord) => ({ exercise_id: validId, key_text, ord }));
  const { error: keysError } = await supabase.from("exercise_keys").insert(keyRows);

  if (keysError) {
    if (oldKeys.length > 0) {
      const fallbackRows: { exercise_id: string; key_text: string; ord: number }[] = oldKeys.map(
        ({ key_text, ord }) => ({ exercise_id: validId, key_text: key_text as string, ord: ord as number }),
      );
      await supabase.from("exercise_keys").insert(fallbackRows);
    }
    return Response.json({ error: keysError.message }, { status: 500 });
  }

  return Response.json({ ok: true }, { status: 200 });
};

export const DELETE: APIRoute = async ({ params, request, cookies, locals }) => {
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

  const { id } = params;
  const idResult = uuidSchema.safeParse(id);
  if (!idResult.success) {
    return Response.json({ error: "Invalid UUID" }, { status: 400 });
  }
  const validId = idResult.data;

  const { error } = await supabase.from("exercises").delete().eq("id", validId);

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  return Response.json({ ok: true }, { status: 200 });
};
