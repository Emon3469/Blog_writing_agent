import type { Metadata } from "next";
import { DocumentEditor } from "@/components/documents/DocumentEditor";

export const metadata: Metadata = { title: "Editor" };

export default function DocumentPage() {
  return <DocumentEditor />;
}
