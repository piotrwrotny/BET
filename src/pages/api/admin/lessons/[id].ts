import type { APIRoute } from "astro";
import { z } from "zod";
import { createClient } from "@/lib/supabase";

const UpdateLessonSchema = z.object({
  title: z.string().min(1, "Tytuł jest wymagany"),
  content: z.string().min(1, "Treść jest wymagana"),
  chapter_id: z.string().min(1, "chapter_id jest wymagany"),
});

export const POST: APIRoute = async ({ params, request, cookies, locals }) => {
  if (locals.role !== "admin") {
    return new Response(JSON.stringify({ error: "Forbidden" }), { status: 403 });
  }

  const supabase = createClient(request.headers, cookies);
  if (!supabase) {
    return new Response(JSON.stringify({ error: "Service unavailable" }), { status: 503 });
  }

  const { id } = params;
  const formData = await request.formData();
  const raw = {
    title: formData.get("title"),
    content: formData.get("content"),
    chapter_id: formData.get("chapter_id"),
  };

  const parsed = UpdateLessonSchema.safeParse(raw);
  if (!parsed.success) {
    const error = encodeURIComponent(parsed.error.issues[0]?.message ?? "Błąd walidacji");
    return Response.redirect(
      new URL(`/admin/lessons/${id}/edit?error=${error}`, request.url),
      302
    );
  }

  const { title, content, chapter_id } = parsed.data;
  const { error } = await supabase
    .from("lessons")
    .update({ title, content })
    .eq("id", id!);

  if (error) {
    const msg = encodeURIComponent(error.message);
    return Response.redirect(
      new URL(`/admin/lessons/${id}/edit?error=${msg}`, request.url),
      302
    );
  }

  return Response.redirect(new URL(`/admin/lessons?chapter_id=${chapter_id}`, request.url), 302);
};

export const DELETE: APIRoute = async ({ params, request, cookies, locals }) => {
  if (locals.role !== "admin") {
    return new Response(JSON.stringify({ error: "Forbidden" }), { status: 403 });
  }

  const supabase = createClient(request.headers, cookies);
  if (!supabase) {
    return new Response(JSON.stringify({ error: "Service unavailable" }), { status: 503 });
  }

  const { id } = params;
  const { error } = await supabase.from("lessons").delete().eq("id", id!);

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }

  return new Response(JSON.stringify({ ok: true }), { status: 200 });
};
