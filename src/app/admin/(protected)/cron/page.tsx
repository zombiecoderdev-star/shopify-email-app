"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { Play, Pencil, RotateCcw } from "lucide-react";
import CronRunStatusBadge from "@/components/CronRunStatusBadge";
import EditCronScheduleModal, { type CronJob as EditableCronJob } from "@/components/EditCronScheduleModal";
import CronRunDetailPanel, { type CronRunDetail } from "@/components/CronRunDetailPanel";
import Pagination, { usePagination } from "@/components/Pagination";

type LastResult = {
  id: string;
  status: string;
  started_at: string;
  finished_at: string | null;
  duration_ms: number | null;
} | null;

type CronJob = EditableCronJob & {
  description: string | null;
  next_run_at: string | null;
  last_run_at: string | null;
  currently_running_count: number;
  last_result: LastResult;
};

type CronRunRow = {
  id: string;
  job_key: string;
  trigger_type: string;
  triggered_by: string | null;
  status: string;
  started_at: string;
  finished_at: string | null;
  duration_ms: number | null;
  response: unknown;
  error: string | null;
};

function relativeTime(iso: string | null): string {
  if (!iso) return "—";
  const diffMs = new Date(iso).getTime() - Date.now();
  const abs = Math.abs(diffMs);
  const mins = Math.round(abs / 60_000);
  const label =
    mins < 1 ? "less than a min" : mins < 60 ? `${mins} min` : mins < 1440 ? `${Math.round(mins / 60)} hr` : `${Math.round(mins / 1440)} day`;
  return diffMs >= 0 ? `in ${label}` : `${label} ago`;
}

function scheduleLabel(job: CronJob): string {
  if (job.schedule_type === "manual") return "Manual";
  if (job.interval_type === "custom_minutes") return `Every ${job.interval_minutes} min`;
  if (job.interval_type === "minutely") return "Every minute";
  if (job.interval_type === "hourly") return "Every hour";
  if (job.interval_type === "daily") return "Every day";
  if (job.interval_type === "weekly") return "Every week";
  return "Automatic";
}

export default function AdminCron() {
  const [jobs, setJobs] = useState<CronJob[]>([]);
  const [jobsLoading, setJobsLoading] = useState(true);
  const [runningIds, setRunningIds] = useState<Set<string>>(new Set());
  const [editingJob, setEditingJob] = useState<CronJob | null>(null);

  const [runs, setRuns] = useState<CronRunRow[]>([]);
  const [runsTotal, setRunsTotal] = useState(0);
  const [runsLoading, setRunsLoading] = useState(true);
  const [filterJobKey, setFilterJobKey] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const { page, perPage, setPage, setPerPage } = usePagination(runsTotal, [filterJobKey, filterStatus]);

  const [selectedRun, setSelectedRun] = useState<CronRunDetail | null>(null);
  const [rerunning, setRerunning] = useState(false);

  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [toastState, setToastState] = useState<{ msg: string; isError?: boolean } | null>(null);
  const toast = useCallback((msg: string, opts?: { isError?: boolean }) => {
    setToastState({ msg, isError: opts?.isError });
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToastState(null), 3000);
  }, []);

  const loadJobs = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/cron/jobs");
      const data = await res.json();
      setJobs(data.jobs || []);
    } catch {
      toast("Failed to load cron jobs", { isError: true });
    } finally {
      setJobsLoading(false);
    }
  }, [toast]);

  const loadRuns = useCallback(async () => {
    setRunsLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), per_page: String(perPage) });
      if (filterJobKey) params.set("job_key", filterJobKey);
      if (filterStatus) params.set("status", filterStatus);
      const res = await fetch(`/api/admin/cron/runs?${params}`);
      const data = await res.json();
      setRuns(data.runs || []);
      setRunsTotal(data.total || 0);
    } catch {
      toast("Failed to load run logs", { isError: true });
    } finally {
      setRunsLoading(false);
    }
  }, [page, perPage, filterJobKey, filterStatus, toast]);

  useEffect(() => {
    loadJobs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    loadRuns();
  }, [loadRuns]);

  // Auto-poll the jobs panel every ~5s while anything shows status
  // "running" — mirrors the campaign send status polling pattern. Stops
  // polling (and cleans up) as soon as nothing is running.
  useEffect(() => {
    const anyRunning = jobs.some((j) => j.currently_running_count > 0 || j.last_result?.status === "running");
    if (!anyRunning) return;
    const timer = setInterval(() => {
      loadJobs();
    }, 5000);
    return () => clearInterval(timer);
  }, [jobs, loadJobs]);

  async function toggleActive(job: CronJob) {
    try {
      const res = await fetch(`/api/admin/cron/jobs/${job.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_active: !job.is_active }),
      });
      if (!res.ok) throw new Error();
      toast(`${job.name} ${!job.is_active ? "activated" : "deactivated"} ✅`);
      loadJobs();
    } catch {
      toast("Failed to update job", { isError: true });
    }
  }

  async function runNow(job: CronJob) {
    setRunningIds((prev) => new Set(prev).add(job.id));
    try {
      const res = await fetch(`/api/admin/cron/jobs/${job.id}/run`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Run failed");
      if (data.status === "skipped") {
        toast(`${job.name}: skipped (${data.response?.note || "at concurrency cap"})`, { isError: true });
      } else {
        toast(`${job.name}: ${data.status}`, { isError: data.status === "failed" });
      }
      loadJobs();
      loadRuns();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Run failed", { isError: true });
    } finally {
      setRunningIds((prev) => {
        const next = new Set(prev);
        next.delete(job.id);
        return next;
      });
    }
  }

  async function saveSchedule(fields: {
    schedule_type: string;
    interval_type: string | null;
    interval_minutes: number | null;
    max_concurrent_runs: number;
    timeout_seconds: number;
    is_active: boolean;
  }) {
    if (!editingJob) return;
    const res = await fetch(`/api/admin/cron/jobs/${editingJob.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(fields),
    });
    if (!res.ok) {
      toast("Failed to save schedule", { isError: true });
      return;
    }
    toast("Schedule updated ✅");
    loadJobs();
  }

  async function openRunDetail(runId: string) {
    try {
      const res = await fetch(`/api/admin/cron/runs/${runId}`);
      const data = await res.json();
      if (!res.ok) throw new Error();
      setSelectedRun(data.run);
    } catch {
      toast("Failed to load run details", { isError: true });
    }
  }

  async function rerun(runId: string) {
    setRerunning(true);
    try {
      const res = await fetch(`/api/admin/cron/runs/${runId}/rerun`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Rerun failed");
      toast(`Re-run: ${data.status}`, { isError: data.status === "failed" });
      setSelectedRun(null);
      loadJobs();
      loadRuns();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Rerun failed", { isError: true });
    } finally {
      setRerunning(false);
    }
  }

  const jobKeys = Array.from(new Set(jobs.map((j) => j.job_key)));

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-xl font-bold text-gray-900">Cron Monitor</h1>
        <p className="text-sm text-gray-500 mt-1">Registered jobs, schedules, and execution history.</p>
      </div>

      {/* Jobs panel */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-100">
          <h2 className="text-sm font-bold text-gray-900">Jobs</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-gray-400 uppercase tracking-wider border-b border-gray-100">
                <th className="px-5 py-2.5 font-medium">Name</th>
                <th className="px-5 py-2.5 font-medium">Schedule</th>
                <th className="px-5 py-2.5 font-medium">Next Run</th>
                <th className="px-5 py-2.5 font-medium">Last Run</th>
                <th className="px-5 py-2.5 font-medium">Running</th>
                <th className="px-5 py-2.5 font-medium">Active</th>
                <th className="px-5 py-2.5 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {jobsLoading ? (
                <tr><td colSpan={7} className="px-5 py-6 text-center text-gray-400">Loading…</td></tr>
              ) : jobs.length === 0 ? (
                <tr><td colSpan={7} className="px-5 py-6 text-center text-gray-400">No cron jobs registered</td></tr>
              ) : (
                jobs.map((job) => {
                  const atCap = job.currently_running_count >= job.max_concurrent_runs;
                  const running = runningIds.has(job.id);
                  return (
                    <tr key={job.id} className="border-b border-gray-50 last:border-0 hover:bg-gray-50">
                      <td className="px-5 py-3">
                        <p className="font-medium text-gray-900">{job.name}</p>
                        <p className="text-xs text-gray-400 font-mono">{job.job_key}</p>
                      </td>
                      <td className="px-5 py-3">
                        <span className="inline-flex px-2 py-0.5 rounded text-xs font-semibold bg-blue-100 text-blue-700">
                          {scheduleLabel(job)}
                        </span>
                      </td>
                      <td className="px-5 py-3 text-gray-600">
                        {job.schedule_type === "manual" ? "—" : relativeTime(job.next_run_at)}
                      </td>
                      <td className="px-5 py-3">
                        {job.last_result ? <CronRunStatusBadge status={job.last_result.status} /> : <span className="text-gray-400">—</span>}
                      </td>
                      <td className="px-5 py-3 text-gray-600">
                        {job.currently_running_count} / {job.max_concurrent_runs}
                      </td>
                      <td className="px-5 py-3">
                        <button
                          onClick={() => toggleActive(job)}
                          className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                            job.is_active ? "bg-green-600" : "bg-gray-300"
                          }`}
                        >
                          <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${job.is_active ? "translate-x-[18px]" : "translate-x-1"}`} />
                        </button>
                      </td>
                      <td className="px-5 py-3">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => runNow(job)}
                            disabled={running || atCap}
                            title={atCap ? "At max concurrent runs — wait for one to finish" : undefined}
                            className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-green-700 bg-green-50 rounded-lg hover:bg-green-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                          >
                            <Play size={12} className={running ? "animate-pulse" : ""} />
                            {running ? "Running…" : "Run Now"}
                          </button>
                          <button
                            onClick={() => setEditingJob(job)}
                            className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
                          >
                            <Pencil size={12} />
                            Edit
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Run logs panel */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between flex-wrap gap-3">
          <h2 className="text-sm font-bold text-gray-900">Run Logs</h2>
          <div className="flex items-center gap-2">
            <select
              value={filterJobKey}
              onChange={(e) => setFilterJobKey(e.target.value)}
              className="text-xs border border-gray-200 rounded-md px-2 py-1.5 bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-green-500"
            >
              <option value="">All jobs</option>
              {jobKeys.map((k) => (
                <option key={k} value={k}>{k}</option>
              ))}
            </select>
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="text-xs border border-gray-200 rounded-md px-2 py-1.5 bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-green-500"
            >
              <option value="">All statuses</option>
              <option value="running">Running</option>
              <option value="success">Success</option>
              <option value="failed">Failed</option>
              <option value="timeout">Timeout</option>
              <option value="skipped">Skipped</option>
            </select>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-gray-400 uppercase tracking-wider border-b border-gray-100">
                <th className="px-5 py-2.5 font-medium">Job</th>
                <th className="px-5 py-2.5 font-medium">Trigger</th>
                <th className="px-5 py-2.5 font-medium">Status</th>
                <th className="px-5 py-2.5 font-medium">Started</th>
                <th className="px-5 py-2.5 font-medium">Duration</th>
                <th className="px-5 py-2.5 font-medium">Preview</th>
              </tr>
            </thead>
            <tbody>
              {runsLoading ? (
                <tr><td colSpan={6} className="px-5 py-6 text-center text-gray-400">Loading…</td></tr>
              ) : runs.length === 0 ? (
                <tr><td colSpan={6} className="px-5 py-6 text-center text-gray-400">No runs yet</td></tr>
              ) : (
                runs.map((run) => (
                  <tr
                    key={run.id}
                    onClick={() => openRunDetail(run.id)}
                    className="border-b border-gray-50 last:border-0 hover:bg-gray-50 cursor-pointer"
                  >
                    <td className="px-5 py-3 font-mono text-xs text-gray-700">{run.job_key}</td>
                    <td className="px-5 py-3 text-gray-600 capitalize">{run.trigger_type}</td>
                    <td className="px-5 py-3"><CronRunStatusBadge status={run.status} /></td>
                    <td className="px-5 py-3 text-gray-600">{new Date(run.started_at).toLocaleString()}</td>
                    <td className="px-5 py-3 text-gray-600">{run.duration_ms != null ? `${run.duration_ms} ms` : "—"}</td>
                    <td className="px-5 py-3 text-gray-500 text-xs max-w-xs truncate">
                      {run.error || (run.response ? JSON.stringify(run.response) : "—")}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <Pagination page={page} perPage={perPage} total={runsTotal} onPageChange={setPage} onPerPageChange={setPerPage} />
      </div>

      {editingJob && (
        <EditCronScheduleModal job={editingJob} onClose={() => setEditingJob(null)} onSave={saveSchedule} />
      )}

      {selectedRun && (
        <CronRunDetailPanel run={selectedRun} onClose={() => setSelectedRun(null)} onRerun={rerun} rerunning={rerunning} />
      )}

      {toastState && (
        <div className={`fixed bottom-5 right-5 px-4 py-2.5 rounded-lg shadow-lg text-sm z-[60] ${
          toastState.isError ? "bg-red-600 text-white" : "bg-gray-900 text-white"
        }`}>
          {toastState.msg}
        </div>
      )}
    </div>
  );
}
