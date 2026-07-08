"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";

export const PER_PAGE_OPTIONS = [20, 50, 100, 250];

type Props = {
  page: number;
  perPage: number;
  total: number;
  onPageChange: (page: number) => void;
  onPerPageChange: (perPage: number) => void;
};

export default function Pagination({
  page,
  perPage,
  total,
  onPageChange,
  onPerPageChange,
}: Props) {
  const totalPages = Math.max(1, Math.ceil(total / perPage));
  const safePage = Math.min(page, totalPages);

  const from = (safePage - 1) * perPage + 1;
  const to = Math.min(safePage * perPage, total);

  if (total === 0) return null;

  return (
    <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100 bg-gray-50">

      {/* Left: count + per page */}
      <div className="flex items-center gap-3">
        <p className="text-xs text-gray-500">
          Showing{" "}
          <span className="font-medium text-gray-700">{from}–{to}</span>
          {" "}of{" "}
          <span className="font-medium text-gray-700">{total}</span>
        </p>
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-gray-400">Per page:</span>
          <select
            value={perPage}
            onChange={(e) => onPerPageChange(Number(e.target.value))}
            className="text-xs border border-gray-200 rounded-md px-2 py-1 bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-green-500"
          >
            {PER_PAGE_OPTIONS.map((n) => (
              <option key={n} value={n}>{n}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Right: page controls */}
      <div className="flex items-center gap-1">
        <Btn onClick={() => onPageChange(1)} disabled={safePage === 1} label="«" title="First page" />
        <Btn onClick={() => onPageChange(safePage - 1)} disabled={safePage === 1} title="Previous page">
          <ChevronLeft size={14} />
        </Btn>

        {getPageNumbers(safePage, totalPages).map((p, i) =>
          p === "..." ? (
            <span key={`e-${i}`} className="px-1 text-xs text-gray-400">...</span>
          ) : (
            <button
              key={p}
              onClick={() => onPageChange(p as number)}
              className={`w-7 h-7 rounded-md text-xs font-medium transition-colors ${
                safePage === p
                  ? "bg-green-600 text-white"
                  : "text-gray-600 hover:bg-gray-200"
              }`}
            >
              {p}
            </button>
          )
        )}

        <Btn onClick={() => onPageChange(safePage + 1)} disabled={safePage === totalPages} title="Next page">
          <ChevronRight size={14} />
        </Btn>
        <Btn onClick={() => onPageChange(totalPages)} disabled={safePage === totalPages} label="»" title="Last page" />
      </div>
    </div>
  );
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function Btn({
  onClick, disabled, label, title, children,
}: {
  onClick: () => void;
  disabled: boolean;
  label?: string;
  title?: string;
  children?: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      className="w-7 h-7 rounded-md text-xs text-gray-600 hover:bg-gray-200 disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center transition-colors"
    >
      {children || label}
    </button>
  );
}

function getPageNumbers(current: number, total: number): (number | "...")[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  if (current <= 4) return [1, 2, 3, 4, 5, "...", total];
  if (current >= total - 3) return [1, "...", total - 4, total - 3, total - 2, total - 1, total];
  return [1, "...", current - 1, current, current + 1, "...", total];
}

// ── usePagination hook — manages page/perPage state in one place ──────────────

import { useState, useEffect } from "react";

export function usePagination(total: number, resetDeps: unknown[] = []) {
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(20);

  // Reset to page 1 whenever deps change (search, segment, sort, perPage)
  useEffect(() => { setPage(1); }, [...resetDeps, perPage]);

  const totalPages = Math.max(1, Math.ceil(total / perPage));
  const safePage = Math.min(page, totalPages);

  function paginate<T>(items: T[]): T[] {
    return items.slice((safePage - 1) * perPage, safePage * perPage);
  }

  return {
    page: safePage,
    perPage,
    setPage,
    setPerPage,
    paginate,
  };
}