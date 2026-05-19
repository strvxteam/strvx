import { CalendarSettingsClient } from "./settings-client";

export const metadata = { title: "Availability — Calendar Mappings" };
export const dynamic = "force-dynamic";

export default function AvailabilitySettingsPage() {
  return <CalendarSettingsClient />;
}
