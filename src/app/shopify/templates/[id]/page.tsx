"use client";

import dynamic from "next/dynamic";

const EditTemplate = dynamic(() => import("./EditTemplate"), { ssr: false });

export default function EditTemplatePage() {
  return <EditTemplate />;
}
