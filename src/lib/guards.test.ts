import { describe, expect, it } from "vitest";
import { requireAdminApi, requireAdminPage, requireSameOrigin } from "./guards";

function request(headers: Record<string, string>): Request {
  return new Request("https://example.com/api/admin/users", { headers });
}

describe("requireSameOrigin", () => {
  it("returns null for sec-fetch-site: same-origin", () => {
    const result = requireSameOrigin(request({ "sec-fetch-site": "same-origin" }));
    expect(result).toBeNull();
  });

  it("returns null when origin matches the request origin", () => {
    const result = requireSameOrigin(request({ origin: "https://example.com" }));
    expect(result).toBeNull();
  });

  it("returns null when origin is absent but referer matches", () => {
    const result = requireSameOrigin(request({ referer: "https://example.com/admin/users" }));
    expect(result).toBeNull();
  });

  it("returns 403 for a cross-origin request", () => {
    const result = requireSameOrigin(request({ origin: "https://evil.com" }));
    expect(result).not.toBeNull();
    expect(result?.status).toBe(403);
  });

  it("returns 403 when no origin/referer headers are present", () => {
    const result = requireSameOrigin(request({}));
    expect(result).not.toBeNull();
    expect(result?.status).toBe(403);
  });

  it("returns 403 for sec-fetch-site: cross-site", () => {
    const result = requireSameOrigin(request({ "sec-fetch-site": "cross-site" }));
    expect(result).not.toBeNull();
    expect(result?.status).toBe(403);
  });
});

describe("requireAdminApi", () => {
  it("returns null for an admin role", () => {
    const result = requireAdminApi({ role: "admin" });
    expect(result).toBeNull();
  });

  it("returns 403 for a student role", async () => {
    const result = requireAdminApi({ role: "student" });
    expect(result).not.toBeNull();
    expect(result?.status).toBe(403);
    await expect(result?.json()).resolves.toEqual({ error: "Forbidden" });
  });

  it("returns 403 when role is null", () => {
    const result = requireAdminApi({ role: null });
    expect(result).not.toBeNull();
    expect(result?.status).toBe(403);
  });
});

describe("requireAdminPage", () => {
  const fakeAstro = (role: "admin" | "student" | null) => ({
    locals: { role },
    redirect: (path: string) => new Response(null, { status: 302, headers: { location: path } }),
  });

  it("returns null for an admin role", () => {
    const result = requireAdminPage(fakeAstro("admin"));
    expect(result).toBeNull();
  });

  it("redirects to /dashboard for a student role", () => {
    const result = requireAdminPage(fakeAstro("student"));
    expect(result).not.toBeNull();
    expect(result?.status).toBe(302);
    expect(result?.headers.get("location")).toBe("/dashboard");
  });

  it("redirects to /dashboard when role is null", () => {
    const result = requireAdminPage(fakeAstro(null));
    expect(result).not.toBeNull();
    expect(result?.headers.get("location")).toBe("/dashboard");
  });
});
