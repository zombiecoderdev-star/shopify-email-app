"use client";

import dynamic from "next/dynamic";

const Customers = dynamic(() => import("./Customers"), { ssr: false });

export default function CustomersPage() {
  return <Customers />;
}
