import type { APIRoute } from "astro";
import { z } from "zod";
import { logServerError } from "@/lib/logger";
import { createClient } from "@/lib/supabase";
import { uuidSchema } from "@/lib/utils";

const ParamsSchema = z.object({
  id: uuidSchema,
});

const GrantAccessSchema = z.object({
  book_id: uuidSchema,
});

export const prerender = false;

function requireSameOrigin(request: Request): Response | null {
  const origin = request.headers.get("origin");
  const referer = request.headers.get("referer");
  const secFetchSite = request.headers.get("sec-fetch-site");
  const siteUrl = new URL(request.url);
  const isSameOrigin =
    secFetchSite === "same-origin" || origin === siteUrl.origin || (!origin && referer?.startsWith(siteUrl.origin));
  if (!isSameOrigin) {
    return Response.json({ error: "Invalid origin" }, { status: 403 });
  }
  return null;
}

export const POST: APIRoute = async ({ params, request, cookies, locals }) => {
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

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsedBody = GrantAccessSchema.safeParse(body);
  if (!parsedBody.success) {
    return Response.json({ error: parsedBody.error.issues[0]?.message ?? "Błąd walidacji" }, { status: 400 });
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
    logServerError("Failed to grant book access:", error);
    return Response.json({ error: "Nie udało się przyznać dostępu" }, { status: 500 });
  }

  return Response.json({ ok: true }, { status: 200 });
};
