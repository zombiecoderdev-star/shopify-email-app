"use client";

import { X, Mail, Phone, ShoppingBag, Calendar, Tag, Edit2 } from "lucide-react";

type Contact = {
  id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
  orders_count: number;
  total_spent: number;
  subscribed: boolean;
  tags: string[];
  shopify_customer_id: string;
  created_at?: string;
  last_order_at?: string | null;
};

type Props = {
  contact: Contact;
  onClose: () => void;
  onUpdate: (contact: Contact) => void;
};

export default function ViewCustomerPanel({ contact, onClose, onUpdate }: Props) {
  const fullName = [contact.first_name, contact.last_name].filter(Boolean).join(" ") || "No name";
  const initials = (contact.first_name?.[0] || contact.email[0]).toUpperCase();

  return (
    <>
      <div className="fixed inset-0 bg-black/20 z-40" onClick={onClose} />
      <div className="fixed right-0 top-0 h-full w-96 bg-white shadow-2xl z-50 flex flex-col">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h2 className="text-sm font-bold text-gray-900">Customer Details</h2>
          <button onClick={onClose} className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-gray-100">
            <X size={15} className="text-gray-400" />
          </button>
        </div>

        <div className="flex-1 overflow-auto p-5 space-y-5">

          {/* Avatar + name + status */}
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-full bg-green-100 flex items-center justify-center text-xl font-bold text-green-700 flex-shrink-0">
              {initials}
            </div>
            <div className="space-y-1">
              <p className="text-lg font-bold text-gray-900">{fullName}</p>
              <div className="flex items-center gap-2">
                <span className={`inline-flex px-2 py-0.5 rounded text-xs font-semibold ${
                  contact.subscribed ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"
                }`}>
                  {contact.subscribed ? "SUBSCRIBED" : "UNSUBSCRIBED"}
                </span>
              </div>
            </div>
          </div>

          {/* Contact info */}
          <Section title="Contact Information">
            <InfoRow icon={<Mail size={13} className="text-gray-400" />} label="Email" value={contact.email} />
            <InfoRow icon={<Phone size={13} className="text-gray-400" />} label="Phone" value={contact.phone || "—"} />
          </Section>

          {/* Order stats */}
          <Section title="Order Statistics">
            <div className="grid grid-cols-2 gap-3">
              <StatBox icon={<ShoppingBag size={14} className="text-purple-500" />} label="Total Orders" value={String(contact.orders_count)} />
              <StatBox icon={<span className="text-green-500 text-sm font-bold">$</span>} label="Total Spent" value={`$${parseFloat(String(contact.total_spent)).toFixed(2)}`} />
            </div>
            {contact.last_order_at && (
              <InfoRow icon={<Calendar size={13} className="text-gray-400" />} label="Last Order" value={new Date(contact.last_order_at).toLocaleDateString()} />
            )}
          </Section>

          {/* Tags */}
          <Section title="Tags">
            {contact.tags?.length > 0 ? (
              <div className="flex flex-wrap gap-1.5">
                {contact.tags.map((tag) => (
                  <span key={tag} className="flex items-center gap-1 px-2 py-1 bg-gray-100 text-gray-600 text-xs rounded-md">
                    <Tag size={10} />
                    {tag}
                  </span>
                ))}
              </div>
            ) : (
              <p className="text-xs text-gray-400">No tags</p>
            )}
          </Section>

          {/* Meta */}
          <Section title="Shopify Info">
            <InfoRow icon={<span className="text-gray-400 text-xs font-mono">#</span>} label="Shopify ID" value={contact.shopify_customer_id} mono />
            {contact.created_at && (
              <InfoRow
                icon={<Calendar size={13} className="text-gray-400" />}
                label="Customer Since"
                value={new Date(contact.created_at).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}
              />
            )}
          </Section>
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-gray-100">
          <button
            onClick={() => onUpdate(contact)}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-green-600 text-white text-sm font-medium rounded-lg hover:bg-green-700 transition-colors"
          >
            <Edit2 size={14} />
            Update Customer
          </button>
        </div>
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

function InfoRow({ icon, label, value, mono }: { icon: React.ReactNode; label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-start gap-2.5 py-1.5 border-b border-gray-50 last:border-0">
      <span className="mt-0.5 flex-shrink-0">{icon}</span>
      <div className="flex-1 min-w-0">
        <p className="text-xs text-gray-400">{label}</p>
        <p className={`text-sm text-gray-800 truncate ${mono ? "font-mono" : "font-medium"}`}>{value}</p>
      </div>
    </div>
  );
}

function StatBox({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="bg-gray-50 rounded-lg p-3 flex items-start gap-2">
      <span className="mt-0.5">{icon}</span>
      <div>
        <p className="text-xs text-gray-400">{label}</p>
        <p className="text-base font-bold text-gray-900">{value}</p>
      </div>
    </div>
  );
}