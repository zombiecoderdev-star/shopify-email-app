"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { X, Loader2, Tag, Plus } from "lucide-react";
import { normalizeTag, normalizeTags } from "@/lib/tags";

type Props = {
  shop: string;
  // Pass either a single contact or multiple selected IDs
  contactIds: string[];
  customerLabel: string; // e.g. "John Doe" or "5 customers"
  currentTags?: string[]; // shown as removable chips when editing a single contact
  onClose: () => void;
  // What was actually changed, so the parent can update its local state
  // without a full reload.
  onSuccess: (addedTags: string[], removedTags: string[]) => void;
  showToast: (msg: string, opts?: { isError?: boolean }) => void;
};

// App-only tags — nothing here is synced back to Shopify. The customer
// sync/webhook merges Shopify tags INTO this list, never the reverse.

export default function ManageTagsModal({
  shop,
  contactIds,
  customerLabel,
  currentTags = [],
  onClose,
  onSuccess,
  showToast,
}: Props) {
  const isBulk = contactIds.length > 1;
  const originalTags = useMemo(() => normalizeTags(currentTags), [currentTags]);

  // Single mode edits the full tag list; bulk mode only collects tags to add.
  const [tags, setTags] = useState<string[]>(isBulk ? [] : originalTags);
  const [input, setInput] = useState("");
  const [allTags, setAllTags] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetch(`/api/shopify/tags?shop=${shop}`)
      .then((res) => res.json())
      .then((data) => setAllTags(data.tags || []))
      .catch(() => {});
  }, [shop]);

  const query = normalizeTag(input);
  const suggestions = query
    ? allTags.filter((t) => t.includes(query) && !tags.includes(t)).slice(0, 6)
    : [];
  const exactMatchExists = allTags.includes(query);

  function addTag(raw: string) {
    const t = normalizeTag(raw);
    if (!t) return;
    setTags((prev) => (prev.includes(t) ? prev : [...prev, t]));
    setInput("");
    inputRef.current?.focus();
  }

  function removeTag(t: string) {
    setTags((prev) => prev.filter((x) => x !== t));
  }

  const addedTags = tags.filter((t) => !originalTags.includes(t));
  const removedTags = isBulk ? [] : originalTags.filter((t) => !tags.includes(t));

  async function handleSubmit() {
    if (addedTags.length === 0 && removedTags.length === 0) {
      showToast("No tag changes made", { isError: true });
      return;
    }

    setSaving(true);
    try {
      const res = await fetch("/api/shopify/contacts/tags", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          shop,
          contactIds,
          addTags: addedTags,
          removeTags: removedTags,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        showToast(data.error || "Failed to update tags", { isError: true });
        return;
      }

      showToast(
        isBulk
          ? `Tags added to ${data.updated} customers ✅`
          : "Tags updated ✅"
      );
      onSuccess(addedTags, removedTags);
      onClose();
    } catch {
      showToast("Something went wrong", { isError: true });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div>
            <h2 className="text-base font-bold text-gray-900">Manage Tags</h2>
            <p className="text-xs text-gray-400 mt-0.5">
              {isBulk ? `Applying to ${contactIds.length} contacts` : customerLabel}
            </p>
          </div>
          <button
            onClick={onClose}
            className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-gray-100"
          >
            <X size={15} className="text-gray-400" />
          </button>
        </div>

        <div className="px-6 py-5 space-y-4">

          {/* Current / staged tags as removable chips */}
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
              {isBulk ? "Tags to add" : "Tags"}
            </p>
            {tags.length === 0 ? (
              <p className="text-xs text-gray-400">
                {isBulk ? "No tags staged yet — add some below." : "This contact has no tags yet."}
              </p>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {tags.map((t) => (
                  <span
                    key={t}
                    className="inline-flex items-center gap-1 pl-2 pr-1 py-0.5 bg-blue-50 text-blue-700 text-xs font-medium rounded-full border border-blue-100"
                  >
                    <Tag size={10} />
                    {t}
                    <button
                      onClick={() => removeTag(t)}
                      title={`Remove "${t}"`}
                      className="w-4 h-4 flex items-center justify-center rounded-full hover:bg-blue-100"
                    >
                      <X size={10} />
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Input + autocomplete */}
          <div className="relative">
            <label className="block text-xs font-medium text-gray-600 mb-1">Add a tag</label>
            <input
              ref={inputRef}
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addTag(input);
                }
              }}
              placeholder="Type to search or create — Enter to add"
              className="w-full px-3 py-2 text-sm border border-gray-200 bg-gray-50 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 focus:bg-white transition-colors"
            />
            {query && (
              <div className="absolute left-0 right-0 top-full mt-1 z-10 bg-white border border-gray-200 rounded-lg shadow-lg overflow-hidden">
                {suggestions.map((t) => (
                  <button
                    key={t}
                    onClick={() => addTag(t)}
                    className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 text-left transition-colors"
                  >
                    <Tag size={12} className="text-gray-400" /> {t}
                  </button>
                ))}
                {!exactMatchExists && !tags.includes(query) && (
                  <button
                    onClick={() => addTag(query)}
                    className="w-full flex items-center gap-2 px-3 py-2 text-sm text-green-700 hover:bg-green-50 text-left transition-colors"
                  >
                    <Plus size={12} /> Create &quot;{query}&quot;
                  </button>
                )}
              </div>
            )}
            <p className="text-[11px] text-gray-400 mt-1.5">
              Tags are lowercase and app-only — they are not synced back to Shopify.
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-gray-100">
          <button
            onClick={onClose}
            disabled={saving}
            className="px-4 py-2 text-sm text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={saving}
            className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white text-sm font-medium rounded-lg hover:bg-green-700 disabled:opacity-50"
          >
            {saving && <Loader2 size={14} className="animate-spin" />}
            {saving ? "Saving..." : "Save Tags"}
          </button>
        </div>
      </div>
    </div>
  );
}
