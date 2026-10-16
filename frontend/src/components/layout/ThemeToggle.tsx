"use client";

import { Monitor, Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { useHydrated } from "@/lib/store";
import { cn } from "@/lib/utils";

export function ThemeToggle({ className }: { className?: string }) {
  const { resolvedTheme, setTheme } = useTheme();
  const hydrated = useHydrated();
  const dark = hydrated && resolvedTheme === "dark";

  return (
    <button
      onClick={() => setTheme(dark ? "light" : "dark")}
      aria-label={dark ? "Switch to light mode" : "Switch to dark mode"}
      title={dark ? "Light mode" : "Dark mode"}
      className={cn(
        "relative grid h-10 w-10 place-items-center rounded-full border border-line bg-surface text-ink transition hover:bg-subtle",
        className,
      )}
    >
      <Sun className={cn("h-[18px] w-[18px] transition-all", dark ? "scale-0 rotate-90" : "scale-100 rotate-0")} strokeWidth={1.75} />
      <Moon
        className={cn("absolute h-[18px] w-[18px] transition-all", dark ? "scale-100 rotate-0" : "scale-0 -rotate-90")}
        strokeWidth={1.75}
      />
    </button>
  );
}

export function ThemeSegment() {
  const { theme, setTheme } = useTheme();
  const hydrated = useHydrated();
  const current = hydrated ? theme : undefined;
  const options = [
    { id: "light", label: "Light", icon: Sun },
    { id: "dark", label: "Dark", icon: Moon },
    { id: "system", label: "System", icon: Monitor },
  ];
  return (
    <div className="inline-flex rounded-xl border border-line bg-subtle p-1">
      {options.map(({ id, label, icon: Icon }) => (
        <button
          key={id}
          onClick={() => setTheme(id)}
          className={cn(
            "flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm transition",
            current === id ? "bg-surface font-medium text-ink shadow-[var(--shadow-card)]" : "text-muted hover:text-ink",
          )}
        >
          <Icon className="h-4 w-4" strokeWidth={1.75} />
          {label}
        </button>
      ))}
    </div>
  );
}
