"use client";

import { useState } from "react";
import { X, Loader2 } from "lucide-react";

type Props = {
  shop: string;
  // When set, this modal targets the admin-scoped API (any shop, chosen via
  // a selector) instead of the embedded Shopify app's own shop/session.
  shopId?: string;
  onClose: () => void;
  onSuccess: () => void;
  showToast: (msg: string, opts?: { isError?: boolean }) => void;
};

type FormData = {
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  subscribed: boolean;
};

const INITIAL: FormData = {
  first_name: "",
  last_name: "",
  email: "",
  phone: "",
  subscribed: true,
};

export default function AddCustomerModal({
  shop,
  shopId,
  onClose,
  onSuccess,
  showToast,
}: Props) {
  const [form, setForm] = useState<FormData>(INITIAL);
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<Partial<FormData>>({});

  function validate() {
    const e: Partial<FormData> = {};
    if (!form.email) e.email = "Email is required";
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email))
      e.email = "Enter a valid email address";
    return e;
  }

  async function handleSubmit() {
    const e = validate();
    if (Object.keys(e).length > 0) {
      setErrors(e);
      return;
    }
    setErrors({});
    setLoading(true);

    try {
      const endpoint = shopId ? "/api/admin/contacts/create" : "/api/shopify/customers/create";
      const body = shopId ? { shop_id: shopId, ...form } : { shop, ...form };
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const data = await res.json();

      if (!res.ok) {
        showToast(data.error || "Failed to create customer", { isError: true });
        return;
      }

      showToast(
        `Customer ${form.first_name || form.email} created successfully ✅`
      );
      onSuccess();
      onClose();
    } catch {
      showToast("Something went wrong", { isError: true });
    } finally {
      setLoading(false);
    }
  }

  function set(field: keyof FormData, value: string | boolean) {
    setForm((f) => ({ ...f, [field]: value }));
    if (errors[field]) setErrors((e) => ({ ...e, [field]: undefined }));
  }

  return (
    // Backdrop
    <div
      className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">

        {/* Modal header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div>
            <h2 className="text-base font-bold text-gray-900">Add Customer</h2>
            <p className="text-xs text-gray-400 mt-0.5">
              Creates the customer in Shopify and syncs to your contacts list.
            </p>
          </div>
          <button
            onClick={onClose}
            className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-gray-100 transition-colors"
          >
            <X size={15} className="text-gray-400" />
          </button>
        </div>

        {/* Form */}
        <div className="px-6 py-5 space-y-4">

          {/* Name row */}
          <div className="grid grid-cols-2 gap-3">
            <Field
              label="First Name"
              value={form.first_name}
              onChange={(v) => set("first_name", v)}
              placeholder="John"
            />
            <Field
              label="Last Name"
              value={form.last_name}
              onChange={(v) => set("last_name", v)}
              placeholder="Doe"
            />
          </div>

          {/* Email */}
          <Field
            label="Email Address"
            required
            value={form.email}
            onChange={(v) => set("email", v)}
            placeholder="john@example.com"
            type="email"
            error={errors.email}
          />

          {/* Phone */}
          <Field
            label="Phone"
            value={form.phone}
            onChange={(v) => set("phone", v)}
            placeholder="+1 555 000 0000"
            type="tel"
          />

          {/* Marketing consent toggle */}
          <div className="flex items-center justify-between py-1">
            <div>
              <p className="text-sm font-medium text-gray-700">
                Email Marketing Consent
              </p>
              <p className="text-xs text-gray-400 mt-0.5">
                Subscribe to marketing emails (GDPR compliant)
              </p>
            </div>
            <button
              onClick={() => set("subscribed", !form.subscribed)}
              className={`relative w-10 h-5 rounded-full transition-colors ${
                form.subscribed ? "bg-green-500" : "bg-gray-200"
              }`}
            >
              <span
                className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${
                  form.subscribed ? "translate-x-5" : "translate-x-0.5"
                }`}
              />
            </button>
          </div>

        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-gray-100">
          <button
            onClick={onClose}
            disabled={loading}
            className="px-4 py-2 text-sm text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={loading}
            className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white text-sm font-medium rounded-lg hover:bg-green-700 disabled:opacity-50 transition-colors"
          >
            {loading && <Loader2 size={14} className="animate-spin" />}
            {loading ? "Creating..." : "Add Customer"}
          </button>
        </div>

      </div>
    </div>
  );
}

// Reusable field component
function Field({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
  required,
  error,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
  required?: boolean;
  error?: string;
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-600 mb-1">
        {label}
        {required && <span className="text-red-400 ml-0.5">*</span>}
      </label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={`w-full px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 transition-colors ${
          error
            ? "border-red-300 bg-red-50 focus:ring-red-400"
            : "border-gray-200 bg-gray-50 focus:bg-white"
        }`}
      />
      {error && <p className="text-xs text-red-500 mt-1">{error}</p>}
    </div>
  );
}
