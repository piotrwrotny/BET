import type { APIRoute } from "astro";
import { z } from "zod";
import { createClient } from "@/lib/supabase";

const ExerciseTypeEnum = z.enum(["multiple_choice", "fill_in_blank", "true_false"]);

const UpdateExerciseSchema = z.object({
  lesson_id: z.string().min(1),
  type: ExerciseTypeEnum,
  prompt: z.string().min(1, "Treść ćwiczenia jest wymagana"),
  payload: z.record(z.unknown()),
  keys: z.array(z.string().min(1)).min(1, "Wymagany co najmniej jeden klucz"),
});

export const POST: APIRoute = async ({ params, request, cookies, locals }) => {
  if (locals.role !== "admin") {
    return new Response(JSON.stringify({ error: "Forbidden" }), { status: 403 });
  }

  const supabase = createClient(request.headers, cookies);
  if (!supabase) {
    return new Response(JSON.stringify({ error: "Service unavailable" }), { status: 503 });
  }

  const { id } = params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), { status: 400 });
  }

  const parsed = UpdateExerciseSchema.safeParse(body);
  if (!parsed.success) {
    return new Response(
      JSON.stringify({ error: parsed.error.issues[0]?.message ?? "Błąd walidacji" }),
      { status: 400 }
    );
  }

  const { type, prompt, payload, keys } = parsed.data;

  // Validate MC
  if (type === "multiple_choice") {
    const options = (payload as { options?: string[] }).options ?? [];
    if (!options.includes(keys[0]!)) {
      return new Response(
        JSON.stringify({ error: "Poprawna odpowiedź musi być jedną z opcji" }),
        { status: 400 }
      );
    }
  }

  // Update exercise
  const { error: updateError } = await supabase
    .from("exercises")
    .update({ type, prompt, payload })
    .eq("id", id!);

  if (updateError) {
    return new Response(JSON.stringify({ error: updateError.message }), { status: 500 });
  }

  // Replace-all keys: delete existing, insert new
  const { error: deleteError } = await supabase
    .from("exercise_keys")
    .delete()
    .eq("exercise_id", id!);

  if (deleteError) {
    return new Response(JSON.stringify({ error: deleteError.message }), { status: 500 });
  }

  for (let i = 0; i < keys.length; i++) {
    const { error: keyError } = await supabase
      .from("exercise_keys")
      .insert({ exercise_id: id, key_text: keys[i], ord: i });

    if (keyError) {
      return new Response(JSON.stringify({ error: keyError.message }), { status: 500 });
    }
  }

  return new Response(JSON.stringify({ ok: true }), { status: 200 });
};

export const DELETE: APIRoute = async ({ params, request, cookies, locals }) => {
  if (locals.role !== "admin") {
    return new Response(JSON.stringify({ error: "Forbidden" }), { status: 403 });
  }

  const supabase = createClient(request.headers, cookies);
  if (!supabase) {
    return new Response(JSON.stringify({ error: "Service unavailable" }), { status: 503 });
  }

  const { id } = params;
  const { error } = await supabase.from("exercises").delete().eq("id", id!);

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }

  return new Response(JSON.stringify({ ok: true }), { status: 200 });
};
