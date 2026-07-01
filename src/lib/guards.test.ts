import { describe, expect, it } from "vitest";
import { requireSameOrigin } from "./guards";

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
