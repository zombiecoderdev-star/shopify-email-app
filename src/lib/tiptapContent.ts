// Helpers for the TipTap-backed "text" block. TipTap stores rich text as JSON
// (editor.getJSON()) so it stays consistent with the JSONB `content` column —
// these convert that JSON to/from plain text (AI prompts, legacy blocks) and
// to HTML (preview/send rendering only).
import type { JSONContent } from "@tiptap/core";

export function docFromText(text: string): JSONContent {
  const lines = (text || "").split("\n");
  return {
    type: "doc",
    content: lines.map((line) => ({
      type: "paragraph",
      content: line ? [{ type: "text", text: line }] : [],
    })),
  };
}

export function textFromDoc(doc: JSONContent | undefined | null): string {
  if (!doc?.content) return "";
  return doc.content
    .map((node) => (node.content || []).map((n) => n.text || "").join(""))
    .join("\n");
}

export function escapeHtml(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function renderMarks(text: string, marks: JSONContent["marks"]) {
  let html = escapeHtml(text);
  for (const mark of marks || []) {
    if (mark.type === "bold") html = `<strong>${html}</strong>`;
    else if (mark.type === "italic") html = `<em>${html}</em>`;
    else if (mark.type === "link") {
      const href = escapeHtml(String(mark.attrs?.href || ""));
      html = `<a href="${href}" target="_blank" rel="noopener noreferrer">${html}</a>`;
    }
  }
  return html;
}

// Converts TipTap JSON (editor.getJSON()) to an HTML string for preview/send
// rendering only — the stored content stays JSON.
export function htmlFromDoc(doc: JSONContent | undefined | null): string {
  if (!doc?.content) return "";
  return doc.content
    .map((node) => {
      if (node.type === "paragraph") {
        const align = node.attrs?.textAlign;
        const style = align && align !== "left" ? ` style="text-align:${align}"` : "";
        const inner = (node.content || [])
          .map((child) =>
            child.type === "hardBreak" ? "<br>" : renderMarks(child.text || "", child.marks)
          )
          .join("");
        return `<p${style}>${inner || "<br>"}</p>`;
      }
      return "";
    })
    .join("");
}
