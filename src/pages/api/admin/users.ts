import type { APIRoute } from "astro";
import { getStudentsWithAccess } from "@/lib/services/user-admin";

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

export const GET: APIRoute = async ({ request, locals }) => {
  if (locals.role !== "admin") {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const csrf = requireSameOrigin(request);
  if (csrf) return csrf;

  try {
    const users = await getStudentsWithAccess();
    return Response.json({ users }, { status: 200 });
  } catch (error) {
    console.error("Failed to load admin users:", error);
    return Response.json({ error: "Failed to load users" }, { status: 500 });
  }
};
