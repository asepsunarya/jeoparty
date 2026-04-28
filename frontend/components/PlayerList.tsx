"use client";

import { motion, AnimatePresence } from "framer-motion";
import type { Player } from "@jeoparty/shared";

export function PlayerList({
  players,
  hostId,
}: {
  players: Player[];
  hostId: string;
}) {
  const list = players.filter((p) => p.id !== hostId);
  return (
    <div className="flex flex-wrap gap-2">
      <AnimatePresence>
        {list.map((p) => (
          <motion.div
            key={p.id}
            layout
            initial={{ scale: 0.7, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.7, opacity: 0 }}
            className="px-3 py-1.5 rounded-full flex items-center gap-2 bg-white/5 border border-white/10"
          >
            <span
              className="w-3 h-3 rounded-full"
              style={{ background: p.avatarColor }}
            />
            <span className="text-sm">{p.nickname}</span>
          </motion.div>
        ))}
      </AnimatePresence>
      {list.length === 0 && (
        <span className="text-white/40 text-sm">No players yet.</span>
      )}
    </div>
  );
}
