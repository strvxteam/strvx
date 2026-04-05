const TEAM_AVATARS: Record<string, string> = {
  Nick: "/avatars/nick.png",
  Hari: "/avatars/hari.png",
  Alex: "/avatars/alex.png",
};

interface TeamMember {
  id: string;
  name: string;
  status: string;
}

export function TeamStatus({ members }: { members: TeamMember[] }) {
  return (
    <div className="mt-6 grid grid-cols-3 gap-2 sm:gap-4">
      {members.map((m) => {
        const isAvailable = m.status === "available";
        const avatar = TEAM_AVATARS[m.name];

        return (
          <div
            key={m.id}
            className="flex flex-col items-center gap-2 rounded-xl border border-[#e0e0e0] bg-white px-2 py-3 sm:px-4 sm:py-4"
          >
            <div className="relative">
              {avatar ? (
                <img
                  src={avatar}
                  alt={m.name}
                  className="h-16 w-16 rounded-full object-cover"
                  style={{
                    boxShadow: isAvailable
                      ? "0 0 0 3px #fff, 0 0 0 5px #22c55e, 0 0 12px rgba(34, 197, 94, 0.4)"
                      : "0 0 0 3px #fff, 0 0 0 5px #ef4444, 0 0 12px rgba(239, 68, 68, 0.4)",
                  }}
                />
              ) : (
                <div
                  className="flex h-16 w-16 items-center justify-center rounded-full bg-[#e0e0e0] text-[18px] font-semibold text-[#666]"
                  style={{
                    boxShadow: isAvailable
                      ? "0 0 0 3px #fff, 0 0 0 5px #22c55e, 0 0 12px rgba(34, 197, 94, 0.4)"
                      : "0 0 0 3px #fff, 0 0 0 5px #ef4444, 0 0 12px rgba(239, 68, 68, 0.4)",
                  }}
                >
                  {m.name[0]}
                </div>
              )}
            </div>
            <div className="text-center">
              <p className="text-[13px] font-medium text-[#222]">{m.name}</p>
              <p
                className={`text-[11px] font-medium ${
                  isAvailable ? "text-[#22c55e]" : "text-[#ef4444]"
                }`}
              >
                {isAvailable ? "Available" : "Busy"}
              </p>
            </div>
          </div>
        );
      })}
    </div>
  );
}
