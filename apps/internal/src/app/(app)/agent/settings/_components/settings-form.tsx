"use client";

import { useState, useTransition } from "react";
import { saveAgentSettings, type AgentSettingsInput } from "../_actions";

const DAY_LABELS: Array<{ value: number; short: string }> = [
  { value: 0, short: "Sun" },
  { value: 1, short: "Mon" },
  { value: 2, short: "Tue" },
  { value: 3, short: "Wed" },
  { value: 4, short: "Thu" },
  { value: 5, short: "Fri" },
  { value: 6, short: "Sat" },
];

export type SettingsFormProps = {
  mailboxId: string;
  mailboxEmail: string;
  initial: Omit<AgentSettingsInput, "mailboxId">;
  hasRow: boolean;
};

export function SettingsForm({
  mailboxId,
  mailboxEmail,
  initial,
  hasRow,
}: SettingsFormProps) {
  const [startHour, setStartHour] = useState(initial.workingStartHour);
  const [endHour, setEndHour] = useState(initial.workingEndHour);
  const [days, setDays] = useState<number[]>(initial.workingDays);
  const [buffer, setBuffer] = useState(initial.bufferMinutes);
  const [maxBtb, setMaxBtb] = useState(initial.maxBackToBack);
  const [tz, setTz] = useState(initial.timezone);
  const [status, setStatus] = useState<"idle" | "saved" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const toggleDay = (d: number) => {
    setDays((prev) =>
      prev.includes(d)
        ? prev.filter((x) => x !== d)
        : [...prev, d].sort((a, b) => a - b)
    );
  };

  const onSave = () => {
    setStatus("idle");
    setErrorMsg(null);
    startTransition(async () => {
      const res = await saveAgentSettings({
        mailboxId,
        workingStartHour: startHour,
        workingEndHour: endHour,
        workingDays: days,
        bufferMinutes: buffer,
        maxBackToBack: maxBtb,
        timezone: tz,
      });
      if (res.ok) {
        setStatus("saved");
      } else {
        setStatus("error");
        setErrorMsg(res.error);
      }
    });
  };

  return (
    <div
      className="rounded-md border px-5 py-4 mb-4"
      style={{ borderColor: "#e0e0e0", background: "#ffffff" }}
    >
      <div className="flex items-center justify-between mb-3">
        <div>
          <div className="text-[14px] font-semibold">{mailboxEmail}</div>
          <div className="text-[11px]" style={{ color: "#888" }}>
            {hasRow ? "Custom settings" : "Using defaults"}
          </div>
        </div>
        <button
          type="button"
          onClick={onSave}
          disabled={pending}
          className="rounded-md border px-3 py-1.5 text-[13px] hover:bg-[#f5f5f5] disabled:opacity-50"
          style={{ borderColor: "#111", color: "#111" }}
        >
          {pending ? "Saving…" : "Save"}
        </button>
      </div>

      <div className="grid grid-cols-2 gap-4 text-[13px]">
        <label className="flex flex-col gap-1">
          <span className="text-[11px] uppercase tracking-wider" style={{ color: "#888" }}>
            Start hour (0–23)
          </span>
          <input
            type="number"
            min={0}
            max={23}
            value={startHour}
            onChange={(e) => setStartHour(parseInt(e.target.value, 10) || 0)}
            className="rounded-md border px-2 py-1 text-[13px]"
            style={{ borderColor: "#e0e0e0" }}
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[11px] uppercase tracking-wider" style={{ color: "#888" }}>
            End hour (0–23)
          </span>
          <input
            type="number"
            min={0}
            max={23}
            value={endHour}
            onChange={(e) => setEndHour(parseInt(e.target.value, 10) || 0)}
            className="rounded-md border px-2 py-1 text-[13px]"
            style={{ borderColor: "#e0e0e0" }}
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[11px] uppercase tracking-wider" style={{ color: "#888" }}>
            Buffer (minutes)
          </span>
          <input
            type="number"
            min={0}
            max={120}
            value={buffer}
            onChange={(e) => setBuffer(parseInt(e.target.value, 10) || 0)}
            className="rounded-md border px-2 py-1 text-[13px]"
            style={{ borderColor: "#e0e0e0" }}
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[11px] uppercase tracking-wider" style={{ color: "#888" }}>
            Max back-to-back (1–10)
          </span>
          <input
            type="number"
            min={1}
            max={10}
            value={maxBtb}
            onChange={(e) => setMaxBtb(parseInt(e.target.value, 10) || 1)}
            className="rounded-md border px-2 py-1 text-[13px]"
            style={{ borderColor: "#e0e0e0" }}
          />
        </label>
        <label className="flex flex-col gap-1 col-span-2">
          <span className="text-[11px] uppercase tracking-wider" style={{ color: "#888" }}>
            Timezone
          </span>
          <input
            type="text"
            value={tz}
            onChange={(e) => setTz(e.target.value)}
            className="rounded-md border px-2 py-1 text-[13px]"
            style={{ borderColor: "#e0e0e0" }}
          />
        </label>
      </div>

      <div className="mt-3">
        <div
          className="text-[11px] uppercase tracking-wider mb-1.5"
          style={{ color: "#888" }}
        >
          Working days
        </div>
        <div className="flex gap-1.5 flex-wrap">
          {DAY_LABELS.map((d) => {
            const on = days.includes(d.value);
            return (
              <button
                key={d.value}
                type="button"
                onClick={() => toggleDay(d.value)}
                className="rounded-md border px-2.5 py-1 text-[12px]"
                style={{
                  borderColor: on ? "#111" : "#e0e0e0",
                  background: on ? "#111" : "#ffffff",
                  color: on ? "#ffffff" : "#444",
                }}
              >
                {d.short}
              </button>
            );
          })}
        </div>
      </div>

      {status === "saved" && (
        <div
          className="mt-3 text-[12px] rounded-md border px-3 py-1.5"
          style={{
            background: "#e8f5e9",
            borderColor: "#27ae60",
            color: "#1b5e20",
          }}
        >
          Saved
        </div>
      )}
      {status === "error" && errorMsg && (
        <div
          className="mt-3 text-[12px] rounded-md border px-3 py-1.5"
          style={{
            background: "#fde8e8",
            borderColor: "#e74c3c",
            color: "#7c1c14",
          }}
        >
          {errorMsg}
        </div>
      )}
    </div>
  );
}
