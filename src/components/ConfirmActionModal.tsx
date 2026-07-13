"use client";

import { AlertTriangle, Power, Loader2 } from "lucide-react";

type Tone = "danger" | "warning" | "success";

type Props = {
  title: string;
  message: string;
  confirmLabel: string;
  loadingLabel?: string;
  tone?: Tone;
  loading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
};

// Reusable "are you sure?" confirmation dialog for non-delete actions
// (activate/deactivate, status changes, etc). For destructive delete
// confirmations, use DeleteConfirmModal instead.

const TONE_STYLES: Record<Tone, { iconBg: string; iconColor: string; button: string }> = {
  danger:  { iconBg: "bg-red-100",    iconColor: "text-red-500",    button: "bg-red-500 hover:bg-red-600" },
  warning: { iconBg: "bg-yellow-100", iconColor: "text-yellow-600", button: "bg-yellow-500 hover:bg-yellow-600" },
  success: { iconBg: "bg-green-100",  iconColor: "text-green-600",  button: "bg-green-600 hover:bg-green-700" },
};

export default function ConfirmActionModal({
  title,
  message,
  confirmLabel,
  loadingLabel,
  tone = "warning",
  loading = false,
  onConfirm,
  onCancel,
}: Props) {
  const styles = TONE_STYLES[tone];

  return (
    <div
      className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4"
      onClick={(e) => e.target === e.currentTarget && onCancel()}
    >
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm">

        <div className="p-6">
          <div className={`w-12 h-12 ${styles.iconBg} rounded-full flex items-center justify-center mx-auto mb-4`}>
            {tone === "warning"
              ? <Power size={20} className={styles.iconColor} />
              : <AlertTriangle size={22} className={styles.iconColor} />
            }
          </div>

          <h2 className="text-base font-bold text-gray-900 text-center mb-2">{title}</h2>
          <p className="text-sm text-gray-500 text-center leading-relaxed">{message}</p>
        </div>

        <div className="flex gap-3 px-6 pb-6">
          <button
            onClick={onCancel}
            disabled={loading}
            className="flex-1 px-4 py-2.5 text-sm text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-50 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={loading}
            className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 text-white text-sm font-medium rounded-lg disabled:opacity-50 transition-colors ${styles.button}`}
          >
            {loading && <Loader2 size={14} className="animate-spin" />}
            {loading ? (loadingLabel || confirmLabel) : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
