import type { APIRoute } from "astro";
import { z } from "zod";
import { createClient } from "@/lib/supabase";

const UUID_RE = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/i;

const VerifyBodySchema = z.object({
  exercise_id: z.string().regex(UUID_RE, "Invalid UUID"),
  answer: z.string().min(1),
});

export const POST: APIRoute = async (context) => {
  let body: unknown;
  try {
    body = await context.request.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON" }), { status: 400 });
  }

  const parsed = VerifyBodySchema.safeParse(body);
  if (!parsed.success) {
    return new Response(JSON.stringify({ error: parsed.error.flatten() }), { status: 400 });
  }

  const { exercise_id, answer } = parsed.data;

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return new Response(JSON.stringify({ error: "Service unavailable" }), { status: 503 });
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
  }

  // Fetch exercise keys — RLS enforces has_exercise_access; keys never reach the client
  const { data: keys } = await supabase
    .from("exercise_keys")
    .select("key_text, key_metadata")
    .eq("exercise_id", exercise_id);

  if (!keys || keys.length === 0) {
    // No keys accessible = treat as incorrect (don't reveal whether ID exists)
    return new Response(JSON.stringify({ correct: false }), {
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

  return new Response(JSON.stringify({ correct }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
};
