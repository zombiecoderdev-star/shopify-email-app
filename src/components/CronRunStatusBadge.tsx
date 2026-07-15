import { Loader2 } from "lucide-react";

const STYLES: Record<string, string> = {
  running: "bg-amber-100 text-amber-700",
  success: "bg-green-100 text-green-700",
  failed: "bg-red-100 text-red-700",
  timeout: "bg-orange-100 text-orange-700",
  skipped: "bg-gray-100 text-gray-500",
};

const LABELS: Record<string, string> = {
  running: "Running",
  success: "Success",
  failed: "Failed",
  timeout: "Timeout",
  skipped: "Skipped",
};

export default function CronRunStatusBadge({ status }: { status: string }) {
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-semibold uppercase ${STYLES[status] || "bg-gray-100 text-gray-600"}`}>
      {status === "running" && <Loader2 size={11} className="animate-spin" />}
      {LABELS[status] || status}
    </span>
  );
}
