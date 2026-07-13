import { Suspense } from "react";
import AdminContacts from "./AdminContacts";

// AdminContacts reads ?shop_id= via useSearchParams, which requires a
// Suspense boundary so this route can still prerender the shell.
export default function AdminContactsPage() {
  return (
    <Suspense fallback={<div className="p-16 text-center text-gray-400 text-sm">Loading...</div>}>
      <AdminContacts />
    </Suspense>
  );
}
