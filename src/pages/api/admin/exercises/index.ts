import type { APIRoute } from "astro";
import { z } from "zod";
import { createClient } from "@/lib/supabase";

const ExerciseTypeEnum = z.enum(["multiple_choice", "fill_in_blank", "true_false"]);

const CreateExerciseSchema = z.object({
  lesson_id: z.string().min(1, "lesson_id jest wymagany"),
  type: ExerciseTypeEnum,
  prompt: z.string().min(1, "Treść ćwiczenia jest wymagana"),
  payload: z.record(z.unknown()),
  keys: z.array(z.string().min(1)).min(1, "Wymagany co najmniej jeden klucz"),
});

export const POST: APIRoute = async ({ request, cookies, locals }) => {
  if (locals.role !== "admin") {
    return new Response(JSON.stringify({ error: "Forbidden" }), { status: 403 });
  }

  const supabase = createClient(request.headers, cookies);
  if (!supabase) {
    return new Response(JSON.stringify({ error: "Service unavailable" }), { status: 503 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), { status: 400 });
  }

  const parsed = CreateExerciseSchema.safeParse(body);
  if (!parsed.success) {
    return new Response(
      JSON.stringify({ error: parsed.error.issues[0]?.message ?? "Błąd walidacji" }),
      { status: 400 }
    );
  }

  const { lesson_id, type, prompt, payload, keys } = parsed.data;

  // Validate MC: correct answer must be in options
  if (type === "multiple_choice") {
    const options = (payload as { options?: string[] }).options ?? [];
    if (!options.includes(keys[0]!)) {
      return new Response(
        JSON.stringify({ error: "Poprawna odpowiedź musi być jedną z opcji" }),
        { status: 400 }
      );
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

  const ord = maxRow ? maxRow.ord + 1 : 0;

  const { data: exercise, error: insertError } = await supabase
    .from("exercises")
    .insert({ lesson_id, type, prompt, payload, ord })
    .select("id")
    .single();

  if (insertError || !exercise) {
    return new Response(
      JSON.stringify({ error: insertError?.message ?? "Błąd zapisu ćwiczenia" }),
      { status: 500 }
    );
  }

  // Insert keys sequentially
  for (let i = 0; i < keys.length; i++) {
    const { error: keyError } = await supabase
      .from("exercise_keys")
      .insert({ exercise_id: exercise.id, key_text: keys[i], ord: i });

    if (keyError) {
      return new Response(JSON.stringify({ error: keyError.message }), { status: 500 });
    }
  }

  return new Response(JSON.stringify({ ok: true }), { status: 200 });
};
