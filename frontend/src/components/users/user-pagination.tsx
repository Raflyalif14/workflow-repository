"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { translate as translateI18n } from "@/i18n";

export interface UserPaginationProps {
  shownCount: number;
  totalCount: number;
  currentPage: number;
  totalPages: number;
  hasPrevPage: boolean;
  hasNextPage: boolean;
  isLoading?: boolean;
  onPrevPage: () => void;
  onNextPage: () => void;
}

export function UserPagination({
  shownCount,
  totalCount,
  currentPage,
  totalPages,
  hasPrevPage,
  hasNextPage,
  isLoading = false,
  onPrevPage,
  onNextPage,
}: UserPaginationProps) {
  return (
    <div className="flex flex-col sm:flex-row items-center justify-between gap-3 px-6 py-4 border-t border-border bg-muted/20 text-xs text-muted-foreground">
      <div>
        {translateI18n("userPage.showing", { shown: shownCount, total: totalCount })}
      </div>

      <div className="flex items-center gap-2">
        <span className="mr-2">
          {translateI18n("userPage.page", { page: currentPage, total: totalPages || 1 })}
        </span>
        <Button
          variant="outline"
          size="icon"
          className="h-8 w-8"
          disabled={!hasPrevPage || isLoading}
          onClick={onPrevPage}
          aria-label={translateI18n("projectsList.previous")}
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <Button
          variant="outline"
          size="icon"
          className="h-8 w-8"
          disabled={!hasNextPage || isLoading}
          onClick={onNextPage}
          aria-label={translateI18n("common.next")}
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
