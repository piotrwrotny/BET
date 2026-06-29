import { test as setup, type APIRequestContext } from "@playwright/test";
import fs from "fs";
import path from "path";

const ADMIN_AUTH_FILE = "playwright/.auth/admin.json";
const STUDENT_AUTH_FILE = "playwright/.auth/student.json";

interface ParsedCookie {
  name: string;
  value: string;
  domain: string;
  path: string;
  httpOnly: boolean;
  secure: boolean;
  sameSite: "Lax" | "Strict" | "None";
  expires: number;
}

function parseSetCookie(header: string): ParsedCookie {
  const segments = header.split(";").map((segment) => segment.trim());
  const [name, ...valueParts] = segments[0].split("=");
  const value = valueParts.join("=");

  let cookiePath = "/";
  let httpOnly = false;
  let secure = false;
  let sameSite: "Lax" | "Strict" | "None" = "Lax";
  let maxAge: number | undefined;

  for (let i = 1; i < segments.length; i++) {
    const segment = segments[i];
    const separatorIndex = segment.indexOf("=");
    const key = separatorIndex >= 0 ? segment.slice(0, separatorIndex).trim().toLowerCase() : segment.toLowerCase();
    const val = separatorIndex >= 0 ? segment.slice(separatorIndex + 1).trim() : "";

    if (key === "path") cookiePath = val;
    else if (key === "httponly") httpOnly = true;
    else if (key === "secure") secure = true;
    else if (key === "samesite" && val) sameSite = val as "Lax" | "Strict" | "None";
    // samesite value may be empty when attribute is present without value
    else if (key === "max-age") maxAge = Number(val);
  }

  return {
    name: name.trim(),
    value: decodeURIComponent(value.trim()),
    domain: "localhost",
    path: cookiePath,
    httpOnly,
    secure,
    sameSite,
    expires: maxAge ? Date.now() / 1000 + maxAge : -1,
  };
}

async function signInViaApiAndSave(request: APIRequestContext, email: string, password: string, storagePath: string) {
  const response = await request.post("http://localhost:4321/api/auth/signin", {
    form: { email, password },
    headers: {
      Origin: "http://localhost:4321",
      Referer: "http://localhost:4321/auth/signin",
    },
    maxRedirects: 0,
  });

  const rawCookies = response.headers()["set-cookie"];
  if (!rawCookies) {
    throw new Error(`No Set-Cookie header for ${email}`);
  }

  const headers = Array.isArray(rawCookies) ? rawCookies : [rawCookies];
  const cookies = headers.map(parseSetCookie);

  await fs.promises.mkdir(path.dirname(storagePath), { recursive: true });
  await fs.promises.writeFile(storagePath, JSON.stringify({ cookies, origins: [] }, null, 2));
}

setup("authenticate as admin", async ({ request }) => {
  await signInViaApiAndSave(request, "admin@bet.local", "admin-pass", ADMIN_AUTH_FILE);
});

setup("authenticate as student", async ({ request }) => {
  await signInViaApiAndSave(request, "student@bet.local", "student-pass", STUDENT_AUTH_FILE);
});
