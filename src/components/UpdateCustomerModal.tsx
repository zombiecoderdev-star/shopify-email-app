"use client";

import { useState } from "react";
import { X, Loader2 } from "lucide-react";

type Contact = {
  id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
  subscribed: boolean;
  shopify_customer_id: string;
};

type Props = {
  shop: string;
  contact: Contact;
  onClose: () => void;
  onSuccess: (updated: Contact) => void;
  showToast: (msg: string, opts?: { isError?: boolean }) => void;
};

export default function UpdateCustomerModal({
  shop, contact, onClose, onSuccess, showToast,
}: Props) {
  const [form, setForm] = useState({
    first_name: contact.first_name || "",
    last_name: contact.last_name || "",
    phone: contact.phone || "",
    subscribed: contact.subscribed,
  });
  const [loading, setLoading] = useState(false);

  function set(field: string, value: string | boolean) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  async function handleSubmit() {
    setLoading(true);
    try {
      const res = await fetch("/api/shopify/customers/update", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          shop,
          shopify_customer_id: contact.shopify_customer_id,
          ...form,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        showToast(data.error || "Update failed", { isError: true });
        return;
      }

      showToast("Customer updated successfully ✅");
      onSuccess({ ...contact, ...form });
      onClose();
    } catch {
      showToast("Something went wrong", { isError: true });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">

        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div>
            <h2 className="text-base font-bold text-gray-900">Update Customer</h2>
            <p className="text-xs text-gray-400 mt-0.5">{contact.email}</p>
          </div>
          <button onClick={onClose} className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-gray-100">
            <X size={15} className="text-gray-400" />
          </button>
        </div>

        <div className="px-6 py-5 space-y-4">

          {/* Email — read only, shown for reference */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              Email Address <span className="text-gray-400">(not editable via Shopify API)</span>
            </label>
            <input
              type="email"
              value={contact.email}
              disabled
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg bg-gray-100 text-gray-400 cursor-not-allowed"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label="First Name" value={form.first_name} onChange={(v) => set("first_name", v)} placeholder="John" />
            <Field label="Last Name" value={form.last_name} onChange={(v) => set("last_name", v)} placeholder="Doe" />
          </div>

          <Field label="Phone" value={form.phone} onChange={(v) => set("phone", v)} placeholder="+1 555 000 0000" type="tel" />

          {/* Subscription toggle */}
          <div className="flex items-center justify-between py-1">
            <div>
              <p className="text-sm font-medium text-gray-700">Email Marketing Consent</p>
              <p className="text-xs text-gray-400 mt-0.5">Subscribe to marketing emails</p>
            </div>
            <button
              onClick={() => set("subscribed", !form.subscribed)}
              className={`relative w-10 h-5 rounded-full transition-colors ${
                form.subscribed ? "bg-green-500" : "bg-gray-200"
              }`}
            >
              <span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${
                form.subscribed ? "translate-x-5" : "translate-x-0.5"
              }`} />
            </button>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-gray-100">
          <button
            onClick={onClose}
            disabled={loading}
            className="px-4 py-2 text-sm text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={loading}
            className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white text-sm font-medium rounded-lg hover:bg-green-700 disabled:opacity-50"
          >
            {loading && <Loader2 size={14} className="animate-spin" />}
            {loading ? "Saving..." : "Save Changes"}
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, value, onChange, placeholder, type = "text" }: {
  label: string; value: string; onChange: (v: string) => void;
  placeholder?: string; type?: string;
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-600 mb-1">{label}</label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full px-3 py-2 text-sm border border-gray-200 bg-gray-50 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 focus:bg-white transition-colors"
      />
    </div>
  );
}
