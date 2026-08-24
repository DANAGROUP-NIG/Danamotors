"use client";

import { useState } from "react";

//components
import HeaderSearch from "./HeaderSearch";
import UserDropdown from "./UserDropdown";
import FeedbackModal from "@/components/modals/FeedbackModal";
import { NotificationBell } from "@/features/notification";

//icons
import { Menu, MessageSquare } from "lucide-react";

type mainHeaderProbs = {
  setSidebarOpen: (v: boolean) => void;
};

export default function MainHeader({ setSidebarOpen }: mainHeaderProbs) {
  const [feedbackOpen, setFeedbackOpen] = useState(false);

  return (
    <header className="flex h-16 shrink-0 items-center gap-3 border-b border-[#e8edf3] bg-white px-4 lg:px-6">
      {/* Mobile hamburger */}
      <button
        className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-700 lg:hidden"
        onClick={() => setSidebarOpen(true)}
        aria-label="Open navigation"
      >
        <Menu className="size-5" />
      </button>

      {/* Global search */}
      <HeaderSearch />

      {/* Right actions */}
      <div className="ml-auto flex items-center gap-1">
        <NotificationBell />

        <button
          onClick={() => setFeedbackOpen(true)}
          className="rounded-lg p-2 text-slate-500 transition hover:bg-slate-100 hover:text-slate-700"
          aria-label="Send feedback"
        >
          <MessageSquare className="size-[18px]" />
        </button>

        <div className="mx-1 h-6 w-px bg-slate-200" aria-hidden="true" />

        <UserDropdown />
      </div>

      {/* Feedback modal */}
      <FeedbackModal
        isOpen={feedbackOpen}
        onClose={() => setFeedbackOpen(false)}
      />
    </header>
  );
}
