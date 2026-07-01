import type { APIRoute } from "astro";
import { z } from "zod";
import { createAdminClient, createClient } from "@/lib/supabase";
import { uuidSchema } from "@/lib/utils";
import { verifyExercise } from "@/lib/verify-exercise";

const VerifyBodySchema = z.object({
  exercise_id: uuidSchema,
  answer: z.string().min(1),
});

export const POST: APIRoute = async (context) => {
  let body: unknown;
  try {
    body = await context.request.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = VerifyBodySchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: parsed.error.message }, { status: 400 });
  }

  const { exercise_id, answer } = parsed.data;

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return Response.json({ error: "Service unavailable" }, { status: 503 });
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Fetch exercise type + keys. RLS enforces has_exercise_access; keys never reach the client.
  const { data: exercise } = await supabase.from("exercises").select("type").eq("id", exercise_id).single();

  const { data: keys } = await supabase
    .from("exercise_keys")
    .select("key_text, key_metadata")
    .eq("exercise_id", exercise_id)
    .overrideTypes<{ key_text: string; key_metadata: unknown }[], { merge: false }>();

  if (!keys || keys.length === 0) {
    return Response.json(
      { correct: false },
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      },
    );
  }

  const exerciseType = String(exercise?.type ?? "");
  const correct = verifyExercise(exerciseType, answer, keys);

  if (correct && exerciseType !== "open_ended") {
    try {
      const adminClient = createAdminClient();
      const { error: submissionError } = await adminClient.from("exercise_submissions").upsert(
        {
          user_id: user.id,
          exercise_id,
          answer,
          is_correct: true,
        },
        { onConflict: "user_id,exercise_id", ignoreDuplicates: false },
      );
      if (submissionError) {
        return Response.json({ error: "Failed to record submission" }, { status: 500 });
      }
    } catch {
      return Response.json({ error: "Service unavailable" }, { status: 503 });
    }
  }

  return Response.json(
    { correct },
    {
      status: 200,
      headers: { "Content-Type": "application/json" },
    },
  );
};
