import React, { useState } from "react";
import type { EmailSearchQuery } from "../types";

interface SearchFilterBarProps {
  onSearch: (query: EmailSearchQuery) => void;
  loading: boolean;
}

export const SearchFilterBar: React.FC<SearchFilterBarProps> = ({
  onSearch,
  loading,
}) => {
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [recipient, setRecipient] = useState("");
  const [subject, setSubject] = useState("");
  const [showAdvanced, setShowAdvanced] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSearch({
      q: q.trim() || undefined,
      status: status || undefined,
      recipient: recipient.trim() || undefined,
      subject: subject.trim() || undefined,
      page: 1,
    });
  };

  const handleClear = () => {
    setQ("");
    setStatus("");
    setRecipient("");
    setSubject("");
    onSearch({ page: 1 });
  };

  return (
    <form onSubmit={handleSubmit} className="w-full space-y-3">
      {/* Primary search bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
        <div className="relative flex-1">
          <svg
            className="w-4 h-4 text-gray-500 absolute left-3.5 top-3"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
            />
          </svg>
          <input
            type="text"
            placeholder="Search emails by recipient, subject, or content..."
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="w-full pl-10 pr-4 py-2 rounded-xl bg-gray-900 border border-gray-800 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 text-sm text-gray-200 outline-none placeholder:text-gray-500"
          />
        </div>

        {/* Status Dropdown */}
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          className="px-3 py-2 rounded-xl bg-gray-900 border border-gray-800 text-sm text-gray-300 outline-none focus:border-indigo-500"
        >
          <option value="">All Statuses</option>
          <option value="pending">Scheduled (Pending)</option>
          <option value="sent">Delivered (Sent)</option>
          <option value="failed">Failed</option>
          <option value="sending">Sending</option>
        </select>

        {/* Action buttons */}
        <div className="flex items-center space-x-2">
          <button
            type="submit"
            disabled={loading}
            className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-sm font-medium transition-colors shadow-sm cursor-pointer"
          >
            {loading ? "Searching..." : "Search"}
          </button>

          <button
            type="button"
            onClick={() => setShowAdvanced(!showAdvanced)}
            className="px-3 py-2 rounded-xl bg-gray-900 hover:bg-gray-800 border border-gray-800 text-gray-400 hover:text-gray-200 text-xs font-medium transition-colors cursor-pointer"
            title="Toggle advanced field filters"
          >
            {showAdvanced ? "Hide Filters" : "Filters"}
          </button>

          {(q || status || recipient || subject) && (
            <button
              type="button"
              onClick={handleClear}
              className="px-2.5 py-2 text-xs text-gray-400 hover:text-rose-400 transition-colors cursor-pointer"
            >
              Reset
            </button>
          )}
        </div>
      </div>

      {/* Advanced filters drawer */}
      {showAdvanced && (
        <div className="p-4 rounded-xl border border-gray-800 bg-gray-900/60 grid grid-cols-1 sm:grid-cols-2 gap-3 animate-fadeIn">
          <div>
            <label className="block text-xs font-medium text-gray-400 mb-1">
              Recipient Exact / Partial Match
            </label>
            <input
              type="text"
              placeholder="e.g. user@company.com"
              value={recipient}
              onChange={(e) => setRecipient(e.target.value)}
              className="w-full px-3 py-1.5 rounded-lg bg-gray-950 border border-gray-800 text-xs text-gray-200 outline-none focus:border-indigo-500"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-400 mb-1">
              Subject Filter
            </label>
            <input
              type="text"
              placeholder="e.g. Q4 Strategy"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              className="w-full px-3 py-1.5 rounded-lg bg-gray-950 border border-gray-800 text-xs text-gray-200 outline-none focus:border-indigo-500"
            />
          </div>
        </div>
      )}
    </form>
  );
};
