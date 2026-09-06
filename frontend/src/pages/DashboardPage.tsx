import React, { useState, useEffect, useCallback } from "react";
import type { User, Email, EmailSearchQuery, SlackStatus } from "../types";
import { searchEmails, getSlackConnectUrl } from "../services/api";
import { Navbar } from "../components/Navbar";
import { EmailTable } from "../components/EmailTable";
import { ComposeModal } from "../components/ComposeModal";
import { SearchFilterBar } from "../components/SearchFilterBar";

interface DashboardPageProps {
  user: User;
  slack: SlackStatus;
  onLogout: () => void;
  onDisconnectSlack: () => void;
}

type TabType = "scheduled" | "sent" | "search";

export const DashboardPage: React.FC<DashboardPageProps> = ({
  user,
  slack,
  onLogout,
  onDisconnectSlack,
}) => {
  const [activeTab, setActiveTab] = useState<TabType>("scheduled");
  const [isComposeOpen, setIsComposeOpen] = useState(false);

  // Email data states
  const [scheduledEmails, setScheduledEmails] = useState<Email[]>([]);
  const [scheduledTotal, setScheduledTotal] = useState(0);
  const [scheduledPage, setScheduledPage] = useState(1);
  const [scheduledTotalPages, setScheduledTotalPages] = useState(1);
  const [scheduledLoading, setScheduledLoading] = useState(false);
  const [scheduledError, setScheduledError] = useState<string | null>(null);

  const [sentEmails, setSentEmails] = useState<Email[]>([]);
  const [sentTotal, setSentTotal] = useState(0);
  const [sentPage, setSentPage] = useState(1);
  const [sentTotalPages, setSentTotalPages] = useState(1);
  const [sentLoading, setSentLoading] = useState(false);
  const [sentError, setSentError] = useState<string | null>(null);

  const [searchResults, setSearchResults] = useState<Email[]>([]);
  const [searchTotal, setSearchTotal] = useState(0);
  const [searchPage, setSearchPage] = useState(1);
  const [searchTotalPages, setSearchTotalPages] = useState(1);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [currentSearchQuery, setCurrentSearchQuery] = useState<EmailSearchQuery>({});

  // Summary metrics
  const [failedCount, setFailedCount] = useState(0);
  const [backendOffline, setBackendOffline] = useState(false);

  // ─── Fetchers ──────────────────────────────────────────────
  const loadScheduled = useCallback(async (page = 1) => {
    setScheduledLoading(true);
    setScheduledError(null);
    try {
      const res = await searchEmails({
        status: "pending",
        page,
        limit: 10,
      });
      setScheduledEmails(res.emails || []);
      setScheduledTotal(res.total || 0);
      setScheduledPage(res.page || 1);
      setScheduledTotalPages(res.totalPages || 1);
      setBackendOffline(false);
    } catch (err: any) {
      if (err.message?.includes("Failed to fetch") || err.message?.includes("NetworkError")) {
        setBackendOffline(true);
      }
      setScheduledError(err.message || "Failed to load scheduled emails");
    } finally {
      setScheduledLoading(false);
    }
  }, []);

  const loadSent = useCallback(async (page = 1) => {
    setSentLoading(true);
    setSentError(null);
    try {
      const res = await searchEmails({
        page,
        limit: 10,
      });
      const sentList = (res.emails || []).filter(
        (e) => e.status === "sent" || e.status === "failed"
      );
      const fails = (res.emails || []).filter((e) => e.status === "failed").length;

      setSentEmails(sentList);
      setSentTotal(sentList.length);
      setSentPage(res.page || 1);
      setSentTotalPages(res.totalPages || 1);
      setFailedCount(fails);
      setBackendOffline(false);
    } catch (err: any) {
      if (err.message?.includes("Failed to fetch") || err.message?.includes("NetworkError")) {
        setBackendOffline(true);
      }
      setSentError(err.message || "Failed to load sent emails");
    } finally {
      setSentLoading(false);
    }
  }, []);

  const executeSearch = useCallback(async (query: EmailSearchQuery) => {
    setSearchLoading(true);
    setSearchError(null);
    setCurrentSearchQuery(query);
    try {
      const res = await searchEmails({
        ...query,
        limit: 10,
      });
      setSearchResults(res.emails || []);
      setSearchTotal(res.total || 0);
      setSearchPage(res.page || 1);
      setSearchTotalPages(res.totalPages || 1);
      setBackendOffline(false);
    } catch (err: any) {
      setSearchError(err.message || "Search query failed");
    } finally {
      setSearchLoading(false);
    }
  }, []);

  // Initial load
  useEffect(() => {
    loadScheduled(1);
    loadSent(1);
  }, [loadScheduled, loadSent]);

  const handleCampaignCreated = () => {
    loadScheduled(1);
    loadSent(1);
    setActiveTab("scheduled");
  };

  const handleRetryAll = () => {
    loadScheduled(scheduledPage);
    loadSent(sentPage);
  };

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100 flex flex-col selection:bg-indigo-500 selection:text-white">
      {/* Top Navigation */}
      <Navbar
        user={user}
        slack={slack}
        onLogout={onLogout}
        onDisconnectSlack={onDisconnectSlack}
        onComposeClick={() => setIsComposeOpen(true)}
      />

      {/* Main Content Dashboard */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-7">
        {/* Backend Connection Alert */}
        {backendOffline && (
          <div className="p-4 rounded-2xl bg-amber-950/40 border border-amber-800/70 text-amber-200 text-xs flex items-center justify-between shadow-lg shadow-amber-950/20">
            <div className="flex items-center space-x-3">
              <span className="w-2.5 h-2.5 rounded-full bg-amber-400 animate-ping" />
              <span>
                <strong>Backend Service Connecting:</strong> Ensure your ReachInbox backend API is running on port 4000.
              </span>
            </div>
            <button
              onClick={handleRetryAll}
              className="px-3 py-1.5 rounded-lg bg-amber-800/60 hover:bg-amber-700/60 font-semibold transition-colors cursor-pointer"
            >
              Retry Connection
            </button>
          </div>
        )}

        {/* Slack Connection Banner (if not connected) */}
        {!slack.connected && (
          <div className="rounded-2xl border border-indigo-900/60 bg-gradient-to-r from-indigo-950/40 via-purple-950/30 to-gray-900/40 p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 shadow-lg shadow-black/30">
            <div className="flex items-center space-x-3.5">
              <div className="w-10 h-10 rounded-xl bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center shrink-0">
                <svg className="w-5 h-5 text-indigo-400" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M5.042 15.165a2.528 2.528 0 0 1-2.52 2.523A2.528 2.528 0 0 1 0 15.165a2.527 2.527 0 0 1 2.522-2.52h2.52v2.52zM6.313 15.165a2.527 2.527 0 0 1 2.521-2.52 2.527 2.527 0 0 1 2.521 2.52v6.313A2.528 2.528 0 0 1 8.834 24a2.528 2.528 0 0 1-2.521-2.522v-6.313zM8.834 5.042a2.528 2.528 0 0 1-2.521-2.52A2.528 2.528 0 0 1 8.834 0a2.528 2.528 0 0 1 2.521 2.522v2.52H8.834zM8.834 6.313a2.528 2.528 0 0 1 2.521 2.521 2.528 2.528 0 0 1-2.521 2.521H2.522A2.528 2.528 0 0 1 0 8.834a2.528 2.528 0 0 1 2.522-2.521h6.312z" />
                </svg>
              </div>
              <div>
                <h3 className="text-sm font-semibold text-white">
                  Connect Slack for Instant Hourly Rate-Limit Alerts
                </h3>
                <p className="text-xs text-gray-400 mt-0.5">
                  Receive real-time alerts in your Slack channels when sender hourly limits are reached and queues are throttled.
                </p>
              </div>
            </div>

            <a
              href={getSlackConnectUrl()}
              className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold transition-all shadow-md shadow-indigo-600/20 shrink-0 cursor-pointer"
            >
              Connect Slack Workspace
            </a>
          </div>
        )}

        {/* Stats Metrics Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="rounded-2xl border border-gray-800/80 bg-gray-900/50 p-5 space-y-2 backdrop-blur-sm shadow-md">
            <div className="flex items-center justify-between text-xs font-semibold text-gray-400 uppercase tracking-wider">
              <span>Scheduled Queue</span>
              <span className="w-2 h-2 rounded-full bg-amber-400" />
            </div>
            <div className="flex items-baseline space-x-2">
              <span className="text-3xl font-extrabold text-amber-400">
                {scheduledTotal}
              </span>
              <span className="text-xs text-gray-500">delayed jobs</span>
            </div>
          </div>

          <div className="rounded-2xl border border-gray-800/80 bg-gray-900/50 p-5 space-y-2 backdrop-blur-sm shadow-md">
            <div className="flex items-center justify-between text-xs font-semibold text-gray-400 uppercase tracking-wider">
              <span>Delivered Emails</span>
              <span className="w-2 h-2 rounded-full bg-emerald-400" />
            </div>
            <div className="flex items-baseline space-x-2">
              <span className="text-3xl font-extrabold text-emerald-400">
                {sentTotal}
              </span>
              <span className="text-xs text-gray-500">sent via SMTP</span>
            </div>
          </div>

          <div className="rounded-2xl border border-gray-800/80 bg-gray-900/50 p-5 space-y-2 backdrop-blur-sm shadow-md">
            <div className="flex items-center justify-between text-xs font-semibold text-gray-400 uppercase tracking-wider">
              <span>Delivery Issues</span>
              <span className="w-2 h-2 rounded-full bg-rose-400" />
            </div>
            <div className="flex items-baseline space-x-2">
              <span className="text-3xl font-extrabold text-rose-400">
                {failedCount}
              </span>
              <span className="text-xs text-gray-500">retried / throttled</span>
            </div>
          </div>

          <div className="rounded-2xl border border-gray-800/80 bg-gray-900/50 p-5 space-y-2 backdrop-blur-sm shadow-md">
            <div className="flex items-center justify-between text-xs font-semibold text-gray-400 uppercase tracking-wider">
              <span>Slack Alerts</span>
              <span
                className={`w-2 h-2 rounded-full ${
                  slack.connected ? "bg-emerald-400 animate-pulse" : "bg-gray-600"
                }`}
              />
            </div>
            <div className="flex items-baseline space-x-2">
              <span
                className={`text-lg font-bold ${
                  slack.connected ? "text-emerald-400" : "text-gray-400"
                }`}
              >
                {slack.connected ? "Active" : "Disconnected"}
              </span>
              {slack.teamName && (
                <span className="text-xs text-gray-400 truncate max-w-[120px]">
                  ({slack.teamName})
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Tab Navigation Pill Bar */}
        <div className="flex items-center space-x-1.5 p-1 rounded-xl bg-gray-900/60 border border-gray-800/80 w-fit">
          <button
            onClick={() => setActiveTab("scheduled")}
            className={`px-4 py-2 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
              activeTab === "scheduled"
                ? "bg-indigo-600 text-white shadow-md shadow-indigo-600/30"
                : "text-gray-400 hover:text-gray-200"
            }`}
          >
            Scheduled Queue ({scheduledTotal})
          </button>

          <button
            onClick={() => setActiveTab("sent")}
            className={`px-4 py-2 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
              activeTab === "sent"
                ? "bg-indigo-600 text-white shadow-md shadow-indigo-600/30"
                : "text-gray-400 hover:text-gray-200"
            }`}
          >
            Delivered Emails ({sentTotal})
          </button>

          <button
            onClick={() => setActiveTab("search")}
            className={`px-4 py-2 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
              activeTab === "search"
                ? "bg-indigo-600 text-white shadow-md shadow-indigo-600/30"
                : "text-gray-400 hover:text-gray-200"
            }`}
          >
            Elasticsearch Search
          </button>
        </div>

        {/* Active Tab View */}
        {activeTab === "scheduled" && (
          <EmailTable
            emails={scheduledEmails}
            loading={scheduledLoading}
            error={scheduledError}
            type="scheduled"
            page={scheduledPage}
            totalPages={scheduledTotalPages}
            total={scheduledTotal}
            onPageChange={(p) => loadScheduled(p)}
            onRefresh={() => loadScheduled(scheduledPage)}
            onComposeClick={() => setIsComposeOpen(true)}
          />
        )}

        {activeTab === "sent" && (
          <EmailTable
            emails={sentEmails}
            loading={sentLoading}
            error={sentError}
            type="sent"
            page={sentPage}
            totalPages={sentTotalPages}
            total={sentTotal}
            onPageChange={(p) => loadSent(p)}
            onRefresh={() => loadSent(sentPage)}
          />
        )}

        {activeTab === "search" && (
          <div className="space-y-6">
            <SearchFilterBar onSearch={executeSearch} loading={searchLoading} />
            <EmailTable
              emails={searchResults}
              loading={searchLoading}
              error={searchError}
              type="search"
              page={searchPage}
              totalPages={searchTotalPages}
              total={searchTotal}
              onPageChange={(p) =>
                executeSearch({ ...currentSearchQuery, page: p })
              }
              onRefresh={() => executeSearch(currentSearchQuery)}
            />
          </div>
        )}
      </main>

      {/* Compose Email Modal */}
      <ComposeModal
        isOpen={isComposeOpen}
        onClose={() => setIsComposeOpen(false)}
        onSuccess={handleCampaignCreated}
      />
    </div>
  );
};
