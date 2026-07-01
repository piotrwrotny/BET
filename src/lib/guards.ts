/**
 * Cross-origin / CSRF guard for state-changing Astro API routes.
 *
 * Returns a 403 Response when the request does not originate from the same
 * site. Returns `null` when the request passes the check.
 */
export function requireSameOrigin(request: Request): Response | null {
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

interface AdminRoleContext {
  role: "admin" | "student" | null;
}

/**
 * Admin-role guard for Astro API routes.
 *
 * Returns a 403 Response when the caller is not an admin. Returns `null`
 * when the caller is an admin.
 */
export function requireAdminApi(locals: AdminRoleContext): Response | null {
  if (locals.role !== "admin") {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }
  return null;
}

interface AstroLike {
  locals: AdminRoleContext;
  redirect: (path: string) => Response;
}

/**
 * Admin-role guard for Astro pages.
 *
 * Returns a redirect to `/dashboard` when the visitor is not an admin.
 * Returns `null` when the visitor is an admin.
 */
export function requireAdminPage(Astro: AstroLike): Response | null {
  if (Astro.locals.role !== "admin") {
    return Astro.redirect("/dashboard");
  }
  return null;
}
