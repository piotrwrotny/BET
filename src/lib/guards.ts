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
