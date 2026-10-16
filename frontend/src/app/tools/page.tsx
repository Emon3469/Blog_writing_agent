import type { Metadata } from "next";
import { Suspense } from "react";
import { ToolsView } from "@/components/tools/ToolsView";

export const metadata: Metadata = { title: "Rewrite Tools" };

export default function ToolsPage() {
  return (
    <Suspense fallback={<div className="skeleton h-[70vh] w-full rounded-2xl" />}>
      <ToolsView />
    </Suspense>
  );
}
