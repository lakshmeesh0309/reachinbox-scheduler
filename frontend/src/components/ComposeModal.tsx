import React, { useState, useEffect, useId } from "react";
import type { Sender, ScheduleEmailsRequest } from "../types";
import { scheduleEmails, fetchSenders } from "../services/api";

interface ComposeModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export const ComposeModal: React.FC<ComposeModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
}) => {
  const [senders, setSenders] = useState<Sender[]>([]);
  const [selectedSenderId, setSelectedSenderId] = useState<string>("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [startTime, setStartTime] = useState("");
  const [delaySeconds, setDelaySeconds] = useState(2);
  const [hourlyLimit, setHourlyLimit] = useState(100);

  // Recipient parsing state
  const [recipients, setRecipients] = useState<string[]>([]);
  const [invalidEmails, setInvalidEmails] = useState<string[]>([]);
  const [manualText, setManualText] = useState("");
  const [fileName, setFileName] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  // Status feedback
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errorDetails, setErrorDetails] = useState<string[]>([]);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const fileInputId = useId();

  // Initialize start time default (now + 2 minutes formatted for datetime-local)
  useEffect(() => {
    if (isOpen) {
      const now = new Date();
      now.setMinutes(now.getMinutes() + 2);
      const isoLocal = new Date(now.getTime() - now.getTimezoneOffset() * 60000)
        .toISOString()
        .slice(0, 16);
      setStartTime(isoLocal);
      setError(null);
      setErrorDetails([]);
      setSuccessMessage(null);

      // Load senders
      fetchSenders()
        .then((list) => {
          setSenders(list);
          if (list.length > 0) {
            setSelectedSenderId(list[0].id);
          }
        })
        .catch(() => {});
    }
  }, [isOpen]);

  if (!isOpen) return null;

  // ─── Email Extraction & Validation ─────────────────────────
  const extractAndValidateEmails = (text: string) => {
    const tokens = text
      .split(/[\r\n,;\s]+/)
      .map((t) => t.trim().toLowerCase())
      .filter((t) => t.length > 0);

    const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;

    const validSet = new Set<string>();
    const invalidList: string[] = [];

    for (const token of tokens) {
      const cleaned = token.replace(/^["']|["']$/g, "").trim();
      if (!cleaned) continue;

      if (emailRegex.test(cleaned)) {
        validSet.add(cleaned);
      } else {
        invalidList.push(cleaned);
      }
    }

    setRecipients(Array.from(validSet));
    setInvalidEmails(invalidList.slice(0, 5));
  };

  const processFile = (file: File) => {
    setFileName(file.name);
    const reader = new FileReader();

    reader.onload = (event) => {
      const content = event.target?.result as string;
      if (content) {
        setManualText(content);
        extractAndValidateEmails(content);
      }
    };

    reader.readAsText(file);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) processFile(file);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) processFile(file);
  };

  const handleManualTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const text = e.target.value;
    setManualText(text);
    extractAndValidateEmails(text);
  };

  // Estimated campaign duration calculation
  const getEstimatedDuration = () => {
    if (recipients.length <= 1) return "< 1 minute";
    const totalSeconds = (recipients.length - 1) * delaySeconds;
    const minutes = Math.floor(totalSeconds / 60);
    const remainingSeconds = totalSeconds % 60;
    if (minutes === 0) return `~${remainingSeconds}s`;
    return `~${minutes}m ${remainingSeconds > 0 ? `${remainingSeconds}s` : ""}`;
  };

  // ─── Submission ────────────────────────────────────────────
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setErrorDetails([]);

    if (recipients.length === 0) {
      setError("Please add at least one valid recipient email address.");
      return;
    }

    if (!subject.trim()) {
      setError("Subject line is required.");
      return;
    }

    if (!body.trim()) {
      setError("Email body content is required.");
      return;
    }

    if (!selectedSenderId) {
      setError("Please select a sender profile.");
      return;
    }

    setLoading(true);

    try {
      const payload: ScheduleEmailsRequest = {
        subject: subject.trim(),
        body: body.trim(),
        recipients,
        startTime: new Date(startTime).toISOString(),
        delayBetweenEmailsMs: delaySeconds * 1000,
        hourlyLimit,
        senderId: selectedSenderId,
      };

      const res = await scheduleEmails(payload);
      setSuccessMessage(
        `Campaign scheduled! ${res.data.totalEmails} delayed jobs enqueued into BullMQ.`
      );

      setTimeout(() => {
        onSuccess();
        onClose();
      }, 1200);
    } catch (err: any) {
      setError(err.message || "Failed to schedule email campaign");
      if (err.details) {
        setErrorDetails(err.details);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm overflow-y-auto">
      <div className="relative w-full max-w-2xl rounded-2xl border border-gray-800/90 bg-gray-900/95 shadow-2xl p-6 sm:p-8 my-8 text-gray-100 ring-1 ring-white/10">
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-gray-800">
          <div className="flex items-center space-x-3">
            <div className="w-8 h-8 rounded-lg bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center text-indigo-400">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
              </svg>
            </div>
            <div>
              <h2 className="text-base font-semibold text-white">
                Compose & Schedule Emails
              </h2>
              <p className="text-xs text-gray-400">
                Setup campaign parameters, upload recipients, and dispatch delayed jobs
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white p-1 rounded-lg hover:bg-gray-800 transition-colors cursor-pointer"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Feedback alerts */}
        {error && (
          <div className="mt-4 p-3.5 rounded-xl bg-rose-950/50 border border-rose-800/70 text-rose-300 text-xs">
            <p className="font-semibold flex items-center">
              <svg className="w-4 h-4 mr-2 text-rose-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              {error}
            </p>
            {errorDetails.length > 0 && (
              <ul className="mt-1.5 space-y-1 pl-6 list-disc text-rose-300/80">
                {errorDetails.map((d, i) => (
                  <li key={i}>{d}</li>
                ))}
              </ul>
            )}
          </div>
        )}

        {successMessage && (
          <div className="mt-4 p-3.5 rounded-xl bg-emerald-950/50 border border-emerald-800/70 text-emerald-300 text-xs flex items-center space-x-2">
            <svg className="w-4 h-4 text-emerald-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.2} d="M5 13l4 4L19 7" />
            </svg>
            <span className="font-medium">{successMessage}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="mt-5 space-y-4">
          {/* Sender Select */}
          <div>
            <label className="block text-xs font-semibold text-gray-300 uppercase tracking-wider mb-1">
              From Sender
            </label>
            {senders.length > 0 ? (
              <select
                value={selectedSenderId}
                onChange={(e) => setSelectedSenderId(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-gray-950 border border-gray-800 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 text-xs text-gray-200 outline-none transition-all"
              >
                {senders.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} ({s.email})
                  </option>
                ))}
              </select>
            ) : (
              <div className="text-xs text-amber-400 p-2 rounded-lg bg-amber-950/30 border border-amber-800/40">
                Loading sender identity...
              </div>
            )}
          </div>

          {/* Subject Line */}
          <div>
            <label className="block text-xs font-semibold text-gray-300 uppercase tracking-wider mb-1">
              Subject Line
            </label>
            <input
              type="text"
              placeholder="e.g. Q4 Launch Strategy & Onboarding"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              className="w-full px-3.5 py-2 rounded-xl bg-gray-950 border border-gray-800 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 text-xs text-gray-200 outline-none placeholder:text-gray-600"
              required
            />
          </div>

          {/* Body Content */}
          <div>
            <label className="block text-xs font-semibold text-gray-300 uppercase tracking-wider mb-1">
              Email Body (HTML / Markdown / Text)
            </label>
            <textarea
              rows={4}
              placeholder="Write your email body or paste formatted HTML..."
              value={body}
              onChange={(e) => setBody(e.target.value)}
              className="w-full px-3.5 py-2 rounded-xl bg-gray-950 border border-gray-800 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 text-xs text-gray-200 outline-none placeholder:text-gray-600 font-mono text-[11px] leading-relaxed"
              required
            />
          </div>

          {/* Recipients CSV / Text Upload Zone */}
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setIsDragging(true);
            }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={handleDrop}
            className={`p-3.5 rounded-xl border transition-all ${
              isDragging
                ? "border-indigo-500 bg-indigo-950/20"
                : "border-gray-800 bg-gray-950/60"
            } space-y-2.5`}
          >
            <div className="flex items-center justify-between">
              <div>
                <span className="text-xs font-semibold text-gray-200">
                  Recipient Addresses
                </span>
                <p className="text-[11px] text-gray-400">
                  Upload CSV or text file, or paste comma/line-separated emails
                </p>
              </div>

              <label
                htmlFor={fileInputId}
                className="px-2.5 py-1 rounded-lg bg-gray-800 hover:bg-gray-700 text-xs font-medium text-indigo-300 hover:text-indigo-200 cursor-pointer transition-colors flex items-center space-x-1"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                </svg>
                <span>{fileName ? "Replace CSV" : "Upload CSV"}</span>
              </label>
              <input
                id={fileInputId}
                type="file"
                accept=".csv,.txt"
                onChange={handleFileUpload}
                className="hidden"
              />
            </div>

            <textarea
              rows={2}
              placeholder="e.g. alex@acme.corp, sarah.connor@cyberdyne.io, marketing@partner.com"
              value={manualText}
              onChange={handleManualTextChange}
              className="w-full px-3 py-1.5 rounded-lg bg-gray-900 border border-gray-800 focus:border-indigo-500 text-xs text-gray-200 outline-none font-mono placeholder:text-gray-600"
            />

            {/* Validation Chips & Feedback */}
            <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
              <div className="flex items-center space-x-2">
                <span
                  className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                    recipients.length > 0
                      ? "bg-emerald-950 text-emerald-400 border border-emerald-800/60"
                      : "bg-gray-800 text-gray-400"
                  }`}
                >
                  <span
                    className={`w-1.5 h-1.5 mr-1.5 rounded-full ${
                      recipients.length > 0 ? "bg-emerald-400" : "bg-gray-500"
                    }`}
                  />
                  {recipients.length} valid {recipients.length === 1 ? "recipient" : "recipients"}
                </span>

                {fileName && (
                  <span className="text-xs text-gray-400 truncate max-w-xs">
                    📁 {fileName}
                  </span>
                )}
              </div>

              {invalidEmails.length > 0 && (
                <span className="text-[11px] text-rose-400 font-medium">
                  ⚠️ {invalidEmails.length} invalid entries skipped
                </span>
              )}
            </div>

            {/* Preview of first few parsed recipients */}
            {recipients.length > 0 && (
              <div className="flex flex-wrap gap-1 pt-1 max-h-16 overflow-y-auto">
                {recipients.slice(0, 4).map((rec, idx) => (
                  <span
                    key={idx}
                    className="px-2 py-0.5 rounded bg-gray-900 border border-gray-800 text-[10px] font-mono text-gray-300"
                  >
                    {rec}
                  </span>
                ))}
                {recipients.length > 4 && (
                  <span className="px-1.5 py-0.5 text-[10px] text-gray-500">
                    +{recipients.length - 4} more
                  </span>
                )}
              </div>
            )}
          </div>

          {/* Scheduling Grid: Start Time, Delay, Hourly Limit */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-1">
                Start Date & Time
              </label>
              <input
                type="datetime-local"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                className="w-full px-2.5 py-1.5 rounded-xl bg-gray-950 border border-gray-800 focus:border-indigo-500 text-xs text-gray-200 outline-none"
                required
              />
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-1">
                Delay Between Sends
              </label>
              <div className="relative">
                <input
                  type="number"
                  min="1"
                  max="3600"
                  value={delaySeconds}
                  onChange={(e) => setDelaySeconds(parseInt(e.target.value, 10) || 2)}
                  className="w-full px-2.5 py-1.5 rounded-xl bg-gray-950 border border-gray-800 focus:border-indigo-500 text-xs text-gray-200 outline-none pr-8"
                  required
                />
                <span className="absolute right-2.5 top-1.5 text-xs text-gray-500">s</span>
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-1">
                Hourly Limit / Sender
              </label>
              <div className="relative">
                <input
                  type="number"
                  min="1"
                  max="10000"
                  value={hourlyLimit}
                  onChange={(e) => setHourlyLimit(parseInt(e.target.value, 10) || 100)}
                  className="w-full px-2.5 py-1.5 rounded-xl bg-gray-950 border border-gray-800 focus:border-indigo-500 text-xs text-gray-200 outline-none pr-8"
                  required
                />
                <span className="absolute right-2.5 top-1.5 text-xs text-gray-500">/hr</span>
              </div>
            </div>
          </div>

          {/* Duration estimate note */}
          {recipients.length > 0 && (
            <div className="p-2 rounded-lg bg-indigo-950/20 border border-indigo-900/40 text-[11px] text-indigo-300 flex items-center justify-between">
              <span>Estimated Delivery Span:</span>
              <span className="font-semibold text-indigo-200">
                {getEstimatedDuration()}
              </span>
            </div>
          )}

          {/* Action Footer */}
          <div className="pt-3 border-t border-gray-800 flex items-center justify-end space-x-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl bg-gray-800 hover:bg-gray-750 text-gray-300 hover:text-white text-xs font-medium transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading || recipients.length === 0}
              className="flex items-center space-x-2 px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:hover:bg-indigo-600 text-white text-xs font-semibold transition-all shadow-md shadow-indigo-600/30 active:scale-95 cursor-pointer"
            >
              {loading && (
                <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
              )}
              <span>{loading ? "Scheduling..." : "Schedule Campaign"}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
