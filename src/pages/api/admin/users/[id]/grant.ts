import type { APIRoute } from "astro";
import { z } from "zod";
import { createClient } from "@/lib/supabase";

const UUID_LIKE_RE = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

const ParamsSchema = z.object({
  id: z.string().regex(UUID_LIKE_RE, "Nieprawidłowe ID użytkownika"),
});

const GrantAccessSchema = z.object({
  book_id: z.string().regex(UUID_LIKE_RE, "Nieprawidłowe ID książki"),
});
export const prerender = false;

export const POST: APIRoute = async ({ params, request, cookies, locals }) => {
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

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), { status: 400 });
  }

  const parsedBody = GrantAccessSchema.safeParse(body);
  if (!parsedBody.success) {
    return new Response(JSON.stringify({ error: parsedBody.error.issues[0]?.message ?? "Błąd walidacji" }), {
      status: 400,
    });
  }

  const supabase = createClient(request.headers, cookies);
  if (!supabase) {
    return new Response(JSON.stringify({ error: "Service unavailable" }), { status: 503 });
  }

  const { error } = await supabase.from("user_book_access").upsert(
    {
      user_id: parsedParams.data.id,
      book_id: parsedBody.data.book_id,
    },
    {
      onConflict: "user_id,book_id",
      ignoreDuplicates: true,
    },
  );

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }

  return new Response(JSON.stringify({ ok: true }), { status: 200 });
};
