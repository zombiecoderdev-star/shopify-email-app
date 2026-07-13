"use client";

import dynamic from "next/dynamic";

const Templates = dynamic(() => import("./Templates"), { ssr: false });

export default function TemplatesPage() {
  return <Templates />;
}
