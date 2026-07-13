"use client";

import dynamic from "next/dynamic";

const NewTemplate = dynamic(() => import("./NewTemplate"), { ssr: false });

export default function NewTemplatePage() {
  return <NewTemplate />;
}
