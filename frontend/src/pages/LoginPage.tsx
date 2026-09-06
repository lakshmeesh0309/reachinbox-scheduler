import React, { useEffect, useState } from "react";
import { getGoogleLoginUrl } from "../services/api";

export const LoginPage: React.FC = () => {
  const [oauthError, setOauthError] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const errorParam = params.get("error");
    if (errorParam) {
      setOauthError(decodeURIComponent(errorParam));
    }
  }, []);

  const handleGoogleLogin = () => {
    window.location.href = getGoogleLoginUrl();
  };

  return (
    <div className="min-h-screen bg-gray-950 flex flex-col justify-center items-center px-4 sm:px-6 lg:px-8 relative overflow-hidden selection:bg-indigo-500 selection:text-white">
      {/* Background ambient lighting */}
      <div className="absolute -top-40 left-1/2 -translate-x-1/2 w-[700px] h-[450px] bg-gradient-to-tr from-indigo-600/20 via-purple-600/15 to-transparent blur-[140px] rounded-full pointer-events-none" />
      <div className="absolute -bottom-40 right-10 w-[500px] h-[350px] bg-gradient-to-tl from-indigo-900/10 to-transparent blur-[120px] rounded-full pointer-events-none" />

      {/* Subtle grid pattern */}
      <div
        className="absolute inset-0 opacity-[0.03] pointer-events-none"
        style={{
          backgroundImage: `radial-gradient(rgba(255, 255, 255, 0.4) 1px, transparent 1px)`,
          backgroundSize: "24px 24px",
        }}
      />

      <div className="w-full max-w-md space-y-8 relative z-10">
        {/* Brand header */}
        <div className="text-center space-y-3">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-gradient-to-tr from-indigo-600 via-indigo-500 to-violet-500 shadow-xl shadow-indigo-500/25 ring-1 ring-white/20">
            <svg
              className="w-7 h-7 text-white"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
              />
            </svg>
          </div>
          <div>
            <h1 className="text-3xl font-extrabold text-white tracking-tight sm:text-4xl">
              ReachInbox
            </h1>
            <p className="mt-1 text-sm text-gray-400 font-medium">
              Enterprise Outbound Email Scheduler & Throttling
            </p>
          </div>
        </div>

        {/* OAuth Error Toast */}
        {oauthError && (
          <div className="p-4 rounded-xl bg-rose-950/60 border border-rose-800/80 text-rose-300 text-xs flex items-start space-x-3 animate-fadeIn">
            <svg
              className="w-4 h-4 text-rose-400 shrink-0 mt-0.5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
            <div>
              <p className="font-semibold text-rose-200">Authentication Failed</p>
              <p className="mt-0.5 text-rose-300/80">{oauthError}</p>
            </div>
          </div>
        )}

        {/* Login Card */}
        <div className="rounded-2xl border border-gray-800/80 bg-gray-900/70 backdrop-blur-xl p-8 shadow-2xl shadow-black/80 space-y-6 ring-1 ring-white/5">
          <div className="text-center space-y-1">
            <h2 className="text-lg font-semibold text-gray-100">
              Sign In to Your Workspace
            </h2>
            <p className="text-xs text-gray-400">
              Access your campaigns, queue metrics, and scheduling controls
            </p>
          </div>

          {/* Google Login Button */}
          <button
            onClick={handleGoogleLogin}
            className="w-full group relative flex items-center justify-center space-x-3.5 px-4 py-3.5 rounded-xl bg-white hover:bg-gray-50 text-gray-900 text-sm font-semibold transition-all duration-150 shadow-lg shadow-black/20 hover:shadow-xl hover:scale-[1.01] active:scale-[0.99] cursor-pointer"
          >
            {/* Google G Logo */}
            <svg className="w-5 h-5 shrink-0" viewBox="0 0 24 24">
              <path
                fill="#4285F4"
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
              />
              <path
                fill="#34A853"
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
              />
              <path
                fill="#FBBC05"
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
              />
              <path
                fill="#EA4335"
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
              />
            </svg>
            <span className="font-semibold tracking-wide">Continue with Google</span>
          </button>

          <div className="relative flex py-1 items-center">
            <div className="flex-grow border-t border-gray-800" />
            <span className="flex-shrink mx-3 text-[11px] text-gray-500 font-medium uppercase tracking-widest">
              Core Engine
            </span>
            <div className="flex-grow border-t border-gray-800" />
          </div>

          {/* Feature Highlights List */}
          <div className="space-y-3 text-xs text-gray-300">
            <div className="flex items-center space-x-3 p-2 rounded-lg bg-gray-950/40 border border-gray-800/50">
              <span className="w-2 h-2 rounded-full bg-indigo-400 shrink-0" />
              <div>
                <span className="font-medium text-gray-200">BullMQ Delayed Jobs</span>
                <span className="text-gray-500 block text-[11px]">Survives backend & worker restarts</span>
              </div>
            </div>

            <div className="flex items-center space-x-3 p-2 rounded-lg bg-gray-950/40 border border-gray-800/50">
              <span className="w-2 h-2 rounded-full bg-purple-400 shrink-0" />
              <div>
                <span className="font-medium text-gray-200">Atomic Hourly Throttling</span>
                <span className="text-gray-500 block text-[11px]">Distributed Redis Lua sliding windows</span>
              </div>
            </div>

            <div className="flex items-center space-x-3 p-2 rounded-lg bg-gray-950/40 border border-gray-800/50">
              <span className="w-2 h-2 rounded-full bg-emerald-400 shrink-0" />
              <div>
                <span className="font-medium text-gray-200">Elasticsearch Fast Search</span>
                <span className="text-gray-500 block text-[11px]">Full-text & multi-field facet filtering</span>
              </div>
            </div>

            <div className="flex items-center space-x-3 p-2 rounded-lg bg-gray-950/40 border border-gray-800/50">
              <span className="w-2 h-2 rounded-full bg-amber-400 shrink-0" />
              <div>
                <span className="font-medium text-gray-200">Slack Alerts</span>
                <span className="text-gray-500 block text-[11px]">Instant notifications on quota threshold</span>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="text-center space-y-1 text-xs text-gray-500">
          <p>ReachInbox Scheduler • Production Ready</p>
        </div>
      </div>
    </div>
  );
};
