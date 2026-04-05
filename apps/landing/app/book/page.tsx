import BookingWidget from "@/components/BookingWidget";

export default function BookPage() {
  return (
    <div className="min-h-screen bg-[#0a0a0a] text-[#f5f5f5] flex flex-col">
      {/* Page header */}
      <div className="max-w-3xl mx-auto px-6 pt-20 md:pt-24 pb-6 w-full">
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
