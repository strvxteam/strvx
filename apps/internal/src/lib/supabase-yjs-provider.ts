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
  onNoPeers?: () => void;
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
  private syncReceived = false;
  private noPeersTimer: ReturnType<typeof setTimeout> | null = null;
  private onNoPeers?: () => void;

  constructor(opts: SupabaseProviderOptions) {
    this.supabase = createClient();
    this.ydoc = opts.ydoc;
    this.documentId = opts.documentId;
    this.user = opts.user;
    this.onPresenceChange = opts.onPresenceChange;
    this.onNoPeers = opts.onNoPeers;

    this.channel = this.supabase.channel(`doc:${this.documentId}`, {
      config: { broadcast: { self: false } },
    });

    // Register ALL event handlers before subscribing
    this.channel
      .on("broadcast", { event: "yjs-update" }, (payload) => {
        if (this.destroyed) return;
        const update = new Uint8Array(payload.payload.update);
        Y.applyUpdate(this.ydoc, update, "remote");
      })
      .on("broadcast", { event: "yjs-sync-request" }, () => {
        if (this.destroyed) return;
        const state = Y.encodeStateAsUpdate(this.ydoc);
        this.channel.send({
          type: "broadcast",
          event: "yjs-sync-response",
          payload: { update: Array.from(state) },
        });
      })
      .on("broadcast", { event: "yjs-sync-response" }, (payload) => {
        if (this.destroyed) return;
        // A peer responded — cancel the "no peers" fallback hydration
        this.syncReceived = true;
        if (this.noPeersTimer) {
          clearTimeout(this.noPeersTimer);
          this.noPeersTimer = null;
        }
        const update = new Uint8Array(payload.payload.update);
        Y.applyUpdate(this.ydoc, update, "remote");
      })
      .on("presence", { event: "sync" }, () => {
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
      })
      .subscribe(async (status) => {
        if (status === "SUBSCRIBED" && !this.destroyed) {
          await this.channel.track(this.user);
          this.channel.send({
            type: "broadcast",
            event: "yjs-sync-request",
            payload: {},
          });
          // If no peer responds within 400ms, we're the only one open —
          // signal the editor to hydrate content from the database.
          this.noPeersTimer = setTimeout(() => {
            if (!this.syncReceived && !this.destroyed) {
              this.onNoPeers?.();
            }
          }, 400);
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
    if (this.noPeersTimer) {
      clearTimeout(this.noPeersTimer);
      this.noPeersTimer = null;
    }
    this.onSaveRequested?.();
    try {
      await this.channel.untrack();
    } catch {
      // Channel may already be closed during rapid cleanup
    }
    await this.supabase.removeChannel(this.channel);
  }
}
