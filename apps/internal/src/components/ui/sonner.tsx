"use client";

import { Toaster as SonnerToaster } from "sonner";

export function Toaster() {
  return (
    <SonnerToaster
      position="top-right"
      toastOptions={{
        style: {
          fontSize: "13px",
          borderRadius: "6px",
        },
      }}
    />
  );
}
