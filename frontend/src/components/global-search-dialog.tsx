"use client";

import { KeyboardEvent, useEffect, useMemo, useRef, useState } from "react";
import { FileText, FolderKanban, Milestone, Search, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { Input } from "@/components/ui/input";
import { useGlobalSearch } from "@/hooks/use-global-search";
import {
  flattenGlobalSearchResults,
  GlobalSearchResult,
  globalSearchResultHref,
  isGlobalSearchEligible,
  moveGlobalSearchSelection,
} from "@/lib/global-search";

type GlobalSearchDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

const resultGroups: Array<{ key: "projects" | "documents" | "milestones"; label: string; icon: typeof FolderKanban }> = [
  { key: "projects", label: "Projects", icon: FolderKanban },
  { key: "documents", label: "Documents", icon: FileText },
  { key: "milestones", label: "Milestones", icon: Milestone },
];

export function GlobalSearchDialog({ open, onOpenChange }: GlobalSearchDialogProps) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const search = useGlobalSearch(query, open);
  const results = useMemo(() => flattenGlobalSearchResults(search.data), [search.data]);
  const isEligible = isGlobalSearchEligible(query);

  useEffect(() => {
    if (!open) {
      setQuery("");
      setSelectedIndex(-1);
      return;
    }
    const timeout = window.setTimeout(() => inputRef.current?.focus(), 0);
    return () => window.clearTimeout(timeout);
  }, [open]);

  useEffect(() => {
    setSelectedIndex(results.length ? 0 : -1);
  }, [query, results.length]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") onOpenChange(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onOpenChange]);

  const selectResult = (result: GlobalSearchResult) => {
    onOpenChange(false);
    router.push(globalSearchResultHref(result));
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setSelectedIndex((index) => moveGlobalSearchSelection(index, 1, results.length));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setSelectedIndex((index) => moveGlobalSearchSelection(index, -1, results.length));
    } else if (event.key === "Enter" && selectedIndex >= 0 && results[selectedIndex]) {
      event.preventDefault();
      selectResult(results[selectedIndex]);
    }
  };

  if (!open) return null;

  let flattenedIndex = 0;
  return (
    <div
      id="global-search-panel"
      role="dialog"
      aria-modal={false}
      aria-labelledby="global-search-title"
      className="absolute left-3 right-3 top-[calc(100%+10px)] z-50 overflow-hidden rounded-xl border border-border/60 bg-card shadow-xl shadow-black/10 animate-in fade-in slide-in-from-top-2 duration-200 sm:left-0 sm:right-auto sm:w-[560px] sm:max-w-[calc(100vw-5rem)]"
    >
      <div className="flex max-h-[min(65dvh,calc(100dvh-90px))] flex-col overflow-y-auto">
        <div className="shrink-0 p-4">
          <Input
            ref={inputRef}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Search projects, documents, milestones..."
            aria-label="Search projects, documents, and milestones"
            className="h-11 bg-background"
          />
        </div>
        <div className="min-h-0 max-h-[min(56vh,430px)] overflow-y-auto border-t border-border/60 p-2">
          {!isEligible ? (
            <p className="px-3 py-8 text-center text-sm text-muted-foreground">Type at least 2 characters to search.</p>
          ) : search.isDebouncing || search.isLoading ? (
            <p className="px-3 py-8 text-center text-sm text-muted-foreground">Searching...</p>
          ) : search.isError ? (
            <p className="px-3 py-8 text-center text-sm text-destructive">Unable to search right now. Please try again.</p>
          ) : results.length === 0 ? (
            <p className="px-3 py-8 text-center text-sm text-muted-foreground">No matching records found.</p>
          ) : (
            resultGroups.map((group) => {
              const groupResults = search.data?.[group.key] || [];
              if (!groupResults.length) return null;
              const Icon = group.icon;
              return (
                <section key={group.key} className="py-1">
                  <div className="flex items-center gap-2 px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                    <Icon className="h-3.5 w-3.5" />
                    {group.label}
                  </div>
                  {groupResults.map((result) => {
                    const index = flattenedIndex++;
                    const selected = index === selectedIndex;
                    return (
                      <button
                        key={`${result.type}-${result.id}`}
                        type="button"
                        onClick={() => selectResult(result)}
                        onMouseEnter={() => setSelectedIndex(index)}
                        className={`flex w-full items-center justify-between gap-4 rounded-lg px-3 py-2.5 text-left transition ${selected ? "bg-primary/10 text-foreground" : "hover:bg-muted/60"}`}
                      >
                        <span className="min-w-0">
                          <span className="block truncate text-sm font-medium">{result.title}</span>
                          <span className="block truncate text-xs text-muted-foreground">{result.subtitle}</span>
                        </span>
                        {result.status && <span className="shrink-0 text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">{result.status}</span>}
                      </button>
                    );
                  })}
                </section>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
