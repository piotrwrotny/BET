import type { APIRoute } from "astro";
import { z } from "zod";
import { createClient } from "@/lib/supabase";

const ParamsSchema = z.object({
  id: z.uuid("Nieprawidłowe ID użytkownika"),
});

export const prerender = false;

export const DELETE: APIRoute = async ({ params, request, cookies, locals }) => {
  if (locals.role !== "admin") {
    return new Response(JSON.stringify({ error: "Forbidden" }), { status: 403 });
  }

  const parsedParams = ParamsSchema.safeParse({ id: params.id });
  if (!parsedParams.success) {
    return new Response(
      JSON.stringify({ error: parsedParams.error.issues[0]?.message ?? "Błąd walidacji parametrów" }),
      { status: 400 },
    );
  }

  const supabase = createClient(request.headers, cookies);
  if (!supabase) {
    return new Response(JSON.stringify({ error: "Service unavailable" }), { status: 503 });
  }

  const { error } = await supabase.from("user_book_access").delete().eq("user_id", parsedParams.data.id);

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }

  return new Response(JSON.stringify({ ok: true }), { status: 200 });
};
