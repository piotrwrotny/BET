export const prerender = false;

import type { APIRoute } from "astro";
import { z } from "zod";
import { createClient } from "@/lib/supabase";

const CreateLessonSchema = z.object({
  chapter_id: z.string().min(1, "chapter_id jest wymagany"),
  title: z.string().min(1, "Tytuł jest wymagany"),
  content: z.string().min(1, "Treść jest wymagana"),
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
    chapter_id: formData.get("chapter_id"),
    title: formData.get("title"),
    content: formData.get("content"),
  };

  const parsed = CreateLessonSchema.safeParse(raw);
  if (!parsed.success) {
    const error = encodeURIComponent(parsed.error.issues[0]?.message ?? "Błąd walidacji");
    const chapterId = typeof raw.chapter_id === "string" ? raw.chapter_id : "";
    return Response.redirect(new URL(`/admin/lessons/new?chapter_id=${chapterId}&error=${error}`, request.url), 302);
  }

  const { chapter_id, title, content } = parsed.data;

  // Auto-append ord
  const { data: maxRow } = await supabase
    .from("lessons")
    .select("ord")
    .eq("chapter_id", chapter_id)
    .order("ord", { ascending: false })
    .limit(1)
    .single();

  let ord = 0;
  if (maxRow && typeof maxRow.ord === "number") {
    ord = maxRow.ord + 1;
  }

  const { error } = await supabase.from("lessons").insert({ chapter_id, title, content, ord });

  if (error) {
    const msg = encodeURIComponent(error.message);
    return Response.redirect(new URL(`/admin/lessons/new?chapter_id=${chapter_id}&error=${msg}`, request.url), 302);
  }

  return Response.redirect(new URL(`/admin/lessons?chapter_id=${chapter_id}`, request.url), 302);
};
