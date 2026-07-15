import { Loader2 } from "lucide-react";

const STYLES: Record<string, string> = {
  draft: "bg-gray-100 text-gray-600",
  scheduled: "bg-blue-100 text-blue-700",
  sending: "bg-amber-100 text-amber-700",
  sent: "bg-green-100 text-green-700",
  failed: "bg-red-100 text-red-700",
};

// Displayed label differs from the raw DB status — the DB values
// (draft/scheduled/sending/sent/failed) are untouched, this is presentation only.
const LABELS: Record<string, string> = {
  draft: "Draft",
  scheduled: "In Queue",
  sending: "Sending",
  sent: "Sent",
  failed: "Failed",
};

export default function CampaignStatusBadge({ status }: { status: string }) {
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-semibold uppercase ${STYLES[status] || "bg-gray-100 text-gray-600"}`}>
      {status === "sending" && <Loader2 size={11} className="animate-spin" />}
      {LABELS[status] || status}
    </span>
  );
}
