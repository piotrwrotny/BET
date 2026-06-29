import type { APIRoute } from "astro";
import { z } from "zod";
import { createClient } from "@/lib/supabase";

const UUID_LIKE_RE = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

const ParamsSchema = z.object({
  id: z.string().regex(UUID_LIKE_RE, "Nieprawidłowe ID użytkownika"),
});

const QuerySchema = z.object({
  book_id: z.string().regex(UUID_LIKE_RE, "Nieprawidłowe ID książki"),
});

export const prerender = false;

function requireSameOrigin(request: Request): Response | null {
  const origin = request.headers.get("origin");
  const referer = request.headers.get("referer");
  const siteUrl = new URL(request.url);
  const isSameOrigin =
    origin === siteUrl.origin || (!origin && referer?.startsWith(siteUrl.origin));
  if (!isSameOrigin) {
    return Response.json({ error: "Invalid origin" }, { status: 403 });
  }
  return null;
}

export const DELETE: APIRoute = async ({ params, request, cookies, locals }) => {
  if (locals.role !== "admin") {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const csrf = requireSameOrigin(request);
  if (csrf) return csrf;

  const parsedParams = ParamsSchema.safeParse({ id: params.id });
  if (!parsedParams.success) {
    return Response.json(
      { error: parsedParams.error.issues[0]?.message ?? "Błąd walidacji parametrów" },
      { status: 400 },
    );
  }

  const parsedQuery = QuerySchema.safeParse({
    book_id: new URL(request.url).searchParams.get("book_id"),
  });
  if (!parsedQuery.success) {
    return Response.json(
      { error: parsedQuery.error.issues[0]?.message ?? "Błąd walidacji parametrów" },
      { status: 400 },
    );
  }

  const supabase = createClient(request.headers, cookies);
  if (!supabase) {
    return Response.json({ error: "Service unavailable" }, { status: 503 });
  }

  const { data: targetRole, error: roleError } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", parsedParams.data.id)
    .maybeSingle();

  if (roleError || targetRole?.role !== "student") {
    return Response.json({ error: "Target user is not a student" }, { status: 403 });
  }

  const { error } = await supabase
    .from("user_book_access")
    .delete()
    .eq("user_id", parsedParams.data.id)
    .eq("book_id", parsedQuery.data.book_id);

  if (error) {
    console.error("Failed to revoke book access:", error);
    return Response.json({ error: "Nie udało się odebrać dostępu" }, { status: 500 });
  }

  return Response.json({ ok: true }, { status: 200 });
};
