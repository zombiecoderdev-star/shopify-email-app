"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useAppBridge } from "@shopify/app-bridge-react";
import {
  Plus, Pencil, Trash2, Mail,
  ChevronUp, ChevronDown, ChevronsUpDown,
} from "lucide-react";
import DeleteConfirmModal from "@/components/DeleteConfirmModal";
import Pagination, { usePagination } from "@/components/Pagination";

type Template = {
  id: string;
  name: string;
  subject: string | null;
  content: { blocks: unknown[] };
  created_at: string;
  updated_at: string;
};

type SortKey = "name" | "subject" | "created_at";
type SortDir = "asc" | "desc" | null;

const COLUMNS: { label: string; key: SortKey }[] = [
  { label: "Name",    key: "name" },
  { label: "Subject", key: "subject" },
  { label: "Created", key: "created_at" },
];

export default function Templates() {
  const shopify = useAppBridge();
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [sortKey, setSortKey] = useState<SortKey | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>(null);
  const [deleteTemplate, setDeleteTemplate] = useState<Template | null>(null);
  const [deleting, setDeleting] = useState(false);

  const shop = new URLSearchParams(window.location.search).get("shop") || "";
  const toast = (msg: string, opts?: { isError?: boolean }) => shopify.toast.show(msg, opts);

  async function loadTemplates() {
    setLoading(true);
    try {
      const res = await fetch(`/api/shopify/templates?shop=${shop}`);
      const data = await res.json();
      setTemplates(data.templates || []);
    } catch {
      toast("Failed to load templates", { isError: true });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadTemplates(); }, []);

  function handleSort(key: SortKey) {
    if (sortKey !== key) { setSortKey(key); setSortDir("asc"); }
    else if (sortDir === "asc") setSortDir("desc");
    else { setSortKey(null); setSortDir(null); }
  }

  function getSorted(list: Template[]) {
    if (!sortKey || !sortDir) return list;
    return [...list].sort((a, b) => {
      let av = "", bv = "";
      if (sortKey === "name") { av = a.name.toLowerCase(); bv = b.name.toLowerCase(); }
      else if (sortKey === "subject") { av = (a.subject || "").toLowerCase(); bv = (b.subject || "").toLowerCase(); }
      else if (sortKey === "created_at") { av = a.created_at; bv = b.created_at; }
      if (av < bv) return sortDir === "asc" ? -1 : 1;
      if (av > bv) return sortDir === "asc" ? 1 : -1;
      return 0;
    });
  }

  const sorted = getSorted(templates);
  const { page, perPage, setPage, setPerPage, paginate } = usePagination(sorted.length, [sortKey, sortDir]);
  const paginated = paginate(sorted);

  async function handleDelete(t: Template) {
    setDeleting(true);
    try {
      const res = await fetch(`/api/shopify/templates/${t.id}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ shop }),
      });
      if (res.ok) {
        toast("Template deleted ✅");
        setTemplates((prev) => prev.filter((x) => x.id !== t.id));
      } else {
        toast("Delete failed", { isError: true });
      }
    } catch {
      toast("Delete failed", { isError: true });
    } finally {
      setDeleting(false);
      setDeleteTemplate(null);
    }
  }

  return (
    <div className="p-6">

      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Email Templates</h1>
          <p className="text-sm text-gray-400 mt-1">
            Build reusable, block-based email templates for campaigns and flows.
          </p>
        </div>
        <Link
          href={`/shopify/templates/new?shop=${shop}`}
          className="flex items-center gap-1.5 px-4 py-2 bg-green-600 text-white text-sm font-medium rounded-lg hover:bg-green-700 transition-colors"
        >
          <Plus size={14} /> New Template
        </Link>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden flex flex-col">
        <div className="flex-1">
          {loading ? (
            <div className="p-16 text-center text-gray-400 text-sm">Loading templates...</div>
          ) : paginated.length === 0 ? (
            <div className="p-16 text-center text-gray-400 text-sm">No templates yet — create your first one.</div>
          ) : (
            <table className="w-full text-sm">
              <thead className="border-b border-gray-100">
                <tr>
                  {COLUMNS.map(({ label, key }) => (
                    <th key={key} className="text-left px-4 py-3">
                      <button
                        onClick={() => handleSort(key)}
                        className="flex items-center gap-1 group text-xs font-semibold text-gray-400 uppercase tracking-wide hover:text-gray-700 transition-colors"
                      >
                        {label}
                        <SortIcon active={sortKey === key} dir={sortKey === key ? sortDir : null} />
                      </button>
                    </th>
                  ))}
                  <th className="px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wide text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {paginated.map((t) => (
                  <tr key={t.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-lg bg-green-100 flex items-center justify-center flex-shrink-0">
                          <Mail size={14} className="text-green-700" />
                        </div>
                        <p className="font-medium text-gray-900">{t.name}</p>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-gray-500">{t.subject || "—"}</td>
                    <td className="px-4 py-3 text-gray-500 text-xs">
                      {new Date(t.created_at).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" })}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        <ActionBtn title="Edit template" href={`/shopify/templates/${t.id}?shop=${shop}`} className="hover:bg-green-50 hover:text-green-600">
                          <Pencil size={14} />
                        </ActionBtn>
                        <ActionBtn title="Delete template" onClick={() => setDeleteTemplate(t)} className="hover:bg-red-50 hover:text-red-500">
                          <Trash2 size={14} />
                        </ActionBtn>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <Pagination page={page} perPage={perPage} total={sorted.length} onPageChange={setPage} onPerPageChange={setPerPage} />
      </div>

      {deleteTemplate && (
        <DeleteConfirmModal
          title="Delete Template?"
          message={`"${deleteTemplate.name}" will be permanently deleted. This cannot be undone.`}
          confirmLabel="Delete Template"
          loading={deleting}
          onConfirm={() => handleDelete(deleteTemplate)}
          onCancel={() => setDeleteTemplate(null)}
        />
      )}
    </div>
  );
}

function ActionBtn({ children, onClick, href, title, className }: {
  children: React.ReactNode; onClick?: () => void; href?: string; title: string; className?: string;
}) {
  const cls = `w-7 h-7 flex items-center justify-center rounded-md text-gray-400 transition-colors ${className}`;
  if (href) {
    return <Link href={href} title={title} className={cls}>{children}</Link>;
  }
  return (
    <button onClick={onClick} title={title} className={cls}>
      {children}
    </button>
  );
}

function SortIcon({ active, dir }: { active: boolean; dir: SortDir }) {
  if (!active || !dir) return <ChevronsUpDown size={13} className="text-gray-300 group-hover:text-gray-500" />;
  return dir === "asc" ? <ChevronUp size={13} className="text-green-600" /> : <ChevronDown size={13} className="text-green-600" />;
}
