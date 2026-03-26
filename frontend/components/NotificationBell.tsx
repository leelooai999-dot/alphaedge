"use client";

import { useState, useEffect, useRef } from "react";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "";

interface Notification {
  id: number;
  type: string;
  message: string;
  reference_id: string | null;
  is_read: number;
  created_at: string;
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "now";
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

function notifIcon(type: string): string {
  const icons: Record<string, string> = {
    comment: "💬",
    fork: "🔄",
    like: "❤️",
    badge: "🏅",
    accuracy: "🎯",
    follow: "👥",
    points: "⭐",
  };
  return icons[type] || "📢";
}

export default function NotificationBell({ userId }: { userId: string | null }) {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unread, setUnread] = useState(0);
  const [open, setOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!userId) return;

    const load = async () => {
      try {
        const res = await fetch(`${API_BASE}/api/notifications?user_id=${userId}&limit=20`);
        if (res.ok) {
          const data = await res.json();
          const items = data.notifications || [];
          setNotifications(items);
          setUnread(items.filter((n: Notification) => !n.is_read).length);
        }
      } catch { /* silent */ }
    };

    load();
    // Poll every 60 seconds
    const interval = setInterval(load, 60000);
    return () => clearInterval(interval);
  }, [userId]);

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const markRead = async (id: number) => {
    try {
      await fetch(`${API_BASE}/api/notifications/${id}/read`, { method: "POST" });
      setNotifications(prev => prev.map(n => n.id === id ? { ...n, is_read: 1 } : n));
      setUnread(prev => Math.max(0, prev - 1));
    } catch { /* silent */ }
  };

  if (!userId) return null;

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setOpen(!open)}
        className="relative p-1.5 text-muted hover:text-white transition-colors"
      >
        🔔
        {unread > 0 && (
          <span className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-red-500 text-[9px] text-white font-bold rounded-full flex items-center justify-center">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-8 w-72 bg-card border border-border rounded-xl shadow-lg overflow-hidden z-50 max-h-80 overflow-y-auto">
          <div className="px-3 py-2 border-b border-border flex items-center justify-between">
            <span className="text-xs font-medium text-white">Notifications</span>
            {unread > 0 && (
              <span className="text-[10px] text-accent">{unread} new</span>
            )}
          </div>

          {notifications.length === 0 ? (
            <div className="px-3 py-6 text-center text-xs text-muted">
              No notifications yet
            </div>
          ) : (
            notifications.map((n) => (
              <div
                key={n.id}
                onClick={() => { if (!n.is_read) markRead(n.id); }}
                className={`px-3 py-2 border-b border-border/50 cursor-pointer hover:bg-border/20 transition-colors ${
                  !n.is_read ? "bg-accent/5" : ""
                }`}
              >
                <div className="flex items-start gap-2">
                  <span className="text-sm mt-0.5">{notifIcon(n.type)}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-white leading-relaxed">{n.message}</p>
                    <p className="text-[10px] text-muted mt-0.5">{timeAgo(n.created_at)}</p>
                  </div>
                  {!n.is_read && (
                    <span className="w-2 h-2 rounded-full bg-accent mt-1 flex-shrink-0" />
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
