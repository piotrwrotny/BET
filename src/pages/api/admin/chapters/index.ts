export const prerender = false;

import type { APIRoute } from "astro";
import { z } from "zod";
import { createClient } from "@/lib/supabase";

const CreateChapterSchema = z.object({
  book_id: z.string().min(1, "book_id jest wymagany"),
  title: z.string().min(1, "Tytuł jest wymagany"),
});

export const POST: APIRoute = async ({ request, cookies, locals }) => {
  if (locals.role !== "admin") {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const origin = request.headers.get("origin");
  const referer = request.headers.get("referer");
  const siteUrl = new URL(request.url);
  const isSameOrigin = origin === siteUrl.origin || (!origin && referer?.startsWith(siteUrl.origin));
  if (!isSameOrigin) {
    return Response.json({ error: "Invalid origin" }, { status: 403 });
  }

  const supabase = createClient(request.headers, cookies);
  if (!supabase) {
    return Response.json({ error: "Service unavailable" }, { status: 503 });
  }

  const formData = await request.formData();
  const raw = {
    book_id: formData.get("book_id"),
    title: formData.get("title"),
  };

  const parsed = CreateChapterSchema.safeParse(raw);
  if (!parsed.success) {
    const error = encodeURIComponent(parsed.error.issues[0]?.message ?? "Błąd walidacji");
    const bookId = typeof raw.book_id === "string" ? raw.book_id : "";
    return Response.redirect(new URL(`/admin/chapters/new?book_id=${bookId}&error=${error}`, request.url), 302);
  }

  const { book_id, title } = parsed.data;

  // Auto-append ord
  const { data: maxRow } = await supabase
    .from("chapters")
    .select("ord")
    .eq("book_id", book_id)
    .order("ord", { ascending: false })
    .limit(1)
    .single();

  let ord = 0;
  if (maxRow && typeof maxRow.ord === "number") {
    ord = maxRow.ord + 1;
  }

  const { error } = await supabase.from("chapters").insert({ book_id, title, ord });

  if (error) {
    const msg = encodeURIComponent(error.message);
    return Response.redirect(new URL(`/admin/chapters/new?book_id=${book_id}&error=${msg}`, request.url), 302);
  }

  return Response.redirect(new URL(`/admin/chapters?book_id=${book_id}`, request.url), 302);
};
