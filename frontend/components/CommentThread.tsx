"use client";

import { useState, useEffect, useCallback } from "react";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "";

interface Comment {
  id: string;
  scenario_id: string;
  user_id: string | null;
  author_name: string;
  content: string;
  parent_id: string | null;
  upvotes: number;
  created_at: string;
  replies?: Comment[];
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

function CommentItem({
  comment,
  onReply,
  depth = 0,
}: {
  comment: Comment;
  onReply: (parentId: string) => void;
  depth?: number;
}) {
  return (
    <div className={`${depth > 0 ? "ml-6 border-l border-border pl-3" : ""}`}>
      <div className="py-2">
        {/* Author + time */}
        <div className="flex items-center gap-2 mb-1">
          <div className="w-5 h-5 rounded-full bg-accent/15 flex items-center justify-center text-[10px] font-bold text-accent">
            {(comment.author_name || "A")[0].toUpperCase()}
          </div>
          <span className="text-xs font-medium text-white">{comment.author_name}</span>
          <span className="text-xs text-muted">· {timeAgo(comment.created_at)}</span>
        </div>

        {/* Content */}
        <p className="text-xs text-gray-300 leading-relaxed mb-1.5 pl-7">
          {comment.content}
        </p>

        {/* Actions */}
        <div className="flex items-center gap-3 pl-7">
          <button className="text-[10px] text-muted hover:text-white transition-colors">
            ↑ {comment.upvotes}
          </button>
          <button
            onClick={() => onReply(comment.id)}
            className="text-[10px] text-muted hover:text-accent transition-colors"
          >
            💬 Reply
          </button>
        </div>
      </div>

      {/* Replies */}
      {comment.replies && comment.replies.length > 0 && (
        <div className="mt-1">
          {comment.replies.map((reply) => (
            <CommentItem key={reply.id} comment={reply} onReply={onReply} depth={depth + 1} />
          ))}
        </div>
      )}
    </div>
  );
}

export default function CommentThread({ scenarioId }: { scenarioId: string }) {
  const [comments, setComments] = useState<Comment[]>([]);
  const [total, setTotal] = useState(0);
  const [newComment, setNewComment] = useState("");
  const [replyTo, setReplyTo] = useState<string | null>(null);
  const [authorName, setAuthorName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [expanded, setExpanded] = useState(true);

  const loadComments = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/api/comments/${scenarioId}`);
      if (res.ok) {
        const data = await res.json();
        setComments(data.comments || []);
        setTotal(data.total || 0);
      }
    } catch {
      // silent
    }
  }, [scenarioId]);

  useEffect(() => {
    loadComments();
  }, [loadComments]);

  const handleSubmit = async () => {
    if (!newComment.trim()) return;
    setSubmitting(true);

    try {
      const body: any = {
        scenario_id: scenarioId,
        content: newComment.trim(),
        author_name: authorName.trim() || "Anonymous",
      };
      if (replyTo) body.parent_id = replyTo;

      const res = await fetch(`${API_BASE}/api/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (res.ok) {
        setNewComment("");
        setReplyTo(null);
        loadComments();
      }
    } catch {
      // silent
    }
    setSubmitting(false);
  };

  const handleReply = (parentId: string) => {
    setReplyTo(parentId);
    setExpanded(true);
  };

  return (
    <div className="bg-card border border-border rounded-xl overflow-hidden">
      {/* Header */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full px-4 py-3 flex items-center justify-between hover:bg-border/20 transition-colors"
      >
        <span className="text-sm font-medium text-white flex items-center gap-2">
          💬 Discussion
          {total > 0 && (
            <span className="text-xs px-1.5 py-0.5 bg-accent/10 text-accent rounded-full">
              {total}
            </span>
          )}
        </span>
        <svg
          className={`w-4 h-4 text-muted transition-transform ${expanded ? "rotate-180" : ""}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {expanded && (
        <div className="px-4 pb-4 border-t border-border">
          {/* Reply indicator */}
          {replyTo && (
            <div className="mt-3 mb-2 flex items-center gap-2 text-xs text-accent">
              <span>↩ Replying to comment</span>
              <button
                onClick={() => setReplyTo(null)}
                className="text-muted hover:text-white"
              >
                ✕
              </button>
            </div>
          )}

          {/* Comment input */}
          <div className="mt-3 space-y-2">
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="Your name (optional)"
                value={authorName}
                onChange={(e) => setAuthorName(e.target.value)}
                className="w-32 px-2 py-1.5 bg-bg border border-border rounded-lg text-xs text-white placeholder:text-muted/40 focus:outline-none focus:border-accent/50"
              />
              <div className="flex-1 flex gap-1">
                <input
                  type="text"
                  placeholder={replyTo ? "Write a reply..." : "Add a comment..."}
                  value={newComment}
                  onChange={(e) => setNewComment(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
                  className="flex-1 px-3 py-1.5 bg-bg border border-border rounded-lg text-xs text-white placeholder:text-muted/40 focus:outline-none focus:border-accent/50"
                />
                <button
                  onClick={handleSubmit}
                  disabled={submitting || !newComment.trim()}
                  className="px-3 py-1.5 bg-accent text-bg text-xs font-medium rounded-lg hover:bg-accent/80 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  {submitting ? "..." : "Post"}
                </button>
              </div>
            </div>
          </div>

          {/* Comments list */}
          <div className="mt-4 space-y-1">
            {comments.length === 0 ? (
              <p className="text-xs text-muted text-center py-4">
                No comments yet — start the discussion
              </p>
            ) : (
              comments.map((c) => (
                <CommentItem key={c.id} comment={c} onReply={handleReply} />
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
