import BookingWidget from "@/components/BookingWidget";
import Link from "next/link";

export default function BookPage() {
  return (
    <div className="min-h-screen bg-[#0a0a0a] text-[#f5f5f5] flex flex-col">
      {/* Nav */}
      <nav className="sticky top-0 z-50 backdrop-blur-xl bg-[#050505]/80 border-b border-white/[0.06] px-6 md:px-12 py-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between md:justify-center gap-10">
          <Link href="/" className="text-sm font-bold tracking-[0.12em] uppercase md:mr-4">
            strvx
          </Link>
          <ul className="hidden md:flex items-center gap-8 list-none">
            <li>
              <Link href="/services" className="text-sm text-[#777] tracking-wide hover:text-[#0a0a0a] hover:bg-white px-3 py-1.5 rounded-full transition-all duration-200">
                Services
              </Link>
            </li>
            <li>
              <Link href="/process" className="text-sm text-[#777] tracking-wide hover:text-[#0a0a0a] hover:bg-white px-3 py-1.5 rounded-full transition-all duration-200">
                Process
              </Link>
            </li>
            <li>
              <Link href="/book" className="text-xs tracking-[0.06em] uppercase px-5 py-2.5 rounded-lg bg-white text-[#0a0a0a] font-semibold hover:bg-white/90 transition-colors duration-200">
                Book a call
              </Link>
            </li>
          </ul>
        </div>
      </nav>

      {/* Page header */}
      <div className="max-w-3xl mx-auto px-6 pt-12 pb-6 w-full">
        <p className="text-[11px] tracking-[0.2em] uppercase text-[#555] mb-3">
          Free Consultation
        </p>
        <h1 className="text-3xl md:text-4xl font-bold tracking-tight mb-2">
          Book a 30-minute call.
        </h1>
        <p className="text-[#666] text-base">
          No pitch. Just an honest conversation about your problem.
        </p>
      </div>

      {/* Widget */}
      <div className="flex-1 max-w-3xl mx-auto px-6 pb-16 w-full">
        <BookingWidget />
      </div>
    </div>
  );
}
