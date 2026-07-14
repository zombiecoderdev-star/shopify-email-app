"use client";

import { useState } from "react";
import { X, Send, Loader2 } from "lucide-react";

type Props = {
  shop: string;
  // Exactly one of these: templateId tests a saved template
  // (/api/shopify/templates/test-send), campaignId tests a campaign's
  // rendered email (/api/shopify/campaigns/[id]/test-send — its own subject
  // + template, no status/recipients/credits side effects).
  templateId?: string;
  campaignId?: string;
  onClose: () => void;
  showToast: (msg: string, opts?: { isError?: boolean }) => void;
};

// Sends one real email through the configured ESP (AWS SES). Subject to SES
// sandbox restrictions — sends to unverified addresses fail until production
// access is granted (see HANDOFF.md's ESP section).
export default function TestSendModal({ shop, templateId, campaignId, onClose, showToast }: Props) {
  const [email, setEmail] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit() {
    if (!email) { setError("Enter an email address"); return; }
    setError("");
    setSending(true);
    try {
      const res = campaignId
        ? await fetch(`/api/shopify/campaigns/${campaignId}/test-send`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ shop, email }),
          })
        : await fetch("/api/shopify/templates/test-send", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ shop, template_id: templateId, test_email: email }),
          });
      const data = await res.json();
      if (res.ok) {
        showToast(data.message);
        onClose();
      } else {
        setError(data.error || "Test send failed");
      }
    } catch {
      setError("Something went wrong");
    } finally {
      setSending(false);
    }
  }

  return (
    <div
      className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm">

        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div>
            <h2 className="text-base font-bold text-gray-900">Send Test Email</h2>
            <p className="text-xs text-gray-400 mt-0.5">
              Sends one real email via the configured ESP — in SES sandbox mode the address must be verified.
            </p>
          </div>
          <button onClick={onClose} className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-gray-100">
            <X size={15} className="text-gray-400" />
          </button>
        </div>

        <div className="px-6 py-5 space-y-1">
          <label className="block text-xs font-medium text-gray-600 mb-1">Test Email Address</label>
          <input
            type="email"
            value={email}
            onChange={(e) => { setEmail(e.target.value); setError(""); }}
            placeholder="you@example.com"
            className={`w-full px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 transition-colors ${
              error
                ? "border-red-300 bg-red-50 focus:ring-red-400"
                : "border-gray-200 bg-gray-50 focus:bg-white focus:ring-green-500"
            }`}
          />
          {error && <p className="text-xs text-red-500 mt-1">{error}</p>}
        </div>

        <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-gray-100">
          <button
            onClick={onClose}
            disabled={sending}
            className="px-4 py-2 text-sm text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-50 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={sending}
            className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white text-sm font-medium rounded-lg hover:bg-green-700 disabled:opacity-50 transition-colors"
          >
            {sending ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
            {sending ? "Sending..." : "Send Test"}
          </button>
        </div>
      </div>
    </div>
  );
}
