"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAppBridge } from "@shopify/app-bridge-react";
import { ArrowLeft } from "lucide-react";
import TemplateEditor, { Block } from "@/components/TemplateEditor";
import TemplateGallery from "@/components/TemplateGallery";

export default function NewTemplate() {
  const shopify = useAppBridge();
  const router = useRouter();
  const shop = new URLSearchParams(window.location.search).get("shop") || "";
  const shopName = shop.replace(".myshopify.com", "");
  const toast = (msg: string, opts?: { isError?: boolean }) => shopify.toast.show(msg, opts);

  const [step, setStep] = useState<"gallery" | "editor">("gallery");
  const [name, setName] = useState("");
  const [subject, setSubject] = useState("");
  const [blocks, setBlocks] = useState<Block[]>([]);
  const [saving, setSaving] = useState(false);

  function handleUseTemplate(templateSubject: string, templateBlocks: Block[]) {
    setSubject(templateSubject);
    setBlocks(templateBlocks);
    setStep("editor");
  }

  async function handleSave() {
    if (!name.trim()) {
      toast("Template name is required", { isError: true });
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/shopify/templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ shop, name, subject, content: { blocks } }),
      });
      const data = await res.json();
      if (res.ok) {
        toast("Template created ✅");
        router.push(`/shopify/templates?shop=${shop}`);
      } else {
        toast(data.error || "Failed to create template", { isError: true });
      }
    } catch {
      toast("Something went wrong", { isError: true });
    } finally {
      setSaving(false);
    }
  }

  if (step === "gallery") {
    return (
      <div className="p-6 max-w-5xl mx-auto space-y-5">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">New Template</h1>
            <p className="text-sm text-gray-400 mt-1">Build a reusable block-based email template.</p>
          </div>
          <Link
            href={`/shopify/templates?shop=${shop}`}
            className="px-4 py-2 text-sm text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
          >
            Cancel
          </Link>
        </div>
        <TemplateGallery shopName={shopName} onUse={handleUseTemplate} />
      </div>
    );
  }

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-5">

      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <button
            onClick={() => setStep("gallery")}
            className="flex items-center gap-1.5 text-sm text-gray-400 hover:text-gray-700 mb-1"
          >
            <ArrowLeft size={14} /> Choose a different template
          </button>
          <h1 className="text-2xl font-bold text-gray-900">New Template</h1>
          <p className="text-sm text-gray-400 mt-1">Build a reusable block-based email template.</p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href={`/shopify/templates?shop=${shop}`}
            className="px-4 py-2 text-sm text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
          >
            Cancel
          </Link>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white text-sm font-medium rounded-lg hover:bg-green-700 disabled:opacity-50 transition-colors"
          >
            {saving ? "Saving..." : "Save Template"}
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
              placeholder="Welcome Email"
              className="w-full px-3 py-2 text-sm border border-gray-200 bg-gray-50 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 focus:bg-white transition-colors"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Subject Line</label>
            <input
              type="text"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="Welcome to {{shop_name}}!"
              className="w-full px-3 py-2 text-sm border border-gray-200 bg-gray-50 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 focus:bg-white transition-colors"
            />
          </div>
        </div>
      </div>

      {/* Block editor */}
      <TemplateEditor blocks={blocks} onChange={setBlocks} shopName={shopName} />
    </div>
  );
}
