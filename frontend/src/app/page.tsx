"use client";

import Link from "next/link";
import { useMemo } from "react";
import { Plus, Upload } from "lucide-react";
import { RecentDocs } from "@/components/dashboard/RecentDocs";
import { StatsRow } from "@/components/dashboard/StatsRow";
import { SuggestionsPanel } from "@/components/dashboard/SuggestionsPanel";
import { ToolsPanel } from "@/components/dashboard/ToolsPanel";
import { TrendChart } from "@/components/dashboard/TrendChart";
import { WritingAssistant } from "@/components/dashboard/WritingAssistant";
import { useShell } from "@/components/layout/ShellContext";
import { PageHeader } from "@/components/ui/PageHeader";
import { docMetrics, useLibrary } from "@/lib/store";

export default function OverviewPage() {
  const { docs } = useLibrary();
  const { openUpload } = useShell();

  const sorted = useMemo(() => [...docs].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)), [docs]);
  const metrics = useMemo(() => docMetrics(sorted), [sorted]);

  return (
    <>
      <PageHeader
        title="Overview"
        actions={
          <>
            <button onClick={openUpload} className="btn-outline rounded-full py-1.5 text-xs">
              <Upload className="h-3.5 w-3.5" />
              Upload File
            </button>
            <Link href="/studio" className="btn-primary rounded-full py-1.5 text-xs">
              <Plus className="h-3.5 w-3.5" />
              New Document
            </Link>
          </>
        }
      />

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="flex min-w-0 flex-col gap-4">
          <WritingAssistant metrics={metrics} />
          <StatsRow metrics={metrics} />
          <TrendChart metrics={metrics} />
          <RecentDocs metrics={metrics} />
        </div>
        <div className="flex min-w-0 flex-col gap-4">
          <SuggestionsPanel latest={sorted[0]} />
          <ToolsPanel />
        </div>
      </div>
    </>
  );
}
