import Link from "next/link";

export default function NotFound() {
  return (
    <div className="card grid place-items-center px-6 py-24 text-center">
      <p className="text-5xl font-semibold tracking-tight">404</p>
      <p className="mt-3 font-medium">This page doesn&apos;t exist</p>
      <p className="mt-1 text-sm text-muted">The link may be broken or the page may have moved.</p>
      <Link href="/" className="btn-primary mt-6 rounded-full">
        Back to Overview
      </Link>
    </div>
  );
}
