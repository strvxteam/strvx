"use client";

import { useEffect, Suspense } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import posthog from "posthog-js";
import { PostHogProvider as PHProvider } from "posthog-js/react";

if (typeof window !== "undefined") {
  const isDev = process.env.NODE_ENV === "development";
  posthog.init(process.env.NEXT_PUBLIC_POSTHOG_KEY as string, {
    api_host: isDev ? "https://us.i.posthog.com" : "/ingest",
    ui_host: "https://us.posthog.com",
    capture_pageview: false,
    person_profiles: "identified_only",
  });
}

function PostHogPageView() {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  useEffect(() => {
    if (pathname) {
      let url = window.location.origin + pathname;
      const params = searchParams.toString();
      if (params) url += `?${params}`;
      posthog.capture("$pageview", { $current_url: url });
    }
  }, [pathname, searchParams]);

  return null;
}

export function PostHogProvider({ children }: { children: React.ReactNode }) {
  return (
    <PHProvider client={posthog}>
      <Suspense fallback={null}>
        <PostHogPageView />
      </Suspense>
      {children}
    </PHProvider>
  );
}
