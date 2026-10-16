import type { Metadata } from "next";
import { Suspense } from "react";
import { StudioView } from "@/components/studio/StudioView";

export const metadata: Metadata = { title: "Blog Studio" };

export default function StudioPage() {
  return (
    <Suspense fallback={<div className="skeleton h-[70vh] w-full rounded-2xl" />}>
      <StudioView />
    </Suspense>
  );
}
