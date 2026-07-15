"use client";

import { useState } from "react";
import { X } from "lucide-react";

export type CronJob = {
  id: string;
  job_key: string;
  name: string;
  schedule_type: "manual" | "automatic";
  interval_type: string | null;
  interval_minutes: number | null;
  max_concurrent_runs: number;
  timeout_seconds: number;
  is_active: boolean;
};

// Fixed minute-equivalents for the non-custom interval types — the resolved
// interval_minutes value that gets saved alongside interval_type (except
// custom_minutes, where the admin picks the number directly).
const INTERVAL_MINUTES: Record<string, number> = {
  minutely: 1,
  hourly: 60,
  daily: 1440,
  weekly: 10080,
};

type Props = {
  job: CronJob;
  onClose: () => void;
  onSave: (fields: {
    schedule_type: string;
    interval_type: string | null;
    interval_minutes: number | null;
    max_concurrent_runs: number;
    timeout_seconds: number;
    is_active: boolean;
  }) => Promise<void>;
};

export default function EditCronScheduleModal({ job, onClose, onSave }: Props) {
  const [scheduleType, setScheduleType] = useState(job.schedule_type);
  const [intervalType, setIntervalType] = useState(job.interval_type || "custom_minutes");
  const [customMinutes, setCustomMinutes] = useState(
    job.interval_type === "custom_minutes" ? String(job.interval_minutes ?? 5) : "5"
  );
  const [maxConcurrent, setMaxConcurrent] = useState(String(job.max_concurrent_runs));
  const [timeoutSeconds, setTimeoutSeconds] = useState(String(job.timeout_seconds));
  const [isActive, setIsActive] = useState(job.is_active);
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    setSaving(true);
    try {
      const resolvedMinutes =
        intervalType === "custom_minutes" ? Number(customMinutes) || 1 : INTERVAL_MINUTES[intervalType];

      await onSave({
        schedule_type: scheduleType,
        interval_type: scheduleType === "automatic" ? intervalType : null,
        interval_minutes: scheduleType === "automatic" ? resolvedMinutes : null,
        max_concurrent_runs: Math.max(1, Number(maxConcurrent) || 1),
        timeout_seconds: Math.max(1, Number(timeoutSeconds) || 300),
        is_active: isActive,
      });
      onClose();
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <div className="fixed inset-0 bg-black/30 z-40" onClick={onClose} />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-xl shadow-2xl w-full max-w-md">
          <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
            <h2 className="text-sm font-bold text-gray-900">Edit Schedule — {job.name}</h2>
            <button onClick={onClose} className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-gray-100">
              <X size={15} className="text-gray-400" />
            </button>
          </div>

          <div className="p-5 space-y-4">
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1.5">Schedule Type</label>
              <div className="flex gap-2">
                {(["automatic", "manual"] as const).map((t) => (
                  <button
                    key={t}
                    onClick={() => setScheduleType(t)}
                    className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium border transition-colors ${
                      scheduleType === t
                        ? "bg-green-600 text-white border-green-600"
                        : "bg-white text-gray-600 border-gray-200 hover:bg-gray-50"
                    }`}
                  >
                    {t === "automatic" ? "Automatic" : "Manual"}
                  </button>
                ))}
              </div>
            </div>

            {scheduleType === "automatic" && (
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1.5">Interval</label>
                <select
                  value={intervalType}
                  onChange={(e) => setIntervalType(e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                >
                  <option value="minutely">Every minute</option>
                  <option value="hourly">Every hour</option>
                  <option value="daily">Every day</option>
                  <option value="weekly">Every week</option>
                  <option value="custom_minutes">Custom (minutes)</option>
                </select>
                {intervalType === "custom_minutes" && (
                  <input
                    type="number"
                    min={1}
                    value={customMinutes}
                    onChange={(e) => setCustomMinutes(e.target.value)}
                    placeholder="Minutes"
                    className="mt-2 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                  />
                )}
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1.5">Max Concurrent Runs</label>
                <input
                  type="number"
                  min={1}
                  value={maxConcurrent}
                  onChange={(e) => setMaxConcurrent(e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1.5">Timeout (seconds)</label>
                <input
                  type="number"
                  min={1}
                  value={timeoutSeconds}
                  onChange={(e) => setTimeoutSeconds(e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                />
              </div>
            </div>

            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} className="rounded" />
              <span className="text-sm text-gray-700">Active</span>
            </label>
          </div>

          <div className="flex justify-end gap-2 px-5 py-4 border-t border-gray-100">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="px-4 py-2 bg-green-600 text-white text-sm font-medium rounded-lg hover:bg-green-700 disabled:opacity-60 transition-colors"
            >
              {saving ? "Saving…" : "Save"}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
