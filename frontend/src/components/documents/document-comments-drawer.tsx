"use client";

import React, { useState } from "react";
import {
  Dialog,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useAddComment, useDocument } from "@/hooks/use-documents";
import { MessageSquare, Send, User as UserIcon } from "lucide-react";

interface DocumentCommentsDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  documentId: string;
  documentTitle: string;
}

export function DocumentCommentsDrawer({
  open,
  onOpenChange,
  documentId,
  documentTitle,
}: DocumentCommentsDrawerProps) {
  const { data: document, isLoading } = useDocument(documentId);
  const addCommentMutation = useAddComment();
  const [content, setContent] = useState("");

  const comments = document?.comments || [];

  const handleSendComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!content.trim()) return;

    try {
      await addCommentMutation.mutateAsync({
        documentId,
        content,
      });
      setContent("");
    } catch (err: any) {
      alert(err.message || "Failed to post comment");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogHeader>
        <div className="flex items-center gap-2 text-primary mb-1">
          <MessageSquare className="h-5 w-5" />
          <DialogTitle>Document Discussions</DialogTitle>
        </div>
        <DialogDescription>
          Comments and feedback thread for <span className="font-semibold text-foreground">{documentTitle}</span>.
        </DialogDescription>
      </DialogHeader>

      <div className="space-y-4">
        {/* Comments Stream */}
        <div className="space-y-3 max-h-[350px] overflow-y-auto pr-1">
          {isLoading ? (
            <p className="text-xs text-muted-foreground text-center py-6">Loading comments...</p>
          ) : comments.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-6">
              No comments yet. Start the discussion below.
            </p>
          ) : (
            comments.map((c) => (
              <div
                key={c.id}
                className="rounded-lg border border-border/70 bg-card p-3 space-y-1.5 text-xs"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 font-semibold text-foreground">
                    <div className="flex h-5 w-5 items-center justify-center rounded-full bg-primary/20 text-primary text-[10px]">
                      {c.author?.fullName?.slice(0, 1) || "U"}
                    </div>
                    <span>{c.author?.fullName}</span>
                    <span className="text-[10px] text-muted-foreground font-normal">
                      ({c.author?.role})
                    </span>
                  </div>
                  <span className="text-[10px] text-muted-foreground font-mono">
                    {new Date(c.createdAt).toLocaleDateString("id-ID", {
                      dateStyle: "short",
                      timeStyle: "short",
                    })}
                  </span>
                </div>
                <p className="text-muted-foreground pl-6 leading-relaxed whitespace-pre-wrap">
                  {c.content}
                </p>
              </div>
            ))
          )}
        </div>

        {/* New Comment Input */}
        <form onSubmit={handleSendComment} className="flex items-center gap-2 pt-2 border-t border-border/50">
          <input
            type="text"
            placeholder="Type your comment or feedback..."
            value={content}
            onChange={(e) => setContent(e.target.value)}
            className="flex h-9 w-full rounded-md border border-input bg-card px-3 py-1 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-primary"
            disabled={addCommentMutation.isPending}
          />
          <Button
            type="submit"
            size="sm"
            className="gap-1.5 h-9"
            disabled={!content.trim() || addCommentMutation.isPending}
          >
            <Send className="h-3.5 w-3.5" />
            <span>Send</span>
          </Button>
        </form>
      </div>

      <DialogFooter>
        <Button variant="outline" onClick={() => onOpenChange(false)}>
          Close
        </Button>
      </DialogFooter>
    </Dialog>
  );
}
