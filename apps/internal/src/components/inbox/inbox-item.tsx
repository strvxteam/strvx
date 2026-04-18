"use client";

import { CheckSquare, ListChecks, Calendar, AlertTriangle, Rocket, Activity, Receipt } from "lucide-react";
import type { InboxItem } from "@/lib/inbox-data";
import { ItemRow } from "./item-row";
import {
  toggleTaskDone,
  toggleNextActionDone,
  snoozeStaleEngagement,
  dismissAlert,
} from "@/app/actions/inbox";

export function InboxItemRenderer({ item }: { item: InboxItem }) {
  switch (item.kind) {
    case "task":
      return (
        <ItemRow
          icon={<CheckSquare size={14} className="text-[#888]" />}
          title={item.title}
          subtitle={item.dueDate ? `Due ${item.dueDate}` : null}
          href={`/tasks?taskId=${item.id}`}
          onPrimaryClick={() => {
            void toggleTaskDone({ taskId: item.id });
          }}
          overflowActions={[
            {
              label: "Snooze 1 day",
              onClick: () => {
                void toggleTaskDone({ taskId: item.id, snooze: 1 });
              },
            },
            {
              label: "Open",
              onClick: () => {
                window.location.href = `/tasks?taskId=${item.id}`;
              },
            },
          ]}
          tint="danger"
        />
      );
    case "next-action":
      return (
        <ItemRow
          icon={<ListChecks size={14} className="text-[#e67e22]" />}
          title={item.description}
          subtitle={`${item.companyName} · ${item.dueDate ? `due ${item.dueDate}` : "no due date"}`}
          href={`/clients/${item.engagementId}`}
          onPrimaryClick={() => {
            void toggleNextActionDone({ actionId: item.id });
          }}
          tint="warning"
        />
      );
    case "meeting":
      return (
        <ItemRow
          icon={<Calendar size={14} className="text-[#1a73e8]" />}
          title={item.title}
          subtitle={new Date(item.start).toLocaleTimeString("en-US", {
            hour: "numeric",
            minute: "2-digit",
          })}
          href={item.meetLink ?? undefined}
        />
      );
    case "stale-engagement":
      return (
        <ItemRow
          icon={<AlertTriangle size={14} className="text-[#888]" />}
          title={item.companyName}
          subtitle={`No contact in ${item.daysSince}+ days`}
          href={`/clients/${item.id}`}
          overflowActions={[
            {
              label: "Snooze 3 days",
              onClick: () => {
                void snoozeStaleEngagement({ engagementId: item.id, days: 3 });
              },
            },
          ]}
        />
      );
    case "alert-deploy":
      return (
        <ItemRow
          icon={<Rocket size={14} className="text-[#c0392b]" />}
          title={`${item.project} deploy failed`}
          href={item.url}
          overflowActions={[
            {
              label: "Dismiss",
              onClick: () => {
                void dismissAlert({ kind: "deploy", id: item.id });
              },
            },
          ]}
          tint="danger"
        />
      );
    case "alert-monitor":
      return (
        <ItemRow
          icon={<Activity size={14} className="text-[#c0392b]" />}
          title={`${item.label ?? item.siteUrl} is failing`}
          subtitle={item.reason}
          href={`/development/monitoring`}
          tint="danger"
        />
      );
    case "alert-invoice":
      return (
        <ItemRow
          icon={<Receipt size={14} className="text-[#e67e22]" />}
          title={`${item.number} — ${item.client}`}
          subtitle={`$${item.amount.toLocaleString()} · overdue`}
          href={`/invoices?invoiceId=${item.id}`}
          tint="warning"
        />
      );
  }
}
