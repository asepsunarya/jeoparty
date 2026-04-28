"use client";

import { AnimatePresence, motion } from "framer-motion";
import clsx from "clsx";
import type { Player, RoomPublic } from "@jeoparty/shared";

export function Scoreboard({
  room,
  youId,
}: {
  room: RoomPublic;
  youId?: string | null;
}) {
  const players = room.players
    .filter((p) => p.id !== room.hostId)
    .sort((a, b) => b.score - a.score);
  return (
    <div className="flex flex-wrap gap-2 justify-center">
      <AnimatePresence>
        {players.map((p) => (
          <motion.div
            key={p.id}
            layout
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className={clsx(
              "rounded-xl px-3 py-2 flex items-center gap-3 min-w-[160px] border",
              room.controlPlayerId === p.id
                ? "border-jeopardy-gold bg-jeopardy-gold/10"
                : "border-white/10 bg-white/5",
              p.id === youId && "ring-2 ring-white/30",
            )}
          >
            <div
              className="w-8 h-8 rounded-full flex items-center justify-center font-bold text-white text-sm"
              style={{ background: p.avatarColor }}
            >
              {p.nickname.slice(0, 2).toUpperCase()}
            </div>
            <div className="flex-1">
              <div className={clsx("text-sm", !p.connected && "opacity-50")}>
                {p.nickname}
                {!p.connected && " (away)"}
              </div>
              <motion.div
                key={p.score}
                initial={{ scale: 1.25, color: "#FFCC00" }}
                animate={{ scale: 1, color: p.score < 0 ? "#ef4444" : "#ffffff" }}
                className="font-display text-xl leading-none"
              >
                {p.score}
              </motion.div>
            </div>
          </motion.div>
        ))}
      </AnimatePresence>
      {players.length === 0 && (
        <div className="text-white/40 text-sm">
          Waiting for players to join…
        </div>
      )}
    </div>
  );
}
