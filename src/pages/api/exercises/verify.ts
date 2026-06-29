import type { APIRoute } from "astro";
import { z } from "zod";
import { createClient } from "@/lib/supabase";
import { uuidSchema } from "@/lib/utils";

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

  // Fetch exercise keys — RLS enforces has_exercise_access; keys never reach the client
  const { data: keys } = await supabase
    .from("exercise_keys")
    .select("key_text, key_metadata")
    .eq("exercise_id", exercise_id)
    .overrideTypes<{ key_text: string; key_metadata: unknown }[], { merge: false }>();
  if (!keys || keys.length === 0) {
    // No keys accessible = treat as incorrect (don't reveal whether ID exists)
    return Response.json({ correct: false }, {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }

  const normalizedAnswer = answer.trim().toLowerCase();
  const correct = keys.some((key) => {
    // Skip reference-only entries (open-ended model answers — FR-025)
    const meta = key.key_metadata as { is_reference_only?: boolean } | null;
    if (meta?.is_reference_only) return false;
    return key.key_text.trim().toLowerCase() === normalizedAnswer;
  });

  return Response.json({ correct }, {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
};
