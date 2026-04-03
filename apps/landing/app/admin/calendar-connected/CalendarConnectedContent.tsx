"use client";

import { useSearchParams } from "next/navigation";

export default function CalendarConnectedContent() {
  const params = useSearchParams();
  const success = params.get("success") === "true";
  const error = params.get("error");

  const errorMessages: Record<string, string> = {
    oauth_denied: "You denied the Google Calendar permission. Please try connecting again.",
    no_refresh_token: "No refresh token received. Revoke access in your Google account settings and try again.",
    missing_params: "Invalid OAuth callback — missing parameters.",
    save_failed: "Connected to Google but failed to save the token. Please try again.",
    server_error: "An unexpected error occurred. Please try again.",
  };

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
