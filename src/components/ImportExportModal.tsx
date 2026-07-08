"use client";

import { useState, useRef } from "react";
import {
  X, Upload, Download, FileText,
  CheckCircle, XCircle, AlertCircle, Loader2,
} from "lucide-react";

type Contact = {
  email: string;
  first_name: string | null;
  last_name: string | null;
  orders_count: number;
  total_spent: number;
  subscribed: boolean;
  tags: string[];
  shopify_customer_id: string;
};

type ImportRow = {
  email: string;
  first_name: string;
  last_name: string;
  phone: string;
  subscribed: string;
};

type ImportResult = {
  email: string;
  success: boolean;
  error?: string;
};

type Props = {
  shop: string;
  contacts: Contact[];        // existing contacts for export
  onClose: () => void;
  onImportDone: () => void;   // refresh list after import
  showToast: (msg: string, opts?: { isError?: boolean }) => void;
};

type Tab = "import" | "export";
type ImportStep = "upload" | "preview" | "result";

export default function ImportExportModal({
  shop, contacts, onClose, onImportDone, showToast,
}: Props) {
  const [tab, setTab] = useState<Tab>("import");

  return (
    <div
      className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[85vh] flex flex-col">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 flex-shrink-0">
          <div className="flex items-center gap-4">
            <h2 className="text-base font-bold text-gray-900">Import / Export Customers</h2>
            <div className="flex bg-gray-100 rounded-lg p-0.5">
              {(["import", "export"] as Tab[]).map((t) => (
                <button
                  key={t}
                  onClick={() => setTab(t)}
                  className={`px-3 py-1 rounded-md text-xs font-medium transition-colors capitalize ${
                    tab === t
                      ? "bg-white text-gray-900 shadow-sm"
                      : "text-gray-500 hover:text-gray-700"
                  }`}
                >
                  {t === "import" ? "⬆ Import" : "⬇ Export"}
                </button>
              ))}
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-gray-100"
          >
            <X size={15} className="text-gray-400" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-auto">
          {tab === "import"
            ? <ImportTab shop={shop} onImportDone={onImportDone} showToast={showToast} onClose={onClose} />
            : <ExportTab contacts={contacts} showToast={showToast} onClose={onClose} />
          }
        </div>

      </div>
    </div>
  );
}

// ─── IMPORT TAB ────────────────────────────────────────────────────────────────

function ImportTab({ shop, onImportDone, showToast, onClose }: {
  shop: string;
  onImportDone: () => void;
  showToast: Props["showToast"];
  onClose: () => void;
}) {
  const [step, setStep] = useState<ImportStep>("upload");
  const [rows, setRows] = useState<ImportRow[]>([]);
  const [results, setResults] = useState<ImportResult[]>([]);
  const [importing, setImporting] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  function parseCSV(text: string): ImportRow[] {
    const lines = text.trim().split(/\r?\n/);
    if (lines.length < 2) return [];

    // Normalise header names — lowercase, trim spaces
    const headers = lines[0].split(",").map((h) => h.trim().toLowerCase().replace(/\s+/g, "_"));

    return lines.slice(1).map((line) => {
      // Handle quoted fields with commas inside
      const values: string[] = [];
      let cur = "", inQuote = false;
      for (const ch of line) {
        if (ch === '"') { inQuote = !inQuote; }
        else if (ch === "," && !inQuote) { values.push(cur.trim()); cur = ""; }
        else { cur += ch; }
      }
      values.push(cur.trim());

      const row: Record<string, string> = {};
      headers.forEach((h, i) => { row[h] = values[i] || ""; });

      return {
        email: row.email || row.email_address || "",
        first_name: row.first_name || row.firstname || row["first name"] || "",
        last_name: row.last_name || row.lastname || row["last name"] || "",
        phone: row.phone || row.phone_number || "",
        subscribed: row.subscribed || row.marketing_consent || "true",
      };
    }).filter((r) => r.email); // drop rows with no email
  }

  function handleFile(file: File) {
    if (!file.name.endsWith(".csv")) {
      showToast("Please upload a .csv file", { isError: true });
      return;
    }
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      const parsed = parseCSV(text);
      if (parsed.length === 0) {
        showToast("No valid rows found in CSV", { isError: true });
        return;
      }
      setRows(parsed);
      setStep("preview");
    };
    reader.readAsText(file);
  }

  async function runImport() {
    setImporting(true);
    try {
      const res = await fetch("/api/shopify/customers/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ shop, customers: rows }),
      });
      const data = await res.json();
      setResults(data.results || []);
      setStep("result");
      onImportDone();
      showToast(`Import done: ${data.succeeded} succeeded, ${data.failed} failed`);
    } catch {
      showToast("Import failed", { isError: true });
    } finally {
      setImporting(false);
    }
  }

  if (step === "upload") return (
    <div className="p-6 space-y-5">

      {/* CSV format info */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <p className="text-xs font-semibold text-blue-800 mb-1">Expected CSV format</p>
        <p className="text-xs text-blue-700 mb-2">
          Column names are flexible — we auto-detect common variations.
        </p>
        <code className="block text-xs bg-white border border-blue-200 rounded p-2 text-gray-600">
          email, first_name, last_name, phone, subscribed
          <br />
          john@example.com, John, Doe, +1555000000, true
        </code>
      </div>

      {/* Drop zone */}
      <div
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          const file = e.dataTransfer.files[0];
          if (file) handleFile(file);
        }}
        onClick={() => fileRef.current?.click()}
        className={`border-2 border-dashed rounded-xl p-12 text-center cursor-pointer transition-colors ${
          dragOver
            ? "border-green-400 bg-green-50"
            : "border-gray-200 hover:border-gray-300 hover:bg-gray-50"
        }`}
      >
        <Upload size={28} className="text-gray-300 mx-auto mb-3" />
        <p className="text-sm font-medium text-gray-700">
          Drop your CSV file here
        </p>
        <p className="text-xs text-gray-400 mt-1">or click to browse</p>
        <input
          ref={fileRef}
          type="file"
          accept=".csv"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) handleFile(file);
          }}
        />
      </div>

      {/* Download template */}
      <button
        onClick={() => {
          const csv = "email,first_name,last_name,phone,subscribed\njohn@example.com,John,Doe,+15550000000,true";
          const blob = new Blob([csv], { type: "text/csv" });
          const url = URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = url; a.download = "import_template.csv"; a.click();
          URL.revokeObjectURL(url);
        }}
        className="flex items-center gap-2 text-xs text-green-600 hover:underline"
      >
        <FileText size={13} />
        Download CSV template
      </button>
    </div>
  );

  if (step === "preview") return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold text-gray-800">
            Preview — {rows.length} rows found
          </p>
          <p className="text-xs text-gray-400 mt-0.5">
            Review before importing. All rows will be created in Shopify.
          </p>
        </div>
        <button
          onClick={() => { setRows([]); setStep("upload"); }}
          className="text-xs text-gray-400 hover:text-gray-600"
        >
          ← Choose different file
        </button>
      </div>

      {/* Preview table */}
      <div className="border border-gray-200 rounded-lg overflow-hidden">
        <div className="overflow-auto max-h-64">
          <table className="w-full text-xs">
            <thead className="bg-gray-50 border-b border-gray-200 sticky top-0">
              <tr>
                {["Email", "First Name", "Last Name", "Phone", "Subscribed"].map((h) => (
                  <th key={h} className="text-left px-3 py-2 text-gray-500 font-semibold uppercase tracking-wide">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {rows.map((r, i) => (
                <tr key={i} className={i % 2 === 0 ? "bg-white" : "bg-gray-50"}>
                  <td className="px-3 py-2 text-gray-700">{r.email}</td>
                  <td className="px-3 py-2 text-gray-500">{r.first_name || "—"}</td>
                  <td className="px-3 py-2 text-gray-500">{r.last_name || "—"}</td>
                  <td className="px-3 py-2 text-gray-500">{r.phone || "—"}</td>
                  <td className="px-3 py-2">
                    <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                      r.subscribed === "false"
                        ? "bg-gray-100 text-gray-500"
                        : "bg-green-100 text-green-700"
                    }`}>
                      {r.subscribed === "false" ? "NO" : "YES"}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="flex items-center justify-end gap-2 pt-2">
        <button
          onClick={onClose}
          className="px-4 py-2 text-sm text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50"
        >
          Cancel
        </button>
        <button
          onClick={runImport}
          disabled={importing}
          className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white text-sm font-medium rounded-lg hover:bg-green-700 disabled:opacity-50"
        >
          {importing && <Loader2 size={14} className="animate-spin" />}
          {importing ? `Importing...` : `Import ${rows.length} customers`}
        </button>
      </div>
    </div>
  );

  if (step === "result") {
    const succeeded = results.filter((r) => r.success);
    const failed = results.filter((r) => !r.success);
    return (
      <div className="p-6 space-y-4">
        {/* Summary */}
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-green-50 border border-green-200 rounded-lg p-4 flex items-center gap-3">
            <CheckCircle size={20} className="text-green-500" />
            <div>
              <p className="text-lg font-bold text-green-700">{succeeded.length}</p>
              <p className="text-xs text-green-600">Successfully imported</p>
            </div>
          </div>
          <div className={`border rounded-lg p-4 flex items-center gap-3 ${
            failed.length > 0 ? "bg-red-50 border-red-200" : "bg-gray-50 border-gray-200"
          }`}>
            <XCircle size={20} className={failed.length > 0 ? "text-red-400" : "text-gray-300"} />
            <div>
              <p className={`text-lg font-bold ${failed.length > 0 ? "text-red-600" : "text-gray-400"}`}>
                {failed.length}
              </p>
              <p className={`text-xs ${failed.length > 0 ? "text-red-500" : "text-gray-400"}`}>
                Failed
              </p>
            </div>
          </div>
        </div>

        {/* Failed rows */}
        {failed.length > 0 && (
          <div className="border border-red-200 rounded-lg overflow-hidden">
            <div className="px-3 py-2 bg-red-50 border-b border-red-200">
              <p className="text-xs font-semibold text-red-700 flex items-center gap-1.5">
                <AlertCircle size={13} />
                Failed rows — fix these and re-import
              </p>
            </div>
            <div className="max-h-40 overflow-auto">
              {failed.map((r, i) => (
                <div key={i} className="flex items-start gap-2 px-3 py-2 border-b border-red-100 last:border-0">
                  <XCircle size={12} className="text-red-400 mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="text-xs font-medium text-gray-700">{r.email}</p>
                    <p className="text-xs text-red-500">{r.error}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="flex justify-end gap-2">
          {failed.length > 0 && (
            <button
              onClick={() => { setRows([]); setResults([]); setStep("upload"); }}
              className="px-4 py-2 text-sm border border-gray-200 text-gray-600 rounded-lg hover:bg-gray-50"
            >
              Import More
            </button>
          )}
          <button
            onClick={onClose}
            className="px-4 py-2 bg-green-600 text-white text-sm font-medium rounded-lg hover:bg-green-700"
          >
            Done
          </button>
        </div>
      </div>
    );
  }

  return null;
}

// ─── EXPORT TAB ────────────────────────────────────────────────────────────────

function ExportTab({ contacts, showToast, onClose }: {
  contacts: Contact[];
  showToast: Props["showToast"];
  onClose: () => void;
}) {
  const [filter, setFilter] = useState<"all" | "subscribed" | "unsubscribed">("all");

  const filtered = contacts.filter((c) => {
    if (filter === "subscribed") return c.subscribed;
    if (filter === "unsubscribed") return !c.subscribed;
    return true;
  });

  function exportCSV() {
    if (filtered.length === 0) {
      showToast("No contacts to export", { isError: true });
      return;
    }

    const headers = [
      "email", "first_name", "last_name", "shopify_id",
      "orders_count", "total_spent", "subscribed", "tags",
    ];

    const rows = filtered.map((c) => [
      c.email,
      c.first_name || "",
      c.last_name || "",
      c.shopify_customer_id,
      c.orders_count,
      parseFloat(String(c.total_spent)).toFixed(2),
      c.subscribed ? "true" : "false",
      (c.tags || []).join("|"),
    ]);

    const csv = [headers, ...rows]
      .map((row) => row.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(","))
      .join("\n");

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `contacts_export_${new Date().toISOString().split("T")[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);

    showToast(`Exported ${filtered.length} contacts ✅`);
    onClose();
  }

  return (
    <div className="p-6 space-y-5">

      {/* Filter selector */}
      <div>
        <p className="text-xs font-semibold text-gray-600 mb-2 uppercase tracking-wide">
          Which contacts to export?
        </p>
        <div className="space-y-2">
          {([
            ["all", "All Contacts", contacts.length],
            ["subscribed", "Subscribed only", contacts.filter((c) => c.subscribed).length],
            ["unsubscribed", "Unsubscribed only", contacts.filter((c) => !c.subscribed).length],
          ] as const).map(([val, label, count]) => (
            <label
              key={val}
              className={`flex items-center justify-between p-3 rounded-lg border cursor-pointer transition-colors ${
                filter === val
                  ? "border-green-400 bg-green-50"
                  : "border-gray-200 hover:bg-gray-50"
              }`}
            >
              <div className="flex items-center gap-2.5">
                <input
                  type="radio"
                  name="export-filter"
                  value={val}
                  checked={filter === val}
                  onChange={() => setFilter(val)}
                  className="accent-green-600"
                />
                <span className="text-sm text-gray-700">{label}</span>
              </div>
              <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">
                {count} contacts
              </span>
            </label>
          ))}
        </div>
      </div>

      {/* Columns info */}
      <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
        <p className="text-xs font-semibold text-gray-500 mb-1">Exported columns</p>
        <p className="text-xs text-gray-400">
          email, first_name, last_name, shopify_id, orders_count, total_spent, subscribed, tags
        </p>
      </div>

      <div className="flex items-center justify-end gap-2">
        <button
          onClick={onClose}
          className="px-4 py-2 text-sm text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50"
        >
          Cancel
        </button>
        <button
          onClick={exportCSV}
          disabled={filtered.length === 0}
          className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white text-sm font-medium rounded-lg hover:bg-green-700 disabled:opacity-50"
        >
          <Download size={14} />
          Export {filtered.length} contacts
        </button>
      </div>
    </div>
  );
}
