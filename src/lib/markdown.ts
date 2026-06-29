import { filterXSS } from "xss";

export function sanitizeHtml(html: string): string {
  return filterXSS(html, {
    stripIgnoreTag: true,
    stripIgnoreTagBody: ["script"],
  });
}
