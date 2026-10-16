"use client";

import { useRef, useState, type ReactNode } from "react";
import { Download, RefreshCw, Server, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";
import { ThemeSegment } from "@/components/layout/ThemeToggle";
import { PageHeader } from "@/components/ui/PageHeader";
import { API_URL } from "@/lib/api";
import { refreshHealth, useServerHealth } from "@/lib/health";
import { clearLibrary, importDocs, updatePreferences, useLibrary, usePreferences, type Doc } from "@/lib/store";
import { cn, downloadFile } from "@/lib/utils";

function Section({ title, description, children }: { title: string; description: string; children: ReactNode }) {
  return (
    <section className="card grid gap-4 p-5 md:grid-cols-[260px_minmax(0,1fr)] md:gap-8">
      <div>
        <h2 className="font-semibold tracking-tight">{title}</h2>
        <p className="mt-1 text-xs leading-relaxed text-muted">{description}</p>
      </div>
      <div className="min-w-0">{children}</div>
    </section>
  );
}

export function SettingsView() {
  const prefs = usePreferences();
  const { docs, conversations } = useLibrary();
  const server = useServerHealth();
  const [checking, setChecking] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const recheck = async () => {
    setChecking(true);
    await refreshHealth();
    setChecking(false);
  };

  const backup = () => {
    downloadFile(`draftsmith-backup-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify({ version: 1, docs }, null, 2), "application/json");
  };

  const restore = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    try {
      const data = JSON.parse(await file.text());
      const incoming = (Array.isArray(data?.docs) ? data.docs : []).filter(
        (d: Partial<Doc>) => typeof d?.id === "string" && typeof d?.content === "string" && typeof d?.title === "string",
      ) as Doc[];
      if (!incoming.length) throw new Error("empty");
      importDocs(incoming);
      toast.success(`Restored ${incoming.length} document${incoming.length > 1 ? "s" : ""}`);
    } catch {
      toast.error("That file isn't a valid Draftsmith backup");
    }
  };

  return (
    <>
      <PageHeader title="Settings" description="Personalise your workspace and generation defaults." />
      <div className="flex flex-col gap-4">
        <Section title="Appearance" description="Choose light, dark, or follow your operating system.">
          <ThemeSegment />
        </Section>

        <Section title="Profile" description="Used to personalise greetings. Stored only in this browser.">
          <label htmlFor="name" className="label">
            Display name
          </label>
          <input
            id="name"
            value={prefs.name}
            onChange={(e) => updatePreferences({ name: e.target.value.slice(0, 60) })}
            placeholder="e.g. Alex Morgan"
            className="input max-w-sm"
          />
        </Section>

        <Section title="Generation defaults" description="Applied in Blog Studio whenever you don't override them.">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="tone" className="label">
                Default tone
              </label>
              <input id="tone" value={prefs.defaultTone} onChange={(e) => updatePreferences({ defaultTone: e.target.value.slice(0, 80) })} className="input" />
            </div>
            <div>
              <label htmlFor="audience" className="label">
                Default audience
              </label>
              <input
                id="audience"
                value={prefs.defaultAudience}
                onChange={(e) => updatePreferences({ defaultAudience: e.target.value.slice(0, 120) })}
                placeholder="e.g. Software engineers"
                className="input"
              />
            </div>
            <div>
              <p className="label">Default length</p>
              <div className="inline-flex rounded-xl border border-line bg-subtle p-1">
                {(["short", "medium", "long"] as const).map((l) => (
                  <button
                    key={l}
                    onClick={() => updatePreferences({ defaultLength: l })}
                    className={cn(
                      "rounded-lg px-3 py-1.5 text-xs capitalize transition",
                      prefs.defaultLength === l ? "bg-surface font-medium text-ink shadow-[var(--shadow-card)]" : "text-muted hover:text-ink",
                    )}
                  >
                    {l}
                  </button>
                ))}
              </div>
            </div>
            <label className="flex cursor-pointer items-center gap-3 self-end text-sm">
              <input
                type="checkbox"
                checked={prefs.includeImages}
                onChange={(e) => updatePreferences({ includeImages: e.target.checked })}
                className="h-4 w-4 accent-[var(--ink)]"
              />
              Include illustrations by default
            </label>
          </div>
        </Section>

        <Section title="Writing server" description="Status of the API that runs the agent and language models.">
          <div className="flex flex-wrap items-center gap-3">
            <span className="flex items-center gap-2 rounded-full border border-line px-3 py-1.5 text-xs">
              <span
                className={cn(
                  "h-2 w-2 rounded-full",
                  server.state === "online" ? "bg-success" : server.state === "offline" ? "bg-danger" : "animate-pulse bg-warning",
                )}
              />
              <span className="capitalize">{server.state === "waking" ? "Waking up" : server.state}</span>
            </span>
            <code className="truncate rounded-lg bg-subtle px-2 py-1 text-xs text-muted">{API_URL}</code>
            <button onClick={recheck} disabled={checking} className="btn-outline px-2.5 py-1.5 text-xs">
              <RefreshCw className={cn("h-3.5 w-3.5", checking && "animate-spin")} />
              Check
            </button>
          </div>
          {server.health && (
            <div className="mt-4 overflow-hidden rounded-xl border border-line">
              <table className="w-full text-left text-xs">
                <thead className="bg-subtle text-muted">
                  <tr>
                    <th className="px-3 py-2 font-medium">Priority</th>
                    <th className="px-3 py-2 font-medium">Provider</th>
                    <th className="px-3 py-2 font-medium">Model</th>
                    <th className="px-3 py-2 font-medium">State</th>
                  </tr>
                </thead>
                <tbody>
                  {server.health.providers.map((p, i) => (
                    <tr key={`${p.name}-${p.model}`} className="border-t border-line">
                      <td className="px-3 py-2 tabular-nums text-muted">{i + 1}</td>
                      <td className="px-3 py-2 font-medium">{p.label}</td>
                      <td className="px-3 py-2 font-mono text-[11px] text-muted">{p.model}</td>
                      <td className="px-3 py-2">
                        {p.available ? (
                          <span className="text-success">Ready</span>
                        ) : (
                          <span className="text-warning">Cooling down {p.cooldown_seconds}s</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="flex items-center gap-2 border-t border-line px-3 py-2 text-xs text-muted">
                <Server className="h-3.5 w-3.5" />
                Automatic fallback in priority order · Web research {server.health.research ? "enabled" : "disabled"}
              </p>
            </div>
          )}
        </Section>

        <Section title="Data" description="Everything is stored locally in your browser. Back it up or move it to another device.">
          <p className="mb-3 text-sm text-muted">
            {docs.length} document{docs.length === 1 ? "" : "s"} · {conversations.length} conversation{conversations.length === 1 ? "" : "s"}
          </p>
          <div className="flex flex-wrap gap-2">
            <button onClick={backup} disabled={!docs.length} className="btn-outline text-xs">
              <Download className="h-3.5 w-3.5" />
              Back up
            </button>
            <button onClick={() => fileRef.current?.click()} className="btn-outline text-xs">
              <Upload className="h-3.5 w-3.5" />
              Restore
            </button>
            <button
              onClick={() => {
                if (window.confirm("Delete all documents, chats and notifications from this browser?")) {
                  clearLibrary();
                  toast("Workspace cleared");
                }
              }}
              className="btn-outline text-xs text-danger"
            >
              <Trash2 className="h-3.5 w-3.5" />
              Clear workspace
            </button>
            <input ref={fileRef} type="file" accept="application/json,.json" className="hidden" onChange={restore} />
          </div>
        </Section>
      </div>
    </>
  );
}
