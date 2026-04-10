"use client";

import posthog from "posthog-js";
import { PostHogProvider as PHProvider } from "posthog-js/react";
import { useEffect } from "react";

const POSTHOG_KEY = process.env.NEXT_PUBLIC_POSTHOG_KEY || "";
const POSTHOG_HOST = process.env.NEXT_PUBLIC_POSTHOG_HOST || "https://us.i.posthog.com";

export default function PostHogProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    if (!POSTHOG_KEY) return;
    posthog.init(POSTHOG_KEY, {
      api_host: POSTHOG_HOST,
      person_profiles: "identified_only",
      capture_pageview: true,
      capture_pageleave: true,
      autocapture: true,
      sanitize_properties: (properties) => {
        const next = { ...(properties || {}) };
        for (const key of Object.keys(next)) {
          const lowered = key.toLowerCase();
          if (
            lowered.includes("password") ||
            lowered.includes("token") ||
            lowered.includes("secret") ||
            lowered.includes("authorization") ||
            lowered.includes("email")
          ) {
            delete next[key];
          }
        }
        return next;
      },
      session_recording: {
        maskAllInputs: true,
        blockClass: "ph-no-capture",
        blockSelector: "[data-sensitive='true']",
        maskInputOptions: {
          password: true,
          email: true,
        },
      },
      loaded: (ph) => {
        const path = window.location.pathname || "";
        const isSensitivePath =
          path.startsWith("/login") ||
          path.startsWith("/register") ||
          path.startsWith("/forgot-password") ||
          path.startsWith("/reset-password") ||
          path.startsWith("/settings") ||
          path.startsWith("/billing") ||
          path.startsWith("/admin") ||
          path.startsWith("/upgrade") ||
          path.startsWith("/checkout") ||
          path.startsWith("/creator");

        if (isSensitivePath) {
          ph.opt_out_capturing();
          ph.stopSessionRecording();
        }
      },
    });
  }, []);

  if (!POSTHOG_KEY) return <>{children}</>;

  return <PHProvider client={posthog}>{children}</PHProvider>;
}

// Helper to identify users after login
export function identifyUser(userId: string, properties?: Record<string, any>) {
  if (!POSTHOG_KEY) return;
  posthog.identify(userId, properties);
}

// Helper to track custom events
export function trackEvent(event: string, properties?: Record<string, any>) {
  if (!POSTHOG_KEY) return;
  posthog.capture(event, properties);
}

// Helper to reset on logout
export function resetUser() {
  if (!POSTHOG_KEY) return;
  posthog.reset();
}
