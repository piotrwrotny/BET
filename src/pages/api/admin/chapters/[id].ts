import type { APIRoute } from "astro";
import { z } from "zod";
import { createClient } from "@/lib/supabase";

const UpdateChapterSchema = z.object({
  title: z.string().min(1, "Tytuł jest wymagany"),
  book_id: z.string().min(1, "book_id jest wymagany"),
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
    book_id: formData.get("book_id"),
  };

  const parsed = UpdateChapterSchema.safeParse(raw);
  if (!parsed.success) {
    const error = encodeURIComponent(parsed.error.issues[0]?.message ?? "Błąd walidacji");
    return Response.redirect(
      new URL(`/admin/chapters/${id}/edit?error=${error}`, request.url),
      302
    );
  }

  const { title, book_id } = parsed.data;
  const { error } = await supabase.from("chapters").update({ title }).eq("id", id!);

  if (error) {
    const msg = encodeURIComponent(error.message);
    return Response.redirect(
      new URL(`/admin/chapters/${id}/edit?error=${msg}`, request.url),
      302
    );
  }

  return Response.redirect(new URL(`/admin/chapters?book_id=${book_id}`, request.url), 302);
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
  const { error } = await supabase.from("chapters").delete().eq("id", id!);

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }

  return new Response(JSON.stringify({ ok: true }), { status: 200 });
};
