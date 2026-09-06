import React, { useState } from "react";
import type { Email } from "../types";

interface EmailTableProps {
  emails: Email[];
  loading: boolean;
  error?: string | null;
  type: "scheduled" | "sent" | "search";
  page: number;
  totalPages: number;
  total: number;
  onPageChange: (newPage: number) => void;
  onRefresh?: () => void;
  onComposeClick?: () => void;
}

export const EmailTable: React.FC<EmailTableProps> = ({
  emails,
  loading,
  error,
  type,
  page,
  totalPages,
  total,
  onPageChange,
  onRefresh,
  onComposeClick,
}) => {
  const [selectedEmail, setSelectedEmail] = useState<Email | null>(null);

  const formatDateTime = (isoString?: string | null) => {
    if (!isoString) return "—";
    try {
      const date = new Date(isoString);
      return date.toLocaleString(undefined, {
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      });
    } catch {
      return isoString;
    }
  };

  const getRelativeTime = (isoString?: string | null) => {
    if (!isoString) return "";
    try {
      const date = new Date(isoString);
      const diffMs = date.getTime() - Date.now();
      const diffSec = Math.round(diffMs / 1000);
      const diffMin = Math.round(diffSec / 60);
      const diffHours = Math.round(diffMin / 60);

      if (diffSec > 0 && diffSec < 60) return `in ${diffSec}s`;
      if (diffMin > 0 && diffMin < 60) return `in ${diffMin}m`;
      if (diffHours > 0 && diffHours < 24) return `in ${diffHours}h`;

      if (diffSec < 0 && Math.abs(diffSec) < 60) return "just now";
      if (diffMin < 0 && Math.abs(diffMin) < 60) return `${Math.abs(diffMin)}m ago`;
      if (diffHours < 0 && Math.abs(diffHours) < 24) return `${Math.abs(diffHours)}h ago`;

      return "";
    } catch {
      return "";
    }
  };

  const getStatusBadge = (status: Email["status"], failureReason?: string | null) => {
    switch (status) {
      case "sent":
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-emerald-950/80 text-emerald-400 border border-emerald-800/60 shadow-xs">
            <span className="w-1.5 h-1.5 mr-1.5 rounded-full bg-emerald-400" />
            Delivered
          </span>
        );
      case "failed":
        return (
          <span
            className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-rose-950/80 text-rose-400 border border-rose-800/60 cursor-help shadow-xs"
            title={failureReason || "Delivery error — click row for details"}
          >
            <span className="w-1.5 h-1.5 mr-1.5 rounded-full bg-rose-400" />
            Failed
          </span>
        );
      case "sending":
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-blue-950/80 text-blue-400 border border-blue-800/60 shadow-xs">
            <span className="w-1.5 h-1.5 mr-1.5 rounded-full bg-blue-400 animate-ping" />
            Sending
          </span>
        );
      case "pending":
      case "queued":
      default:
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-amber-950/80 text-amber-400 border border-amber-800/60 shadow-xs">
            <span className="w-1.5 h-1.5 mr-1.5 rounded-full bg-amber-400" />
            Scheduled
          </span>
        );
    }
  };

  const startIdx = total === 0 ? 0 : (page - 1) * 10 + 1;
  const endIdx = Math.min(page * 10, total);

  return (
    <>
      <div className="w-full rounded-2xl border border-gray-800/80 bg-gray-900/50 backdrop-blur-md overflow-hidden flex flex-col shadow-xl shadow-black/40">
        {/* Table Header Controls */}
        <div className="px-6 py-4 border-b border-gray-800/80 flex items-center justify-between">
          <div className="flex items-center space-x-2.5">
            <span className="text-sm font-semibold text-gray-100">
              {type === "scheduled" && "Scheduled Outbound Queue"}
              {type === "sent" && "Delivery History & Log"}
              {type === "search" && "Elasticsearch Search Hits"}
            </span>
            <span className="text-[11px] px-2.5 py-0.5 rounded-full bg-gray-800/80 text-gray-300 font-medium">
              {total} {total === 1 ? "email" : "emails"}
            </span>
          </div>

          {onRefresh && (
            <button
              onClick={onRefresh}
              disabled={loading}
              className="flex items-center space-x-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium text-gray-400 hover:text-gray-200 hover:bg-gray-800 transition-colors disabled:opacity-50 cursor-pointer"
              title="Refresh table"
            >
              <svg
                className={`w-3.5 h-3.5 ${loading ? "animate-spin text-indigo-400" : ""}`}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                />
              </svg>
              <span>Refresh</span>
            </button>
          )}
        </div>

        {/* Error Alert Box */}
        {error && (
          <div className="m-6 p-4 rounded-xl bg-rose-950/40 border border-rose-800/60 text-rose-300 text-xs flex items-center space-x-3">
            <svg className="w-5 h-5 shrink-0 text-rose-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <div>
              <p className="font-semibold text-rose-200">Failed to load emails</p>
              <p className="text-rose-400/80 mt-0.5">{error}</p>
            </div>
          </div>
        )}

        {/* Table Body */}
        <div className="overflow-x-auto min-h-[300px]">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-gray-800 bg-gray-950/50 text-[11px] font-semibold text-gray-400 uppercase tracking-wider">
                <th className="py-3 px-6">Recipient</th>
                <th className="py-3 px-6">Subject</th>
                <th className="py-3 px-6">
                  {type === "sent" ? "Delivered At" : "Target Send Time"}
                </th>
                <th className="py-3 px-6">Status</th>
                <th className="py-3 px-6 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800/60 text-xs text-gray-300">
              {/* Skeleton loading rows */}
              {loading && emails.length === 0 && (
                <>
                  {[...Array(5)].map((_, i) => (
                    <tr key={i} className="animate-pulse">
                      <td className="py-4 px-6">
                        <div className="h-3.5 w-44 bg-gray-800 rounded" />
                      </td>
                      <td className="py-4 px-6">
                        <div className="h-3.5 w-60 bg-gray-800 rounded" />
                      </td>
                      <td className="py-4 px-6">
                        <div className="h-3.5 w-32 bg-gray-800 rounded" />
                      </td>
                      <td className="py-4 px-6">
                        <div className="h-3.5 w-20 bg-gray-800 rounded" />
                      </td>
                      <td className="py-4 px-6 text-right">
                        <div className="h-3.5 w-12 bg-gray-800 rounded ml-auto" />
                      </td>
                    </tr>
                  ))}
                </>
              )}

              {/* Empty state */}
              {!loading && emails.length === 0 && !error && (
                <tr>
                  <td colSpan={5} className="py-16 text-center text-gray-500">
                    <div className="flex flex-col items-center justify-center space-y-3">
                      <div className="w-12 h-12 rounded-2xl bg-gray-800/60 border border-gray-700/40 flex items-center justify-center text-gray-400">
                        <svg
                          className="w-6 h-6"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={1.5}
                            d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4"
                          />
                        </svg>
                      </div>
                      <div>
                        <p className="text-gray-300 font-semibold text-sm">No emails to display</p>
                        <p className="text-xs text-gray-500 mt-1">
                          {type === "scheduled" && "Your queue is clear. No scheduled jobs pending."}
                          {type === "sent" && "No delivery history recorded yet."}
                          {type === "search" && "No results match your search parameters."}
                        </p>
                      </div>
                      {onComposeClick && type === "scheduled" && (
                        <button
                          onClick={onComposeClick}
                          className="mt-2 text-xs font-semibold text-indigo-400 hover:text-indigo-300 underline underline-offset-4 cursor-pointer"
                        >
                          Compose & schedule a new email batch →
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              )}

              {/* Email Table Rows */}
              {emails.map((email) => {
                const relativeTime = getRelativeTime(
                  type === "sent" ? email.sentAt : email.scheduledAt
                );

                return (
                  <tr
                    key={email.id}
                    onClick={() => setSelectedEmail(email)}
                    className="hover:bg-gray-800/40 transition-colors cursor-pointer group"
                  >
                    <td className="py-3.5 px-6 font-mono text-[11px] text-gray-200">
                      {email.recipient}
                    </td>
                    <td className="py-3.5 px-6 font-medium text-gray-100 max-w-xs truncate">
                      {email.subject}
                    </td>
                    <td className="py-3.5 px-6 whitespace-nowrap">
                      <span className="text-gray-300">
                        {type === "sent"
                          ? formatDateTime(email.sentAt)
                          : formatDateTime(email.scheduledAt)}
                      </span>
                      {relativeTime && (
                        <span className="text-gray-500 text-[10px] ml-1.5">
                          ({relativeTime})
                        </span>
                      )}
                    </td>
                    <td className="py-3.5 px-6 whitespace-nowrap">
                      {getStatusBadge(email.status, email.failureReason)}
                    </td>
                    <td className="py-3.5 px-6 text-right whitespace-nowrap">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedEmail(email);
                        }}
                        className="text-xs text-indigo-400 hover:text-indigo-300 font-medium group-hover:underline"
                      >
                        Inspect
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Pagination Bar */}
        <div className="px-6 py-3.5 border-t border-gray-800/80 bg-gray-950/40 flex items-center justify-between text-xs text-gray-400">
          <span>
            Showing <span className="font-semibold text-gray-300">{startIdx}</span> to{" "}
            <span className="font-semibold text-gray-300">{endIdx}</span> of{" "}
            <span className="font-semibold text-gray-300">{total}</span> emails
          </span>

          {totalPages > 1 && (
            <div className="flex items-center space-x-2">
              <button
                onClick={() => onPageChange(page - 1)}
                disabled={page <= 1}
                className="px-3 py-1 rounded-lg bg-gray-800 hover:bg-gray-700 disabled:opacity-40 disabled:hover:bg-gray-800 text-gray-300 font-medium transition-colors cursor-pointer"
              >
                Previous
              </button>
              <span className="text-[11px] text-gray-400">
                {page} / {totalPages}
              </span>
              <button
                onClick={() => onPageChange(page + 1)}
                disabled={page >= totalPages}
                className="px-3 py-1 rounded-lg bg-gray-800 hover:bg-gray-700 disabled:opacity-40 disabled:hover:bg-gray-800 text-gray-300 font-medium transition-colors cursor-pointer"
              >
                Next
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Email Inspector Detail Modal */}
      {selectedEmail && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm"
          onClick={() => setSelectedEmail(null)}
        >
          <div
            className="w-full max-w-xl rounded-2xl border border-gray-800 bg-gray-900 p-6 space-y-4 text-gray-100 shadow-2xl animate-fadeIn"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-3 border-b border-gray-800">
              <div className="flex items-center space-x-2">
                <span className="text-sm font-semibold text-white">
                  Email Record Details
                </span>
                {getStatusBadge(selectedEmail.status, selectedEmail.failureReason)}
              </div>
              <button
                onClick={() => setSelectedEmail(null)}
                className="p-1 rounded-lg text-gray-400 hover:text-white hover:bg-gray-800 cursor-pointer"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <span className="text-gray-400 font-medium block">Recipient:</span>
                <span className="font-mono text-gray-200">{selectedEmail.recipient}</span>
              </div>

              <div>
                <span className="text-gray-400 font-medium block">Subject:</span>
                <span className="font-semibold text-gray-100">{selectedEmail.subject}</span>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <span className="text-gray-400 font-medium block">Scheduled At:</span>
                  <span className="text-gray-300">{formatDateTime(selectedEmail.scheduledAt)}</span>
                </div>
                <div>
                  <span className="text-gray-400 font-medium block">Sent At:</span>
                  <span className="text-gray-300">{formatDateTime(selectedEmail.sentAt)}</span>
                </div>
              </div>

              {selectedEmail.failureReason && (
                <div className="p-3 rounded-xl bg-rose-950/40 border border-rose-800/60 text-rose-300">
                  <span className="font-semibold block mb-0.5">Failure Reason:</span>
                  <span>{selectedEmail.failureReason}</span>
                </div>
              )}

              <div>
                <span className="text-gray-400 font-medium block mb-1">Email Body Content:</span>
                <div className="p-3 rounded-xl bg-gray-950 border border-gray-800 font-mono text-[11px] text-gray-300 max-h-48 overflow-y-auto whitespace-pre-wrap leading-relaxed">
                  {selectedEmail.body}
                </div>
              </div>
            </div>

            <div className="pt-3 border-t border-gray-800 flex justify-end">
              <button
                onClick={() => setSelectedEmail(null)}
                className="px-4 py-2 rounded-xl bg-gray-800 hover:bg-gray-700 text-xs font-medium text-gray-200 transition-colors cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
