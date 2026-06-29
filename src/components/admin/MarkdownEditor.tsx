import { useState, useCallback } from "react";
import { marked } from "marked";
import { sanitizeHtml } from "@/lib/markdown";

interface MarkdownEditorProps {
  name: string;
  defaultValue?: string;
  className?: string;
}

export function MarkdownEditor({ name, defaultValue = "", className }: MarkdownEditorProps) {
  const [value, setValue] = useState(defaultValue);

  const preview = useCallback(() => {
    try {
      return marked.parse(value) as string;
    } catch {
      return "";
    }
  }, [value]);

  return (
    <div className={`flex gap-4 ${className ?? ""}`}>
      {/* Editor */}
      <div className="flex flex-1 flex-col gap-1">
        <span className="text-xs font-medium text-muted-foreground">Markdown</span>
        <textarea
          value={value}
          onChange={(e) => setValue(e.target.value)}
          className="min-h-64 flex-1 resize-y rounded-md border border-input bg-transparent px-3 py-2 font-mono text-sm outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
          placeholder="# Tytuł lekcji&#10;&#10;Treść lekcji w Markdown…"
          spellCheck={false}
        />
        <input type="hidden" name={name} value={value} />
      </div>

      {/* Preview */}
      <div className="flex flex-1 flex-col gap-1">
        <span className="text-xs font-medium text-muted-foreground">Podgląd</span>
        <div
          className="min-h-64 flex-1 overflow-auto rounded-md border border-border bg-muted/20 px-4 py-3 text-sm [&_blockquote]:border-l-4 [&_blockquote]:border-border [&_blockquote]:pl-4 [&_blockquote]:text-muted-foreground [&_code]:rounded [&_code]:bg-muted [&_code]:px-1 [&_code]:font-mono [&_code]:text-xs [&_h1]:mb-2 [&_h1]:text-xl [&_h1]:font-bold [&_h2]:mb-2 [&_h2]:text-lg [&_h2]:font-semibold [&_h3]:mb-1 [&_h3]:font-semibold [&_li]:ml-4 [&_li]:list-disc [&_ol_li]:list-decimal [&_p]:mb-2 [&_pre]:rounded [&_pre]:bg-muted [&_pre]:p-3 [&_pre_code]:bg-transparent [&_strong]:font-semibold"
          // eslint-disable-next-line react/no-danger
          dangerouslySetInnerHTML={{ __html: value ? sanitizeHtml(preview()) : '<span class="text-muted-foreground">Podgląd pojawi się tutaj…</span>' }}
        />
      </div>
    </div>
  );
}
