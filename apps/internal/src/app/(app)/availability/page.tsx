import type { Metadata } from "next";
import { AvailabilityClient } from "./availability-client";

export const metadata: Metadata = { title: "Availability" };

export default function AvailabilityPage() {
  return <AvailabilityClient />;
}
