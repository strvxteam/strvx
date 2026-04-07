"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function PortalLoginPage() {
  const [token, setToken] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!token.trim()) return;
    setLoading(true);
    setError("");

    try {
      const res = await fetch("/api/portal/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: token.trim() }),
      });
      const data = await res.json();
      if (data.success) {
        router.push("/portal");
      } else {
        setError(data.error || "Invalid access code");
      }
    } catch {
      setError("Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <div className="w-full max-w-sm rounded-xl border border-[#e0e0e0] bg-white p-8">
        <h1 className="mb-1 text-center text-lg font-semibold text-[#111]">Client Portal</h1>
        <p className="mb-6 text-center text-[13px] text-[#888]">Enter your access code to view your projects and invoices.</p>

        <form onSubmit={handleSubmit}>
          <input
            type="text"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            placeholder="Access code"
            className="mb-3 w-full rounded-lg border border-[#e0e0e0] px-4 py-2.5 text-[14px] outline-none focus:border-[#1a73e8]"
            autoFocus
          />
          {error && <p className="mb-3 text-[13px] text-[#c0392b]">{error}</p>}
          <button
            type="submit"
            disabled={loading || !token.trim()}
            className="w-full rounded-lg bg-[#111] py-2.5 text-[14px] font-medium text-white transition-colors hover:bg-[#333] disabled:opacity-40"
          >
            {loading ? "Verifying..." : "Access Portal"}
          </button>
        </form>
      </div>
    </div>
  );
}
