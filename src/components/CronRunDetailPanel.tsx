"use client";

import { X, RotateCcw } from "lucide-react";
import CronRunStatusBadge from "@/components/CronRunStatusBadge";

export type CronRunDetail = {
  id: string;
  job_key: string;
  trigger_type: string;
  triggered_by: string | null;
  status: string;
  started_at: string;
  finished_at: string | null;
  duration_ms: number | null;
  request_payload: unknown;
  response: unknown;
  error: string | null;
  rerun_of: string | null;
};

type Props = {
  run: CronRunDetail;
  onClose: () => void;
  onRerun: (runId: string) => void;
  rerunning: boolean;
};

export default function CronRunDetailPanel({ run, onClose, onRerun, rerunning }: Props) {
  const canRerun = run.status === "failed" || run.status === "timeout";

  return (
    <>
      <div className="fixed inset-0 bg-black/20 z-40" onClick={onClose} />
      <div className="fixed right-0 top-0 h-full w-[28rem] bg-white shadow-2xl z-50 flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h2 className="text-sm font-bold text-gray-900">Run Details</h2>
          <button onClick={onClose} className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-gray-100">
            <X size={15} className="text-gray-400" />
          </button>
        </div>

        <div className="flex-1 overflow-auto p-5 space-y-5">
          <div className="flex items-center gap-3">
            <CronRunStatusBadge status={run.status} />
            <span className="text-xs text-gray-400 capitalize">{run.trigger_type}</span>
            {run.triggered_by && <span className="text-xs text-gray-400">by {run.triggered_by}</span>}
          </div>

          <Section title="Timing">
            <InfoRow label="Job Key" value={run.job_key} mono />
            <InfoRow label="Started" value={new Date(run.started_at).toLocaleString()} />
            <InfoRow label="Finished" value={run.finished_at ? new Date(run.finished_at).toLocaleString() : "—"} />
            <InfoRow label="Duration" value={run.duration_ms != null ? `${run.duration_ms} ms` : "—"} />
            {run.rerun_of && <InfoRow label="Rerun Of" value={run.rerun_of} mono />}
          </Section>

          {run.error && (
            <Section title="Error">
              <pre className="text-xs bg-red-50 text-red-700 rounded-lg p-3 whitespace-pre-wrap break-words">
                {run.error}
              </pre>
            </Section>
          )}

          <Section title="Request Payload">
            <pre className="text-xs bg-gray-50 text-gray-700 rounded-lg p-3 whitespace-pre-wrap break-words max-h-64 overflow-auto">
              {run.request_payload ? JSON.stringify(run.request_payload, null, 2) : "—"}
            </pre>
          </Section>

          <Section title="Response">
            <pre className="text-xs bg-gray-50 text-gray-700 rounded-lg p-3 whitespace-pre-wrap break-words max-h-64 overflow-auto">
              {run.response ? JSON.stringify(run.response, null, 2) : "—"}
            </pre>
          </Section>
        </div>

        {canRerun && (
          <div className="px-5 py-4 border-t border-gray-100">
            <button
              onClick={() => onRerun(run.id)}
              disabled={rerunning}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-amber-600 text-white text-sm font-medium rounded-lg hover:bg-amber-700 disabled:opacity-60 transition-colors"
            >
              <RotateCcw size={14} className={rerunning ? "animate-spin" : ""} />
              {rerunning ? "Re-running…" : "Re-run"}
            </button>
          </div>
        )}
      </div>
    </>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">{title}</p>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

function InfoRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-2.5 py-1.5 border-b border-gray-50 last:border-0">
      <p className="text-xs text-gray-400 flex-shrink-0">{label}</p>
      <p className={`text-xs text-gray-800 text-right break-all ${mono ? "font-mono" : "font-medium"}`}>{value}</p>
    </div>
  );
}
