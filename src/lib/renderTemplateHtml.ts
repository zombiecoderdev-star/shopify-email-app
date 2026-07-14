// Server-safe (no React) HTML rendering for a template's blocks — used when
// actually sending mail (test-send, campaign send). Mirrors the block-type
// handling in TemplateEditor.tsx's PreviewBlock, but as a pure string
// builder so it can run in an API route. TemplateEditor.tsx itself is
// off-limits (DO NOT TOUCH — templates editor), so this is a parallel,
// self-contained renderer rather than an extraction from it; the two will
// need to be kept in sync by hand if a new block type is ever added.
import { htmlFromDoc, escapeHtml } from "@/lib/tiptapContent";
import type { Block } from "@/components/TemplateEditor";

// Plain string substitution — correct for plain-text contexts (subject
// lines). For HTML contexts, resolve against escapeSampleValues(sample)
// instead (see renderTemplateHtml), since a raw contact name containing
// "&"/"<" would otherwise inject unescaped markup into the email body.
export function resolveTags(text: string, sample: Record<string, string>): string {
  let out = text || "";
  for (const [tag, value] of Object.entries(sample)) {
    out = out.split(tag).join(value);
  }
  return out;
}

function escapeSampleValues(sample: Record<string, string>): Record<string, string> {
  return Object.fromEntries(Object.entries(sample).map(([tag, value]) => [tag, escapeHtml(value)]));
}

// Builds the {{first_name}}/{{last_name}}/{{shop_name}} sample map for a
// real contact — raw values, meant for resolveTags() against plain text
// (e.g. the subject line) or against renderTemplateHtml's internal escaping.
// Falls back the same way the in-app preview does for a missing name, so a
// real send never shows a literal blank.
export function personalizationSample(
  contact: { first_name?: string | null; last_name?: string | null } | null | undefined,
  shopName: string
): Record<string, string> {
  return {
    "{{first_name}}": contact?.first_name || "there",
    "{{last_name}}": contact?.last_name || "",
    "{{shop_name}}": shopName || "Your Shop",
  };
}

function renderBlockHtml(block: Block): string {
  const data = block.data;

  switch (block.type) {
    case "header":
      return `<div style="padding:16px 24px;"><h2 style="margin:0;font-size:${Number(data.fontSize) || 24}px;font-weight:bold;color:#111827;font-family:Arial,Helvetica,sans-serif;">${escapeHtml(data.text || "")}</h2></div>`;

    case "text": {
      const inner = data.content ? htmlFromDoc(data.content) : `<p>${escapeHtml(data.text || "")}</p>`;
      return `<div style="padding:12px 24px;font-size:14px;line-height:1.5;color:#374151;font-family:Arial,Helvetica,sans-serif;">${inner}</div>`;
    }

    case "image":
      return data.url
        ? `<div style="padding:12px 24px;"><img src="${escapeHtml(data.url)}" alt="${escapeHtml(data.alt || "")}" style="max-width:100%;border-radius:6px;display:block;" /></div>`
        : "";

    case "button":
      return `<div style="padding:16px 24px;text-align:center;"><a href="${escapeHtml(data.url || "#")}" target="_blank" rel="noopener noreferrer" style="display:inline-block;padding:10px 22px;border-radius:8px;color:#ffffff;text-decoration:none;font-size:14px;font-weight:600;font-family:Arial,Helvetica,sans-serif;background-color:${escapeHtml(data.color || "#16a34a")};">${escapeHtml(data.label || "Button")}</a></div>`;

    case "divider":
      return `<div style="padding:8px 24px;"><hr style="border:none;border-top:1px solid #e5e7eb;margin:0;" /></div>`;

    case "footer":
      return `<div style="padding:16px 24px;background-color:#f9fafb;border-top:1px solid #f3f4f6;"><p style="margin:0;font-size:11px;line-height:1.5;color:#9ca3af;white-space:pre-wrap;font-family:Arial,Helvetica,sans-serif;">${escapeHtml(data.text || "")}</p></div>`;

    default:
      return "";
  }
}

// Renders a full template (all blocks) to a self-contained HTML email.
// `sample` should be the raw personalizationSample() map — values are
// HTML-escaped internally before substitution, so a contact name containing
// "&"/"<"/etc. can't break the markup.
export function renderTemplateHtml(blocks: Block[], sample: Record<string, string>): string {
  const body = blocks.map(renderBlockHtml).join("");
  const resolved = resolveTags(body, escapeSampleValues(sample));
  return `<!DOCTYPE html>
<html>
  <body style="margin:0;padding:24px 12px;background-color:#f3f4f6;">
    <div style="max-width:600px;margin:0 auto;background-color:#ffffff;border-radius:8px;overflow:hidden;">
      ${resolved}
    </div>
  </body>
</html>`;
}
