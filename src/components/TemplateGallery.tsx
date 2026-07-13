"use client";

import { useEffect, useState } from "react";
import { Sparkles, X, Loader2, FileText, FlaskConical } from "lucide-react";
import { starterTemplates } from "@/config/starterTemplates";
import { newId, type Block } from "./TemplateEditor";

type Props = {
  shopName: string;
  onUse: (subject: string, blocks: Block[]) => void;
};

const PROMPT_SUGGESTIONS = [
  "Black Friday sale, 20% off, urgent tone",
  "Welcome a new subscriber, friendly and warm",
  "Abandoned cart reminder, gentle nudge",
  "New product launch, exciting and bold",
  "Monthly newsletter roundup, casual tone",
  "Order follow-up asking for a review",
];

export default function TemplateGallery({ shopName, onUse }: Props) {
  const [showAIModal, setShowAIModal] = useState(false);

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-base font-semibold text-gray-900">Start from a template</h2>
          <p className="text-sm text-gray-400 mt-0.5">Pick a starting point — everything stays editable before you save.</p>
        </div>
        <button
          onClick={() => setShowAIModal(true)}
          className="flex items-center gap-1.5 px-3.5 py-2 text-sm font-medium text-white bg-purple-600 rounded-lg hover:bg-purple-700 transition-colors flex-shrink-0"
        >
          <Sparkles size={14} /> Generate with AI
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {starterTemplates.map((t) => (
          <div key={t.id} className="bg-white border border-gray-200 rounded-xl overflow-hidden flex flex-col">
            <div className="h-24 bg-gray-50 border-b border-gray-100 flex items-center justify-center">
              <FileText size={22} className="text-gray-300" />
            </div>
            <div className="p-4 flex flex-col gap-2 flex-1">
              <h3 className="text-sm font-semibold text-gray-900">{t.name}</h3>
              <p className="text-xs text-gray-400 flex-1">{t.thumbnail_description}</p>
              <button
                onClick={() => onUse(t.subject, t.blocks.map((b) => ({ id: newId(), type: b.type, data: b.data })))}
                className="mt-1 px-3 py-1.5 text-xs font-medium text-green-700 bg-green-50 border border-green-200 rounded-lg hover:bg-green-100 transition-colors"
              >
                Use this template
              </button>
            </div>
          </div>
        ))}

        <button
          onClick={() => onUse("", [])}
          className="bg-white border border-dashed border-gray-300 rounded-xl flex flex-col items-center justify-center gap-1.5 py-10 text-gray-400 hover:border-gray-400 hover:text-gray-600 transition-colors"
        >
          <FileText size={20} />
          <span className="text-sm font-medium">Start blank</span>
        </button>
      </div>

      {showAIModal && (
        <AIGenerateModal
          shopName={shopName}
          onClose={() => setShowAIModal(false)}
          onGenerated={(subject, blocks) => {
            setShowAIModal(false);
            onUse(subject, blocks);
          }}
        />
      )}
    </div>
  );
}

function AIGenerateModal({ shopName, onClose, onGenerated }: {
  shopName: string;
  onClose: () => void;
  onGenerated: (subject: string, blocks: Block[]) => void;
}) {
  const [prompt, setPrompt] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [devProvider, setDevProvider] = useState<string | null>(null);

  // AI_PROVIDER has no NEXT_PUBLIC_ prefix, so it isn't readable client-side —
  // ask the route instead. Only bother in dev; never shown in production
  // regardless of what this returns.
  useEffect(() => {
    if (process.env.NODE_ENV !== "development") return;
    fetch("/api/shopify/templates/ai-generate")
      .then((res) => res.json())
      .then((data) => setDevProvider(data.provider))
      .catch(() => {});
  }, []);

  const showDevBanner = process.env.NODE_ENV === "development" && devProvider === "gemini";

  async function handleGenerate() {
    if (!prompt.trim() || loading) return;
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/shopify/templates/ai-generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt, mode: "full", shopName }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "AI generation failed");
        return;
      }
      const blocks: Block[] = (data.blocks || []).map((b: { type: Block["type"]; data: Record<string, any> }) => ({
        id: newId(),
        type: b.type,
        data: b.data,
      }));
      onGenerated(data.subject || "", blocks);
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
          <div>
            <h2 className="text-base font-bold text-gray-900 flex items-center gap-1.5">
              <Sparkles size={15} className="text-purple-600" /> Generate with AI
            </h2>
            <p className="text-xs text-gray-400 mt-0.5">Describe the email — you can still edit everything after.</p>
          </div>
          <button onClick={onClose} disabled={loading} className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-gray-100 disabled:opacity-50">
            <X size={15} className="text-gray-400" />
          </button>
        </div>

        {showDevBanner && (
          <div className="flex items-center gap-1.5 mx-6 mt-4 px-3 py-2 text-xs font-medium text-amber-700 bg-amber-50 border border-amber-200 rounded-lg">
            <FlaskConical size={13} /> Testing mode: Gemini
          </div>
        )}

        <div className="px-6 py-5 space-y-2">
          <label className="block text-xs font-medium text-gray-600 mb-1">Prompt</label>
          <textarea
            autoFocus
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="e.g. Black Friday sale, 20% off, urgent tone"
            rows={4}
            className="w-full px-3 py-2 text-sm border border-gray-200 bg-gray-50 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-400 focus:bg-white transition-colors resize-none"
          />
          <div className="flex flex-wrap gap-1.5 pt-1">
            {PROMPT_SUGGESTIONS.map((s) => (
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
