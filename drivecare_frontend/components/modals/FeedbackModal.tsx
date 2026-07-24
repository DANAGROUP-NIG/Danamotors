"use client";

import { useState } from "react";
import { toast } from "sonner";
import ModalFame from "@/components/modals/ModalFame";

interface FeedbackModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const CATEGORIES = ["Bug", "Suggestion", "General"] as const;

export default function FeedbackModal({ isOpen, onClose }: FeedbackModalProps) {
  const [category, setCategory] = useState<string>("General");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!message.trim()) return;

    setSubmitting(true);
    // Placeholder — replace with actual API call when backend is ready
    await new Promise((r) => setTimeout(r, 800));
    toast.success("Feedback submitted — thank you!");
    setSubmitting(false);
    setMessage("");
    setCategory("General");
    onClose();
  };

  const handleClose = () => {
    setMessage("");
    setCategory("General");
    onClose();
  };

  return (
    <ModalFame isOpen={isOpen} onClose={handleClose} title="Send Feedback">
      <div className="space-y-4">
        {/* Category */}
        <div>
          <label className="mb-1.5 block text-sm font-medium text-slate-700">
            Category
          </label>
          <div className="flex gap-2">
            {CATEGORIES.map((cat) => (
              <button
                key={cat}
                type="button"
                onClick={() => setCategory(cat)}
                className={`rounded-lg px-3 py-1.5 text-sm font-medium transition ${
                  category === cat
                    ? "bg-primary text-white"
                    : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                }`}
              >
                {cat}
              </button>
            ))}
          </div>
        </div>

        {/* Message */}
        <div>
          <label
            htmlFor="feedback-message"
            className="mb-1.5 block text-sm font-medium text-slate-700"
          >
            Message
          </label>
          <textarea
            id="feedback-message"
            rows={4}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Tell us what's on your mind…"
            className="w-full rounded-lg border border-slate-200 bg-[#f8fafc] px-3 py-2.5 text-sm text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-primary focus:ring-2 focus:ring-primary/20"
          />
        </div>

        {/* Actions */}
        <div className="flex items-center justify-end gap-3 pt-2">
          <button
            type="button"
            onClick={handleClose}
            className="rounded-lg px-4 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-100"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!message.trim() || submitting}
            className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white transition hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {submitting ? "Submitting…" : "Submit"}
          </button>
        </div>
      </div>
    </ModalFame>
  );
}
