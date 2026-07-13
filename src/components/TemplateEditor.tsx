"use client";

import { useRef, useState } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import TextAlign from "@tiptap/extension-text-align";
import {
  Heading, Type, Image as ImageIcon, MousePointerClick, Minus, PanelBottom,
  ChevronUp, ChevronDown, Copy, Trash2, Eye, Pencil,
  Bold, Italic, Link as LinkIcon, AlignLeft, AlignCenter, AlignRight,
  Sparkles, X, Loader2,
} from "lucide-react";
import { docFromText, textFromDoc, htmlFromDoc, escapeHtml } from "@/lib/tiptapContent";

export type BlockType = "header" | "text" | "image" | "button" | "divider" | "footer";

export type Block = {
  id: string;
  type: BlockType;
  data: Record<string, any>;
};

type Props = {
  blocks: Block[];
  onChange: (blocks: Block[]) => void;
  shopName: string; // used to resolve {{shop_name}} in preview mode
};

const PERSONALIZATION_TAGS = ["{{first_name}}", "{{last_name}}", "{{shop_name}}"];

const REWRITE_PROMPT_SUGGESTIONS = [
  "Make it shorter",
  "Make it more casual",
  "Make it more persuasive",
  "Add a sense of urgency",
  "Fix grammar and clarity",
  "Make it more formal",
];

const BLOCK_DEFS: { type: BlockType; label: string; icon: React.ReactNode; defaultData: () => Record<string, any> }[] = [
  { type: "header", label: "Header", icon: <Heading size={14} />, defaultData: () => ({ text: "Your Heading", fontSize: 24 }) },
  { type: "text", label: "Text", icon: <Type size={14} />, defaultData: () => ({ content: docFromText("Write something...") }) },
  { type: "image", label: "Image", icon: <ImageIcon size={14} />, defaultData: () => ({ url: "", alt: "" }) },
  { type: "button", label: "Button", icon: <MousePointerClick size={14} />, defaultData: () => ({ label: "Shop Now", url: "", color: "#16a34a" }) },
  { type: "divider", label: "Divider", icon: <Minus size={14} />, defaultData: () => ({}) },
  { type: "footer", label: "Footer", icon: <PanelBottom size={14} />, defaultData: () => ({ text: "You're receiving this because you subscribed to {{shop_name}}. Unsubscribe" }) },
];

function resolveTags(text: string, sample: Record<string, string>) {
  let out = text || "";
  for (const [tag, value] of Object.entries(sample)) {
    out = out.split(tag).join(value);
  }
  return out;
}

export function newId() {
  return typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `blk_${Date.now()}_${Math.random().toString(36).slice(2)}`;
}

export default function TemplateEditor({ blocks, onChange, shopName }: Props) {
  const [preview, setPreview] = useState(false);
  const fieldRefs = useRef<Record<string, HTMLTextAreaElement | HTMLInputElement | null>>({});

  const sample = {
    "{{first_name}}": "John",
    "{{last_name}}": "Doe",
    "{{shop_name}}": shopName || "Your Shop",
  };

  function addBlock(type: BlockType) {
    const def = BLOCK_DEFS.find((d) => d.type === type)!;
    onChange([...blocks, { id: newId(), type, data: def.defaultData() }]);
  }

  function updateBlock(id: string, data: Record<string, any>) {
    onChange(blocks.map((b) => (b.id === id ? { ...b, data: { ...b.data, ...data } } : b)));
  }

  function deleteBlock(id: string) {
    onChange(blocks.filter((b) => b.id !== id));
  }

  function duplicateBlock(id: string) {
    const idx = blocks.findIndex((b) => b.id === id);
    if (idx === -1) return;
    const copy = { ...blocks[idx], id: newId(), data: { ...blocks[idx].data } };
    const next = [...blocks];
    next.splice(idx + 1, 0, copy);
    onChange(next);
  }

  function moveBlock(from: number, to: number) {
    if (to < 0 || to >= blocks.length) return;
    const next = [...blocks];
    const [item] = next.splice(from, 1);
    next.splice(to, 0, item);
    onChange(next);
  }

  function insertTag(fieldKey: string, blockId: string, field: string, tag: string) {
    const currentBlock = blocks.find((b) => b.id === blockId);
    const currentValue: string = currentBlock?.data[field] || "";
    const el = fieldRefs.current[fieldKey];
    const start = el?.selectionStart ?? currentValue.length;
    const end = el?.selectionEnd ?? currentValue.length;
    const next = currentValue.slice(0, start) + tag + currentValue.slice(end);
    updateBlock(blockId, { [field]: next });

    requestAnimationFrame(() => {
      const node = fieldRefs.current[fieldKey];
      if (!node) return;
      node.focus();
      const pos = start + tag.length;
      node.setSelectionRange?.(pos, pos);
    });
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">

      {/* Toolbar */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
        <div className="flex items-center gap-1.5 flex-wrap">
          {BLOCK_DEFS.map((def) => (
            <button
              key={def.type}
              onClick={() => addBlock(def.type)}
              className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 hover:border-gray-300 transition-colors"
            >
              {def.icon}
              {def.label}
            </button>
          ))}
        </div>
        <button
          onClick={() => setPreview((p) => !p)}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors flex-shrink-0 ml-3 border-gray-200 text-gray-600 hover:bg-gray-50"
        >
          {preview ? <Pencil size={13} /> : <Eye size={13} />}
          {preview ? "Edit" : "Preview"}
        </button>
      </div>

      {/* Body */}
      <div className="p-5">
        {preview ? (
          <div className="max-w-[600px] mx-auto bg-white border border-gray-200 rounded-lg overflow-hidden">
            {blocks.length === 0 ? (
              <p className="p-10 text-center text-sm text-gray-300">No blocks yet — switch to Edit to add some.</p>
            ) : (
              blocks.map((b) => <PreviewBlock key={b.id} block={b} sample={sample} />)
            )}
          </div>
        ) : blocks.length === 0 ? (
          <p className="py-10 text-center text-sm text-gray-400">
            No blocks yet. Use the toolbar above to add your first one.
          </p>
        ) : (
          <div className="space-y-3">
            {blocks.map((b, i) => (
              <BlockCard
                key={b.id}
                block={b}
                index={i}
                total={blocks.length}
                shopName={shopName}
                onUpdate={(data) => updateBlock(b.id, data)}
                onDelete={() => deleteBlock(b.id)}
                onDuplicate={() => duplicateBlock(b.id)}
                onMoveUp={() => moveBlock(i, i - 1)}
                onMoveDown={() => moveBlock(i, i + 1)}
                onInsertTag={(field, tag) => insertTag(`${b.id}:${field}`, b.id, field, tag)}
                registerRef={(field, el) => { fieldRefs.current[`${b.id}:${field}`] = el; }}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Editable block card ───────────────────────────────────────────────────

function BlockCard({
  block, index, total, shopName, onUpdate, onDelete, onDuplicate, onMoveUp, onMoveDown, onInsertTag, registerRef,
}: {
  block: Block;
  index: number;
  total: number;
  shopName: string;
  onUpdate: (data: Record<string, any>) => void;
  onDelete: () => void;
  onDuplicate: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onInsertTag: (field: string, tag: string) => void;
  registerRef: (field: string, el: HTMLTextAreaElement | HTMLInputElement | null) => void;
}) {
  const def = BLOCK_DEFS.find((d) => d.type === block.type)!;

  return (
    <div className="border border-gray-200 rounded-lg overflow-hidden">

      {/* Header row */}
      <div className="flex items-center justify-between px-3 py-2 bg-gray-50 border-b border-gray-100">
        <div className="flex items-center gap-1.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">
          {def.icon}
          {def.label}
        </div>
        <div className="flex items-center gap-0.5">
          <IconBtn title="Move up" onClick={onMoveUp} disabled={index === 0}><ChevronUp size={13} /></IconBtn>
          <IconBtn title="Move down" onClick={onMoveDown} disabled={index === total - 1}><ChevronDown size={13} /></IconBtn>
          <IconBtn title="Duplicate" onClick={onDuplicate}><Copy size={13} /></IconBtn>
          <IconBtn title="Delete" onClick={onDelete} className="hover:bg-red-50 hover:text-red-500"><Trash2 size={13} /></IconBtn>
        </div>
      </div>

      {/* Fields */}
      <div className="p-3 space-y-2.5">
        {block.type === "header" && (
          <>
            <TextField
              value={block.data.text || ""}
              onChange={(v) => onUpdate({ text: v })}
              inputRef={(el) => registerRef("text", el)}
              onInsertTag={(tag) => onInsertTag("text", tag)}
              placeholder="Your Heading"
            />
            <div className="flex items-center gap-2">
              <label className="text-xs text-gray-500">Font size</label>
              <input
                type="number"
                min={12}
                max={48}
                value={block.data.fontSize ?? 24}
                onChange={(e) => onUpdate({ fontSize: Number(e.target.value) })}
                className="w-20 px-2 py-1 text-sm border border-gray-200 rounded-md bg-white focus:outline-none focus:ring-2 focus:ring-green-500"
              />
              <span className="text-xs text-gray-400">px</span>
            </div>
          </>
        )}

        {block.type === "text" && (
          <TipTapTextBlock
            key={block.id}
            block={block}
            shopName={shopName}
            onUpdate={onUpdate}
          />
        )}

        {block.type === "image" && (
          <>
            <input
              type="text"
              value={block.data.url || ""}
              onChange={(e) => onUpdate({ url: e.target.value })}
              placeholder="https://example.com/image.jpg"
              className="w-full px-3 py-2 text-sm border border-gray-200 bg-gray-50 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 focus:bg-white transition-colors"
            />
            <input
              type="text"
              value={block.data.alt || ""}
              onChange={(e) => onUpdate({ alt: e.target.value })}
              placeholder="Alt text"
              className="w-full px-3 py-2 text-sm border border-gray-200 bg-gray-50 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 focus:bg-white transition-colors"
            />
          </>
        )}

        {block.type === "button" && (
          <div className="grid grid-cols-3 gap-2">
            <input
              type="text"
              value={block.data.label || ""}
              onChange={(e) => onUpdate({ label: e.target.value })}
              placeholder="Button label"
              className="col-span-2 px-3 py-2 text-sm border border-gray-200 bg-gray-50 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 focus:bg-white transition-colors"
            />
            <input
              type="color"
              value={block.data.color || "#16a34a"}
              onChange={(e) => onUpdate({ color: e.target.value })}
              className="w-full h-[34px] border border-gray-200 rounded-lg cursor-pointer"
              title="Button color"
            />
            <input
              type="text"
              value={block.data.url || ""}
              onChange={(e) => onUpdate({ url: e.target.value })}
              placeholder="https://example.com"
              className="col-span-3 px-3 py-2 text-sm border border-gray-200 bg-gray-50 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 focus:bg-white transition-colors"
            />
          </div>
        )}

        {block.type === "divider" && (
          <p className="text-xs text-gray-400 italic">No settings — renders as a plain horizontal divider.</p>
        )}

        {block.type === "footer" && (
          <TextArea
            value={block.data.text || ""}
            onChange={(v) => onUpdate({ text: v })}
            inputRef={(el) => registerRef("text", el)}
            onInsertTag={(tag) => onInsertTag("text", tag)}
            placeholder="Unsubscribe line..."
          />
        )}
      </div>
    </div>
  );
}

// ─── Shared text field + textarea with personalization chips ──────────────

function PersonalizationChips({ onInsert }: { onInsert: (tag: string) => void }) {
  return (
    <div className="flex items-center gap-1 flex-wrap">
      {PERSONALIZATION_TAGS.map((tag) => (
        <button
          key={tag}
          type="button"
          onClick={() => onInsert(tag)}
          className="px-1.5 py-0.5 text-[10px] font-mono text-blue-600 bg-blue-50 border border-blue-200 rounded hover:bg-blue-100 transition-colors"
        >
          {tag}
        </button>
      ))}
    </div>
  );
}

function TextField({ value, onChange, inputRef, onInsertTag, placeholder }: {
  value: string;
  onChange: (v: string) => void;
  inputRef: (el: HTMLInputElement | null) => void;
  onInsertTag: (tag: string) => void;
  placeholder?: string;
}) {
  return (
    <div className="space-y-1">
      <input
        ref={inputRef}
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full px-3 py-2 text-sm border border-gray-200 bg-gray-50 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 focus:bg-white transition-colors"
      />
      <PersonalizationChips onInsert={onInsertTag} />
    </div>
  );
}

function TextArea({ value, onChange, inputRef, onInsertTag, placeholder }: {
  value: string;
  onChange: (v: string) => void;
  inputRef: (el: HTMLTextAreaElement | null) => void;
  onInsertTag: (tag: string) => void;
  placeholder?: string;
}) {
  return (
    <div className="space-y-1">
      <textarea
        ref={inputRef}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        rows={3}
        className="w-full px-3 py-2 text-sm border border-gray-200 bg-gray-50 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 focus:bg-white transition-colors resize-none"
      />
      <PersonalizationChips onInsert={onInsertTag} />
    </div>
  );
}

function IconBtn({ children, onClick, title, disabled, className }: {
  children: React.ReactNode; onClick: () => void; title: string; disabled?: boolean; className?: string;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      disabled={disabled}
      className={`w-6 h-6 flex items-center justify-center rounded-md text-gray-400 transition-colors disabled:opacity-30 disabled:cursor-not-allowed hover:bg-gray-200 hover:text-gray-700 ${className || ""}`}
    >
      {children}
    </button>
  );
}

// ─── TipTap-backed text block ──────────────────────────────────────────────

function ToolbarBtn({ active, onClick, title, children }: {
  active?: boolean; onClick: () => void; title: string; children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={title}
      onMouseDown={(e) => e.preventDefault()} // keep editor selection/focus on click
      onClick={onClick}
      className={`w-6 h-6 flex items-center justify-center rounded-md transition-colors ${
        active ? "bg-gray-800 text-white" : "text-gray-500 hover:bg-gray-200"
      }`}
    >
      {children}
    </button>
  );
}

function TipTapTextBlock({ block, shopName, onUpdate }: {
  block: Block;
  shopName: string;
  onUpdate: (data: Record<string, any>) => void;
}) {
  const [showAI, setShowAI] = useState(false);
  const initialContent = block.data.content ?? docFromText(block.data.text || "");

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ link: { openOnClick: false, autolink: false } }),
      TextAlign.configure({ types: ["paragraph"] }),
    ],
    content: initialContent,
    immediatelyRender: false,
    onUpdate: ({ editor }) => onUpdate({ content: editor.getJSON() }),
  });

  function insertTag(tag: string) {
    editor?.chain().focus().insertContent(tag).run();
  }

  function toggleLink() {
    if (!editor) return;
    const current = editor.getAttributes("link").href || "";
    const url = window.prompt("Link URL", current);
    if (url === null) return;
    if (url === "") {
      editor.chain().focus().unsetLink().run();
    } else {
      editor.chain().focus().setLink({ href: url }).run();
    }
  }

  if (!editor) return null;

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between flex-wrap gap-1.5">
        <div className="flex items-center gap-0.5 border border-gray-200 rounded-lg p-0.5 bg-gray-50">
          <ToolbarBtn active={editor.isActive("bold")} onClick={() => editor.chain().focus().toggleBold().run()} title="Bold">
            <Bold size={13} />
          </ToolbarBtn>
          <ToolbarBtn active={editor.isActive("italic")} onClick={() => editor.chain().focus().toggleItalic().run()} title="Italic">
            <Italic size={13} />
          </ToolbarBtn>
          <ToolbarBtn active={editor.isActive("link")} onClick={toggleLink} title="Link">
            <LinkIcon size={13} />
          </ToolbarBtn>
          <span className="w-px h-4 bg-gray-200 mx-0.5" />
          <ToolbarBtn active={editor.isActive({ textAlign: "left" })} onClick={() => editor.chain().focus().setTextAlign("left").run()} title="Align left">
            <AlignLeft size={13} />
          </ToolbarBtn>
          <ToolbarBtn active={editor.isActive({ textAlign: "center" })} onClick={() => editor.chain().focus().setTextAlign("center").run()} title="Align center">
            <AlignCenter size={13} />
          </ToolbarBtn>
          <ToolbarBtn active={editor.isActive({ textAlign: "right" })} onClick={() => editor.chain().focus().setTextAlign("right").run()} title="Align right">
            <AlignRight size={13} />
          </ToolbarBtn>
        </div>

        <button
          type="button"
          onClick={() => setShowAI(true)}
          className="flex items-center gap-1 px-2 py-1 text-[11px] font-medium text-purple-600 bg-purple-50 border border-purple-200 rounded-lg hover:bg-purple-100 transition-colors"
        >
          <Sparkles size={12} /> AI rewrite
        </button>
      </div>

      {showAI && (
        <AIRewriteModal
          shopName={shopName}
          existingContent={textFromDoc(editor.getJSON())}
          onClose={() => setShowAI(false)}
          onResult={(text) => {
            const doc = docFromText(text);
            editor.commands.setContent(doc);
            onUpdate({ content: doc });
          }}
        />
      )}

      <div className="w-full px-3 py-2 text-sm border border-gray-200 bg-gray-50 rounded-lg focus-within:outline-none focus-within:ring-2 focus-within:ring-green-500 focus-within:bg-white transition-colors [&_.tiptap]:outline-none [&_.tiptap_p]:m-0 [&_.tiptap_p+p]:mt-2">
        <EditorContent editor={editor} />
      </div>

      <PersonalizationChips onInsert={insertTag} />
    </div>
  );
}

function AIRewriteModal({ shopName, existingContent, onClose, onResult }: {
  shopName: string;
  existingContent: string;
  onClose: () => void;
  onResult: (text: string) => void;
}) {
  const [prompt, setPrompt] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleGenerate() {
    if (!prompt.trim() || loading) return;
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/shopify/templates/ai-generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt, mode: "block", blockType: "text", existingContent, shopName }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "AI generation failed");
        return;
      }
      onResult(data.text);
      onClose();
    } catch {
      setError("Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4"
      onClick={(e) => e.target === e.currentTarget && !loading && onClose()}
    >
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="text-base font-bold text-gray-900 flex items-center gap-1.5">
            <Sparkles size={15} className="text-purple-600" /> AI rewrite
          </h2>
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-gray-100 disabled:opacity-50"
          >
            <X size={15} className="text-gray-400" />
          </button>
        </div>

        <div className="px-6 py-5 space-y-2">
          <label className="block text-xs font-medium text-gray-600 mb-1">Prompt</label>
          <textarea
            autoFocus
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="e.g. make this more casual"
            rows={3}
            className="w-full px-3 py-2 text-sm border border-gray-200 bg-gray-50 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-400 focus:bg-white transition-colors resize-none"
          />
          <div className="flex flex-wrap gap-1.5 pt-1">
            {REWRITE_PROMPT_SUGGESTIONS.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setPrompt(s)}
                className="px-2 py-1 text-[11px] text-gray-600 bg-gray-50 border border-gray-200 rounded-full hover:bg-purple-50 hover:border-purple-200 hover:text-purple-700 transition-colors"
              >
                {s}
              </button>
            ))}
          </div>
          {error && <p className="text-xs text-red-500">{error}</p>}
        </div>

        <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-gray-100">
          <button
            onClick={onClose}
            disabled={loading}
            className="px-4 py-2 text-sm text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-50 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleGenerate}
            disabled={loading || !prompt.trim()}
            className="flex items-center gap-2 px-4 py-2 bg-purple-600 text-white text-sm font-medium rounded-lg hover:bg-purple-700 disabled:opacity-50 transition-colors"
          >
            {loading ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
            {loading ? "Generating..." : "Generate"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Preview rendering ──────────────────────────────────────────────────────

function PreviewBlock({ block, sample }: { block: Block; sample: Record<string, string> }) {
  const data = block.data;

  if (block.type === "header") {
    return (
      <div className="px-6 py-4">
        <h2 style={{ fontSize: `${data.fontSize ?? 24}px` }} className="font-bold text-gray-900 m-0">
          {resolveTags(data.text, sample)}
        </h2>
      </div>
    );
  }

  if (block.type === "text") {
    const html = data.content
      ? htmlFromDoc(data.content)
      : `<p>${escapeHtml(data.text || "")}</p>`;
    return (
      <div
        className="px-6 py-3 text-sm text-gray-700 [&_p]:m-0 [&_p+p]:mt-2"
        dangerouslySetInnerHTML={{ __html: resolveTags(html, sample) }}
      />
    );
  }

  if (block.type === "image") {
    return data.url ? (
      <div className="px-6 py-3">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={data.url} alt={data.alt || ""} className="max-w-full rounded-md" />
      </div>
    ) : (
      <div className="px-6 py-6 text-center text-xs text-gray-300 border-y border-dashed border-gray-200">
        Image block — no URL set
      </div>
    );
  }

  if (block.type === "button") {
    return (
      <div className="px-6 py-4 text-center">
        <span
          className="inline-block px-5 py-2.5 rounded-lg text-sm font-medium text-white"
          style={{ backgroundColor: data.color || "#16a34a" }}
        >
          {data.label || "Button"}
        </span>
      </div>
    );
  }

  if (block.type === "divider") {
    return (
      <div className="px-6 py-2">
        <hr className="border-gray-200" />
      </div>
    );
  }

  if (block.type === "footer") {
    return (
      <div className="px-6 py-4 bg-gray-50 border-t border-gray-100">
        <p className="text-[11px] text-gray-400 whitespace-pre-wrap m-0">{resolveTags(data.text, sample)}</p>
      </div>
    );
  }

  return null;
}
