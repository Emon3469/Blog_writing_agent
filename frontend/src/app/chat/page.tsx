import type { Metadata } from "next";
import { Suspense } from "react";
import { ChatView } from "@/components/chat/ChatView";

export const metadata: Metadata = { title: "Chats" };

export default function ChatPage() {
  return (
    <Suspense fallback={<div className="skeleton h-[75vh] w-full rounded-2xl" />}>
      <ChatView />
    </Suspense>
  );
}
