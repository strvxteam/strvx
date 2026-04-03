import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-white">
      <div className="text-center">
        <h1 className="text-6xl font-bold text-[#222]">404</h1>
        <p className="mt-2 text-[15px] text-[#888]">Page not found</p>
        <Link
          href="/dashboard"
          className="mt-6 inline-block rounded-lg bg-[#111] px-5 py-2.5 text-[13px] font-semibold text-white transition-colors hover:bg-[#333]"
        >
          Back to Dashboard
        </Link>
      </div>
    </div>
  );
}
