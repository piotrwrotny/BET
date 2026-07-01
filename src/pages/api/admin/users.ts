import type { APIRoute } from "astro";
import { requireSameOrigin } from "@/lib/guards";
import { logServerError } from "@/lib/logger";
import { getStudentsWithAccess } from "@/lib/services/user-admin";

export const prerender = false;

function parsePagination(searchParams: URLSearchParams): { page: number; perPage: number } {
  const rawPage = parseInt(searchParams.get("page") ?? "1", 10);
  const rawPerPage = parseInt(searchParams.get("per_page") ?? "20", 10);
  return {
    page: Number.isFinite(rawPage) && rawPage > 0 ? rawPage : 1,
    perPage: Number.isFinite(rawPerPage) && rawPerPage > 0 && rawPerPage <= 100 ? rawPerPage : 20,
  };
}

export const GET: APIRoute = async ({ request, locals }) => {
  if (locals.role !== "admin") {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const csrf = requireSameOrigin(request);
  if (csrf) return csrf;

  const { page, perPage } = parsePagination(new URL(request.url).searchParams);

  try {
    const { users, hasNextPage } = await getStudentsWithAccess({ page, perPage });
    return Response.json({ users, page, perPage, hasNextPage }, { status: 200 });
  } catch (error) {
    logServerError("Failed to load admin users:", error);
    return Response.json({ error: "Failed to load users" }, { status: 500 });
  }
};
