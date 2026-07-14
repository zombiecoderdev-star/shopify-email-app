"use client";

import dynamic from "next/dynamic";

const Sending = dynamic(() => import("./Sending"), { ssr: false });

export default function SendingPage() {
  return <Sending />;
}
