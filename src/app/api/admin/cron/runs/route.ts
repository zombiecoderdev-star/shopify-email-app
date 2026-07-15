import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { verifyAdminSession } from "@/lib/adminAuth";

const TRUNCATE_LEN = 300;

function truncateJson(value: unknown): unknown {
  if (value == null) return value;
  const str = JSON.stringify(value);
  if (str.length <= TRUNCATE_LEN) return value;
  return { _truncated: true, preview: str.slice(0, TRUNCATE_LEN) + "…" };
}

// GET /api/admin/cron/runs?job_key=&status=&page=&per_page=
// Paginated, filterable, sorted by started_at desc. request_payload/response
// are truncated for the list view — GET .../runs/[id] returns them in full.
export async function GET(req: NextRequest) {
  const user = await verifyAdminSession(req);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const sp = req.nextUrl.searchParams;
  const jobKey = sp.get("job_key");
  const status = sp.get("status");
  const page = Math.max(1, Number(sp.get("page")) || 1);
  const perPage = Math.min(250, Math.max(1, Number(sp.get("per_page")) || 20));
  const from = (page - 1) * perPage;
  const to = from + perPage - 1;

  let query = supabaseAdmin
    .from("cron_runs")
    .select(
      "id, job_id, job_key, trigger_type, triggered_by, status, started_at, finished_at, duration_ms, request_payload, response, error, rerun_of",
      { count: "exact" }
    )
    .order("started_at", { ascending: false })
    .range(from, to);

  if (jobKey) query = query.eq("job_key", jobKey);
  if (status) query = query.eq("status", status);

  const { data, error, count } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const runs = (data || []).map((r) => ({
    ...r,
    request_payload: truncateJson(r.request_payload),
    response: truncateJson(r.response),
  }));

  return NextResponse.json({ runs, total: count || 0, page, per_page: perPage });
}
