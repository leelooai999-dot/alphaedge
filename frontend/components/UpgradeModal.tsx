"use client";

import { createPortal } from "react-dom";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { getUpgradeCopy } from "@/lib/billing";

interface UpgradeModalProps {
  isOpen: boolean;
  onClose: () => void;
  reason: "events" | "pine";
  currentCount: number;
  maxAllowed: number;
}

export default function UpgradeModal({ isOpen, onClose, reason, currentCount, maxAllowed }: UpgradeModalProps) {
  const router = useRouter();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!isOpen || !mounted) return null;

  const title = reason === "events"
    ? "Want more events?"
    : "Want more Pine overlays?";

  const description = getUpgradeCopy(reason, maxAllowed);

  const icon = reason === "events" ? "⚡" : "📊";

  const modal = (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center"
      onClick={onClose}
    >
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div
        className="relative bg-card border border-border rounded-2xl p-6 max-w-md w-full mx-4 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-3 right-3 text-muted hover:text-white transition-colors"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>

        {/* Content */}
        <div className="text-center mb-6">
          <div className="text-4xl mb-3">{icon}</div>
          <h2 className="text-xl font-bold text-white mb-2">{title}</h2>
          <p className="text-muted text-sm leading-relaxed">{description}</p>
        </div>

        {/* Comparison */}
        <div className="grid grid-cols-2 gap-3 mb-6">
          <div className="bg-bg border border-border rounded-xl p-3 text-center">
            <div className="text-xs text-muted mb-1">Free</div>
            <div className="text-lg font-bold text-white">{maxAllowed}</div>
            <div className="text-[10px] text-muted">{reason === "events" ? "events" : "overlay"}</div>
          </div>
          <div className="bg-accent/10 border border-accent/30 rounded-xl p-3 text-center">
            <div className="text-xs text-accent mb-1">Pro</div>
            <div className="text-lg font-bold text-accent">∞</div>
            <div className="text-[10px] text-accent/80">unlimited</div>
          </div>
        </div>

        {/* CTA */}
        <button
          onClick={() => {
            onClose();
            router.push("/pricing");
          }}
          className="w-full py-3 bg-accent text-white font-bold rounded-xl hover:bg-accent/90 transition-colors"
        >
          See Pro plan →
        </button>
        <button
          onClick={onClose}
          className="w-full mt-2 py-2 text-muted text-sm hover:text-white transition-colors"
        >
          Maybe later
        </button>
      </div>
    </div>
  );

  return createPortal(modal, document.body);
}
