import * as Y from "yjs";
import { createClient } from "@/lib/supabase/client";
import type { RealtimeChannel, SupabaseClient } from "@supabase/supabase-js";

interface PresenceUser {
  userId: string;
  userName: string;
  userColor: string;
}

interface SupabaseProviderOptions {
  documentId: string;
  ydoc: Y.Doc;
  user: PresenceUser;
  onPresenceChange?: (users: PresenceUser[]) => void;
}

export class SupabaseYjsProvider {
  private supabase: SupabaseClient;
  private channel: RealtimeChannel;
  private ydoc: Y.Doc;
  private documentId: string;
  private user: PresenceUser;
  private saveTimer: ReturnType<typeof setTimeout> | null = null;
  private onPresenceChange?: (users: PresenceUser[]) => void;
  private destroyed = false;

  awareness: Map<string, PresenceUser> = new Map();

  constructor(opts: SupabaseProviderOptions) {
    this.supabase = createClient();
    this.ydoc = opts.ydoc;
    this.documentId = opts.documentId;
    this.user = opts.user;
    this.onPresenceChange = opts.onPresenceChange;

    this.channel = this.supabase.channel(`doc:${this.documentId}`, {
      config: { broadcast: { self: false } },
    });

    this.channel.on("broadcast", { event: "yjs-update" }, (payload) => {
      if (this.destroyed) return;
      const update = new Uint8Array(payload.payload.update);
      Y.applyUpdate(this.ydoc, update, "remote");
    });

    this.channel.on("broadcast", { event: "yjs-sync-request" }, () => {
      if (this.destroyed) return;
      const state = Y.encodeStateAsUpdate(this.ydoc);
      this.channel.send({
        type: "broadcast",
        event: "yjs-sync-response",
        payload: { update: Array.from(state) },
      });
    });

    this.channel.on("broadcast", { event: "yjs-sync-response" }, (payload) => {
      if (this.destroyed) return;
      const update = new Uint8Array(payload.payload.update);
      Y.applyUpdate(this.ydoc, update, "remote");
    });

    this.channel.on("presence", { event: "sync" }, () => {
      if (this.destroyed) return;
      const state = this.channel.presenceState<PresenceUser>();
      this.awareness.clear();
      for (const key of Object.keys(state)) {
        const presences = state[key];
        for (const p of presences) {
          this.awareness.set(p.userId, p);
        }
      }
      this.onPresenceChange?.(Array.from(this.awareness.values()));
    });

    this.channel.subscribe(async (status) => {
      if (status === "SUBSCRIBED" && !this.destroyed) {
        await this.channel.track(this.user);
        this.channel.send({
          type: "broadcast",
          event: "yjs-sync-request",
          payload: {},
        });
      }
    });

    this.ydoc.on("update", this.handleLocalUpdate);
  }

  private handleLocalUpdate = (update: Uint8Array, origin: unknown) => {
    if (origin === "remote" || this.destroyed) return;

    this.channel.send({
      type: "broadcast",
      event: "yjs-update",
      payload: { update: Array.from(update) },
    });

    if (this.saveTimer) clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => {
      this.onSaveRequested?.();
    }, 2000);
  };

  onSaveRequested?: () => void;

  async destroy() {
    this.destroyed = true;
    this.ydoc.off("update", this.handleLocalUpdate);
    if (this.saveTimer) clearTimeout(this.saveTimer);
    this.onSaveRequested?.();
    await this.channel.untrack();
    await this.supabase.removeChannel(this.channel);
  }
}
