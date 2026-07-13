"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useAppBridge } from "@shopify/app-bridge-react";
import { Send, Trash2, ArrowLeft } from "lucide-react";
import TemplateEditor, { Block } from "@/components/TemplateEditor";
import DeleteConfirmModal from "@/components/DeleteConfirmModal";
import TestSendModal from "@/components/TestSendModal";

type Template = {
  id: string;
  name: string;
  subject: string | null;
  content: { blocks: Block[] };
};

export default function EditTemplate() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const shopify = useAppBridge();
  const shop = new URLSearchParams(window.location.search).get("shop") || "";
  const toast = (msg: string, opts?: { isError?: boolean }) => shopify.toast.show(msg, opts);

  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [name, setName] = useState("");
  const [subject, setSubject] = useState("");
  const [blocks, setBlocks] = useState<Block[]>([]);
  const [saving, setSaving] = useState(false);
  const [showDelete, setShowDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [showTestSend, setShowTestSend] = useState(false);

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const res = await fetch(`/api/shopify/templates?shop=${shop}`);
        const data = await res.json();
        const found: Template | undefined = (data.templates || []).find((t: Template) => t.id === params.id);
        if (!found) { setNotFound(true); return; }
        setName(found.name);
        setSubject(found.subject || "");
        setBlocks(found.content?.blocks || []);
      } finally {
        setLoading(false);
      }
    }
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.id]);

  async function handleSave() {
    if (!name.trim()) {
      toast("Template name is required", { isError: true });
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`/api/shopify/templates/${params.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ shop, name, subject, content: { blocks } }),
      });
      const data = await res.json();
      if (res.ok) {
        toast("Template saved ✅");
      } else {
        toast(data.error || "Save failed", { isError: true });
      }
    } catch {
      toast("Something went wrong", { isError: true });
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    setDeleting(true);
    try {
      const res = await fetch(`/api/shopify/templates/${params.id}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ shop }),
      });
      if (res.ok) {
        toast("Template deleted ✅");
        router.push(`/shopify/templates?shop=${shop}`);
      } else {
        toast("Delete failed", { isError: true });
      }
    } catch {
      toast("Delete failed", { isError: true });
    } finally {
      setDeleting(false);
      setShowDelete(false);
    }
  }

  if (loading) {
    return <div className="p-16 text-center text-gray-400 text-sm">Loading template...</div>;
  }

  if (notFound) {
    return (
      <div className="p-6 max-w-4xl mx-auto space-y-4">
        <Link href={`/shopify/templates?shop=${shop}`} className="flex items-center gap-1.5 text-sm text-gray-400 hover:text-gray-700">
          <ArrowLeft size={14} /> Back to templates
        </Link>
        <div className="p-16 text-center text-gray-400 text-sm bg-white rounded-xl border border-gray-200">
          Template not found.
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-5">

      <Link href={`/shopify/templates?shop=${shop}`} className="flex items-center gap-1.5 text-sm text-gray-400 hover:text-gray-700">
        <ArrowLeft size={14} /> Back to templates
      </Link>

      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Edit Template</h1>
          <p className="text-sm text-gray-400 mt-1">{name}</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowTestSend(true)}
            className="flex items-center gap-1.5 px-3 py-2 border border-gray-300 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-50 transition-colors"
          >
            <Send size={14} /> Send Test
          </button>
          <button
            onClick={() => setShowDelete(true)}
            className="flex items-center gap-1.5 px-3 py-2 border border-red-200 text-red-500 text-sm font-medium rounded-lg hover:bg-red-50 transition-colors"
          >
            <Trash2 size={14} /> Delete
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white text-sm font-medium rounded-lg hover:bg-green-700 disabled:opacity-50 transition-colors"
          >
            {saving ? "Saving..." : "Save Changes"}
          </button>
        </div>
      </div>

      {/* Name + subject */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              Template Name<span className="text-red-400 ml-0.5">*</span>
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-gray-200 bg-gray-50 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 focus:bg-white transition-colors"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Subject Line</label>
            <input
              type="text"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-gray-200 bg-gray-50 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 focus:bg-white transition-colors"
            />
          </div>
        </div>
      </div>

      {/* Block editor */}
      <TemplateEditor blocks={blocks} onChange={setBlocks} shopName={shop.replace(".myshopify.com", "")} />

      {showDelete && (
        <DeleteConfirmModal
          title="Delete Template?"
          message={`"${name}" will be permanently deleted. This cannot be undone.`}
          confirmLabel="Delete Template"
          loading={deleting}
          onConfirm={handleDelete}
          onCancel={() => setShowDelete(false)}
        />
      )}

      {showTestSend && (
        <TestSendModal
          shop={shop}
          templateId={params.id}
          onClose={() => setShowTestSend(false)}
          showToast={toast}
        />
      )}
    </div>
  );
}
