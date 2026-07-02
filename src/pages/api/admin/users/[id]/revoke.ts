import type { APIRoute } from "astro";
import { z } from "zod";
import { TABLE_USER_BOOK_ACCESS, TABLE_USER_ROLES } from "@/lib/db/schema";
import { requireAdminApi, requireSameOrigin } from "@/lib/guards";
import { logServerError } from "@/lib/logger";
import { createClient } from "@/lib/supabase.server";
import { uuidSchema } from "@/lib/utils";

const ParamsSchema = z.object({
  id: uuidSchema,
});

const QuerySchema = z.object({
  book_id: uuidSchema,
});

export const prerender = false;

export const DELETE: APIRoute = async ({ params, request, cookies, locals }) => {
  const denied = requireAdminApi(locals);
  if (denied) return denied;

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
    .from(TABLE_USER_ROLES)
    .select("role")
    .eq("user_id", parsedParams.data.id)
    .maybeSingle();

  if (roleError || targetRole?.role !== "student") {
    return Response.json({ error: "Target user is not a student" }, { status: 403 });
  }

  const { error } = await supabase
    .from(TABLE_USER_BOOK_ACCESS)
    .delete()
    .eq("user_id", parsedParams.data.id)
    .eq("book_id", parsedQuery.data.book_id);

  if (error) {
    logServerError("Failed to revoke book access:", error);
    return Response.json({ error: "Nie udało się odebrać dostępu" }, { status: 500 });
  }

  return Response.json({ ok: true }, { status: 200 });
};
