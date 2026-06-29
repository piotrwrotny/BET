export const prerender = false;

import type { APIRoute } from "astro";
import { z } from "zod";
import { createClient } from "@/lib/supabase";
import { uuidSchema } from "@/lib/utils";

const UpdateChapterSchema = z.object({
  title: z.string().min(1, "Tytuł jest wymagany"),
  book_id: z.string().min(1, "book_id jest wymagany"),
});

export const POST: APIRoute = async ({ params, request, cookies, locals }) => {
  if (locals.role !== "admin") {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const origin = request.headers.get("origin");
  const referer = request.headers.get("referer");
  const siteUrl = new URL(request.url);
  const isSameOrigin =
    origin === siteUrl.origin || (!origin && referer?.startsWith(siteUrl.origin));
  if (!isSameOrigin) {
    return Response.json({ error: "Invalid origin" }, { status: 403 });
  }

  const supabase = createClient(request.headers, cookies);
  if (!supabase) {
    return Response.json({ error: "Service unavailable" }, { status: 503 });
  }

  const { id } = params;
  const idResult = uuidSchema.safeParse(id);
  if (!idResult.success) {
    return Response.json({ error: "Invalid UUID" }, { status: 400 });
  }
  const validId = idResult.data;

  const formData = await request.formData();
  const raw = {
    title: formData.get("title"),
    book_id: formData.get("book_id"),
  };

  const parsed = UpdateChapterSchema.safeParse(raw);
  if (!parsed.success) {
    const error = encodeURIComponent(parsed.error.issues[0]?.message ?? "Błąd walidacji");
    return Response.redirect(
      new URL(`/admin/chapters/${validId}/edit?error=${error}`, request.url),
      302
    );
  }

  const { title, book_id } = parsed.data;
  const { error } = await supabase.from("chapters").update({ title }).eq("id", validId);

  if (error) {
    const msg = encodeURIComponent(error.message);
    return Response.redirect(
      new URL(`/admin/chapters/${validId}/edit?error=${msg}`, request.url),
      302
    );
  }

  return Response.redirect(new URL(`/admin/chapters?book_id=${book_id}`, request.url), 302);
};

export const DELETE: APIRoute = async ({ params, request, cookies, locals }) => {
  if (locals.role !== "admin") {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const origin = request.headers.get("origin");
  const referer = request.headers.get("referer");
  const siteUrl = new URL(request.url);
  const isSameOrigin =
    origin === siteUrl.origin || (!origin && referer?.startsWith(siteUrl.origin));
  if (!isSameOrigin) {
    return Response.json({ error: "Invalid origin" }, { status: 403 });
  }

  const supabase = createClient(request.headers, cookies);
  if (!supabase) {
    return Response.json({ error: "Service unavailable" }, { status: 503 });
  }

  const { id } = params;
  const idResult = uuidSchema.safeParse(id);
  if (!idResult.success) {
    return Response.json({ error: "Invalid UUID" }, { status: 400 });
  }
  const validId = idResult.data;

  const { error } = await supabase.from("chapters").delete().eq("id", validId);

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  return Response.json({ ok: true }, { status: 200 });
};
