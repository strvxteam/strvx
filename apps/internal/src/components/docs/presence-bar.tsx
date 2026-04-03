"use client";

const TEAM_AVATARS: Record<string, string> = {
  Nick: "/avatars/nick.png",
  Hari: "/avatars/hari.png",
  Alex: "/avatars/alex.png",
};

interface PresenceUser {
  userId: string;
  userName: string;
  userColor: string;
}

export function PresenceBar({ users }: { users: PresenceUser[] }) {
  if (users.length <= 1) return null;

  return (
    <div className="flex items-center gap-2">
      <div className="flex items-center -space-x-1.5">
        {users.slice(0, 5).map((u) =>
          TEAM_AVATARS[u.userName] ? (
            <img
              key={u.userId}
              src={TEAM_AVATARS[u.userName]}
              alt={u.userName}
              className="h-6 w-6 rounded-full border-2 border-white object-cover"
              title={u.userName}
            />
          ) : (
            <div
              key={u.userId}
              className="flex h-6 w-6 items-center justify-center rounded-full border-2 border-white text-[10px] font-semibold"
              style={{ backgroundColor: u.userColor + "20", color: u.userColor }}
              title={u.userName}
            >
              {u.userName.charAt(0).toUpperCase()}
            </div>
          )
        )}
      </div>
      <span className="text-[11px] text-[#aaa]">
        {users.length} editing
      </span>
    </div>
  );
}
