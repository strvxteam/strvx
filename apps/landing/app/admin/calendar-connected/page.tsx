import { Suspense } from "react";
import CalendarConnectedContent from "./CalendarConnectedContent";

export const metadata = {
  title: "Calendar Connected",
  robots: { index: false, follow: false },
};

export default function CalendarConnectedPage() {
  return (
    <Suspense>
      <CalendarConnectedContent />
    </Suspense>
  );
}
