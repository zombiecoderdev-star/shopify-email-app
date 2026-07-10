"use client";

import { useState } from "react";
import { X, Loader2, Crown, Check } from "lucide-react";
import { MEMBERSHIPS, getMembership } from "@/config/memberships";

type Props = {
  shop: string;
  // Pass either a single contact or multiple selected IDs
  contactIds: string[];
  customerLabel: string;           // e.g. "John Doe" or "5 customers"
  currentMembershipId?: number;    // shown when editing single customer
  onClose: () => void;
  onSuccess: (newMembershipId: number) => void;
  showToast: (msg: string, opts?: { isError?: boolean }) => void;
};

export default function ChangeMembershipModal({
  shop,
  contactIds,
  customerLabel,
  currentMembershipId = 0,
  onClose,
  onSuccess,
  showToast,
}: Props) {
  const [selectedId, setSelectedId] = useState<number>(currentMembershipId);
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(false);

  const isBulk = contactIds.length > 1;

  async function handleSubmit() {
    if (selectedId === currentMembershipId && !isBulk) {
      showToast("No changes made — same membership selected", { isError: true });
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/shopify/customers/membership", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          shop,
          contact_ids: contactIds,
          new_membership_id: selectedId,
          source: "admin",
          notes: notes || null,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        showToast(data.error || "Failed to update membership", { isError: true });
        return;
      }

      const newMembership = getMembership(selectedId);
      showToast(
        isBulk
          ? `Updated ${data.updated} customers to ${newMembership.name} ✅`
          : `Membership changed to ${newMembership.name} ✅`
      );
      onSuccess(selectedId);
      onClose();
    } catch {
      showToast("Something went wrong", { isError: true });
    } finally {
      setLoading(false);
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
            <h2 className="text-base font-bold text-gray-900">Change Membership</h2>
            <p className="text-xs text-gray-400 mt-0.5">
              {isBulk
                ? `Applying to ${contactIds.length} selected customers`
                : customerLabel}
            </p>
          </div>
          <button
            onClick={onClose}
            className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-gray-100"
          >
            <X size={15} className="text-gray-400" />
          </button>
        </div>

        {/* Membership options */}
        <div className="px-6 py-5 space-y-4">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
            Select Membership Tier
          </p>
          <div className="space-y-2">
            {MEMBERSHIPS.map((m) => {
              const isSelected = selectedId === m.id;
              const isCurrent = currentMembershipId === m.id && !isBulk;
              return (
                <button
                  key={m.id}
                  onClick={() => setSelectedId(m.id)}
                  className={`w-full flex items-center justify-between p-3.5 rounded-xl border-2 transition-all ${
                    isSelected
                      ? "border-green-500 bg-green-50"
                      : "border-gray-200 hover:border-gray-300 hover:bg-gray-50"
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <Crown
                      size={16}
                      className={isSelected ? "text-green-600" : "text-gray-300"}
                    />
                    <div className="text-left">
                      <div className="flex items-center gap-2">
                        <span className={`text-sm font-semibold ${
                          isSelected ? "text-green-700" : "text-gray-800"
                        }`}>
                          {m.name}
                        </span>
                        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${m.badgeClass}`}>
                          ID: {m.id}
                        </span>
                        {isCurrent && (
                          <span className="text-[10px] font-medium text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded">
                            Current
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-gray-400 mt-0.5">{m.description}</p>
                    </div>
                  </div>
                  {isSelected && (
                    <div className="w-5 h-5 rounded-full bg-green-500 flex items-center justify-center flex-shrink-0">
                      <Check size={11} className="text-white" />
                    </div>
                  )}
                </button>
              );
            })}
          </div>

          {/* Optional notes */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              Notes <span className="text-gray-400">(optional)</span>
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Reason for membership change..."
              rows={2}
              className="w-full px-3 py-2 text-sm border border-gray-200 bg-gray-50 rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-green-500 focus:bg-white transition-colors"
            />
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-gray-100">
          <button
            onClick={onClose}
            disabled={loading}
            className="px-4 py-2 text-sm text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={loading}
            className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white text-sm font-medium rounded-lg hover:bg-green-700 disabled:opacity-50"
          >
            {loading && <Loader2 size={14} className="animate-spin" />}
            {loading
              ? "Updating..."
              : isBulk
              ? `Update ${contactIds.length} Customers`
              : "Change Membership"}
          </button>
        </div>
      </div>
    </div>
  );
}