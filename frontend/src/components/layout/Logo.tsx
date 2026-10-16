import { cn } from "@/lib/utils";

export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" aria-hidden className={cn("h-8 w-8", className)}>
      <rect width="32" height="32" rx="9" className="fill-ink" />
      <path
        d="M21.6 7.8c-4.6.4-9 3.9-10.4 9.6l-1.5 6.1 1.2 1.2 6.1-1.5c5.7-1.4 9.2-5.8 9.6-10.4l-2.4.3-1.1-2.4-1.5-2.9Z"
        className="fill-canvas"
      />
      <path d="m10.2 22.6 6.4-6.4" strokeWidth="1.6" strokeLinecap="round" className="stroke-ink" />
      <circle cx="17.4" cy="15.3" r="1.5" className="fill-ink" />
    </svg>
  );
}

export function Logo({ className }: { className?: string }) {
  return (
    <span className={cn("flex items-center gap-2.5", className)}>
      <LogoMark />
      <span className="text-[17px] font-semibold tracking-tight text-ink">Draftsmith</span>
    </span>
  );
}
