"use client";

import { useSearchParams } from "next/navigation";
import { useState } from "react";

export default function CalendarConnectedContent() {
  const params = useSearchParams();
  const success = params.get("success") === "true";
  const error = params.get("error");
  const teamToken = params.get("team_token") === "1";
  const newToken = params.get("token");
  const [copied, setCopied] = useState(false);

  const errorMessages: Record<string, string> = {
    oauth_denied: "You denied the Google Calendar permission. Please try connecting again.",
    no_refresh_token: "No refresh token received. Revoke access in your Google account settings and try again.",
    missing_params: "Invalid OAuth callback — missing parameters.",
    save_failed: "Connected to Google but failed to save the token. Please try again.",
    server_error: "An unexpected error occurred. Please try again.",
  };

  if (teamToken && newToken) {
    return (
      <div className="min-h-screen bg-[#f9f9f9] flex items-center justify-center px-6">
        <div className="bg-white rounded-2xl border border-[#e5e5e5] shadow-sm p-10 max-w-lg w-full">
          <div className="w-12 h-12 rounded-full bg-[#f0faf2] border border-[#c8f0d0] flex items-center justify-center mx-auto mb-4">
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
              <path d="M4 10.5l4 4 8-8" stroke="#22c55e" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          <h1 className="text-lg font-bold text-[#0a0a0a] mb-1 text-center">New team calendar token</h1>
          <p className="text-sm text-[#666] mb-5 text-center">
            Copy this refresh token and update <code className="font-mono bg-[#f4f4f4] px-1 rounded">GOOGLE_TEAM_REFRESH_TOKEN</code> in your Vercel project environment variables, then redeploy.
          </p>
          <div className="rounded-lg border border-[#e5e5e5] bg-[#f9f9f9] p-3 mb-4 break-all font-mono text-[12px] text-[#333]">
            {newToken}
          </div>
          <button
            onClick={() => {
              navigator.clipboard.writeText(newToken);
              setCopied(true);
              setTimeout(() => setCopied(false), 2000);
            }}
            className="w-full rounded-lg bg-[#0a0a0a] px-4 py-2.5 text-sm font-medium text-white hover:bg-[#333] transition-colors"
          >
            {copied ? "Copied!" : "Copy token"}
          </button>
          <p className="mt-4 text-[11px] text-[#999] text-center">
            After updating the env var on Vercel, trigger a redeploy for the change to take effect.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f9f9f9] flex items-center justify-center px-6">
      <div className="bg-white rounded-2xl border border-[#e5e5e5] shadow-sm p-10 max-w-sm w-full text-center">
        {success ? (
          <>
            <div className="w-12 h-12 rounded-full bg-[#f0faf2] border border-[#c8f0d0] flex items-center justify-center mx-auto mb-4">
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                <path d="M4 10.5l4 4 8-8" stroke="#22c55e" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
            <h1 className="text-lg font-bold text-[#0a0a0a] mb-2">Calendar connected.</h1>
            <p className="text-sm text-[#666]">You can close this window.</p>
          </>
        ) : (
          <>
            <div className="w-12 h-12 rounded-full bg-red-50 border border-red-200 flex items-center justify-center mx-auto mb-4">
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                <path d="M10 6v4M10 14h.01" stroke="#ef4444" strokeWidth="1.75" strokeLinecap="round" />
                <circle cx="10" cy="10" r="8" stroke="#ef4444" strokeWidth="1.75" />
              </svg>
            </div>
            <h1 className="text-lg font-bold text-[#0a0a0a] mb-2">Connection failed.</h1>
            <p className="text-sm text-[#666]">
              {error && errorMessages[error]
                ? errorMessages[error]
                : "Something went wrong. Please try again."}
            </p>
          </>
        )}
      </div>
    </div>
  );
}
