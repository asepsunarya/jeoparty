"use client";

import { AnimatePresence, motion } from "framer-motion";
import clsx from "clsx";
import type { RoomPublic } from "@jeoparty/shared";

interface Props {
  room: RoomPublic;
  interactive?: boolean;
  onSelect?: (categoryId: string, questionId: string) => void;
}

/**
 * The 6x5 Jeopardy board. Smooth tile flip on selection and fade on answered.
 */
export function Board({ room, interactive, onSelect }: Props) {
  const board = room.board;
  if (!board) return null;

  return (
    <div className="w-full overflow-x-auto">
      <div
        className="grid gap-2 mx-auto"
        style={{
          gridTemplateColumns: `repeat(${board.categories.length}, minmax(140px, 1fr))`,
          maxWidth: "1400px",
        }}
      >
        {board.categories.map((cat) => (
          <div
            key={cat.id}
            className="bg-jeopardy-blue rounded-lg p-3 text-center shadow-tile"
          >
            <h3 className="font-display text-xl md:text-2xl text-jeopardy-cream leading-tight">
              {cat.title}
            </h3>
          </div>
        ))}
        {[0, 1, 2, 3, 4].map((row) =>
          board.categories.map((cat) => {
            const q = cat.questions[row];
            if (!q) return <div key={`${cat.id}-${row}`} />;
            const tile = room.tiles.find(
              (t) => t.categoryId === cat.id && t.questionId === q.id,
            );
            const isAnswered = tile?.status === "answered";
            const isActive = tile?.status === "active";
            return (
              <motion.button
                key={q.id}
                disabled={!interactive || isAnswered || isActive}
                whileHover={
                  interactive && !isAnswered
                    ? { scale: 1.03, rotate: 0 }
                    : undefined
                }
                whileTap={interactive ? { scale: 0.97 } : undefined}
                onClick={() => onSelect?.(cat.id, q.id)}
                className={clsx(
                  "aspect-[16/9] rounded-lg font-display relative overflow-hidden select-none transition",
                  "shadow-tile flex items-center justify-center",
                  isAnswered
                    ? "bg-black/40 text-transparent cursor-default"
                    : "bg-jeopardy-blue text-jeopardy-gold",
                  isActive && "ring-4 ring-jeopardy-gold/80",
                )}
              >
                <AnimatePresence>
                  {!isAnswered && (
                    <motion.span
                      key="val"
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0 }}
                      className="text-3xl md:text-5xl drop-shadow-[0_4px_0_rgba(0,0,0,0.3)]"
                    >
                      {q.value}
                    </motion.span>
                  )}
                </AnimatePresence>
              </motion.button>
            );
          }),
        )}
      </div>
    </div>
  );
}
