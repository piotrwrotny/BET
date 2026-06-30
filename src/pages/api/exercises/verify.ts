import type { APIRoute } from "astro";
import { z } from "zod";
import { createClient } from "@/lib/supabase";
import { uuidSchema } from "@/lib/utils";
import { parseMatchingKey } from "@/lib/exercise-schemas";

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

  const exerciseType = (exercise?.type ?? "") as string;

  if (exerciseType === "matching") {
    let studentMap: Record<string, string>;
    try {
      studentMap = parseMatchingKey(answer);
    } catch {
      return Response.json(
        { correct: false },
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        },
      );
    }

    const keyText = keys.find((key) => {
      const meta = key.key_metadata as { is_reference_only?: boolean } | null;
      return !meta?.is_reference_only;
    })?.key_text;

    if (!keyText) {
      return Response.json(
        { correct: false },
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        },
      );
    }

    let correctMap: Record<string, string>;
    try {
      correctMap = parseMatchingKey(keyText);
    } catch {
      return Response.json(
        { correct: false },
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        },
      );
    }

    const studentLeft = Object.keys(studentMap);
    const correctLeft = Object.keys(correctMap);
    if (studentLeft.length !== correctLeft.length) {
      return Response.json(
        { correct: false },
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        },
      );
    }

    const correct =
      studentLeft.length === correctLeft.length && studentLeft.every((left) => correctMap[left] === studentMap[left]);

    return Response.json(
      { correct },
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      },
    );
  }

  if (exerciseType === "open_ended") {
    return Response.json(
      { correct: false },
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      },
    );
  }

  // multiple_choice, fill_in_blank, true_false, sentence_transformation
  const normalizedAnswer = answer.trim().toLowerCase();
  const correct = keys.some((key) => {
    const meta = key.key_metadata as { is_reference_only?: boolean } | null;
    if (meta?.is_reference_only) return false;
    return key.key_text.trim().toLowerCase() === normalizedAnswer;
  });

  return Response.json(
    { correct },
    {
      status: 200,
      headers: { "Content-Type": "application/json" },
    },
  );
};
