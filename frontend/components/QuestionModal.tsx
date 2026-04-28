"use client";

import { AnimatePresence, motion } from "framer-motion";
import ReactMarkdown from "react-markdown";
import type { Player, Question, RoomPublic } from "@jeoparty/shared";
import { MediaRenderer } from "./MediaRenderer";
import { useGame } from "@/store/gameStore";

interface Props {
  room: RoomPublic;
  question: Question | null;
  isHost: boolean;
  you: Player | null;
  onReveal: () => void;
  onRevealAnswer: () => void;
  onJudge: (correct: boolean) => void;
  onClose: () => void;
  onBuzz: () => void;
  onWager: (amount: number) => void;
}

export function QuestionModal({
  room,
  question,
  isHost,
  you,
  onReveal,
  onRevealAnswer,
  onJudge,
  onClose,
  onBuzz,
  onWager,
}: Props) {
  const timer = useGame((s) => s.timerRemainingMs);
  const active = room.activeQuestion;
  if (!active) return null;

  const buzzed = active.buzzedPlayerId
    ? room.players.find((p) => p.id === active.buzzedPlayerId)
    : null;
  const isDD = active.isDailyDouble;
  const isBuzzer = you && !isHost;
  const canBuzz =
    isBuzzer &&
    !buzzed &&
    room.phase === "question" &&
    !active.answerRevealed &&
    !isDD;

  return (
    <AnimatePresence>
      <motion.div
        key="overlay"
        className="fixed inset-0 z-40 bg-black/80 backdrop-blur"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
      />
      <motion.div
        key="panel"
        className="fixed inset-0 z-50 flex items-center justify-center p-4"
        initial={{ scale: 0.9, opacity: 0, rotateX: 12 }}
        animate={{ scale: 1, opacity: 1, rotateX: 0 }}
        exit={{ scale: 0.95, opacity: 0 }}
        transition={{ type: "spring", stiffness: 200, damping: 22 }}
      >
        <div className="relative w-full max-w-5xl card border-jeopardy-gold/40 shadow-glow">
          {/* Timer bar */}
          {timer !== null && room.phase !== "reveal" && (
            <div className="absolute left-0 top-0 right-0 h-1 bg-white/10 overflow-hidden rounded-t-2xl">
              <motion.div
                className="h-full bg-jeopardy-gold"
                initial={{ width: "100%" }}
                animate={{ width: `${Math.max(0, Math.min(100, (timer / (room.settings.buzzWindowSec * 1000)) * 100))}%` }}
                transition={{ duration: 0.2, ease: "linear" }}
              />
            </div>
          )}

          {isDD && room.phase !== "reveal" && (
            <div className="mb-4 text-center">
              <motion.div
                initial={{ scale: 0.5, rotate: -12, opacity: 0 }}
                animate={{ scale: 1, rotate: 0, opacity: 1 }}
                className="inline-block font-display text-4xl md:text-6xl text-jeopardy-gold drop-shadow-[0_4px_0_rgba(0,0,0,0.4)]"
              >
                DAILY DOUBLE!
              </motion.div>
            </div>
          )}

          {question?.media && (
            <div className="mb-4">
              <MediaRenderer media={question.media} />
            </div>
          )}

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="prose-invert-tight text-white font-display text-2xl md:text-5xl leading-tight text-center px-4 py-6"
          >
            {question ? (
              <ReactMarkdown>{question.prompt}</ReactMarkdown>
            ) : (
              <span className="text-white/40">
                {isHost ? "Click 'Reveal' to show the question" : "Waiting for host..."}
              </span>
            )}
          </motion.div>

          {active.answerRevealed && question && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="mt-2 space-y-3"
            >
              {question.answerMedia && (
                <MediaRenderer media={question.answerMedia} />
              )}
              <div className="text-center text-jeopardy-gold font-display text-2xl md:text-4xl">
                <ReactMarkdown>{question.answer}</ReactMarkdown>
              </div>
            </motion.div>
          )}

          {buzzed && !active.answerRevealed && (
            <motion.div
              key={buzzed.id}
              initial={{ scale: 0.6, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="mt-4 text-center"
            >
              <span
                className="inline-block px-4 py-2 rounded-full text-white font-bold animate-buzz-pulse"
                style={{ background: buzzed.avatarColor }}
              >
                {buzzed.nickname} buzzed in
              </span>
            </motion.div>
          )}

          {/* Player: buzz button */}
          {isBuzzer && !isDD && (
            <div className="mt-6 flex justify-center">
              <motion.button
                whileTap={{ scale: 0.9 }}
                whileHover={canBuzz ? { scale: 1.05 } : undefined}
                disabled={!canBuzz}
                onClick={onBuzz}
                className={`w-40 h-40 rounded-full font-display text-4xl shadow-glow transition
                  ${canBuzz
                    ? "bg-jeopardy-gold text-jeopardy-blue hover:brightness-110"
                    : "bg-white/10 text-white/40 cursor-not-allowed"}`}
              >
                BUZZ
              </motion.button>
            </div>
          )}

          {/* Player: Daily Double wager */}
          {isBuzzer && isDD && !active.wager && room.controlPlayerId === you?.id && (
            <DDWagerForm
              onWager={onWager}
              max={Math.max(you.score, 1000)}
            />
          )}

          {/* Host controls */}
          {isHost && (
            <div className="mt-8 flex flex-wrap justify-center gap-3">
              {!question && (
                <button className="btn-primary" onClick={onReveal}>
                  Reveal question
                </button>
              )}
              {question && !active.answerRevealed && room.phase !== "reveal" && (
                <>
                  <button
                    className="btn-ghost"
                    onClick={() => onJudge(true)}
                    title={buzzed ? "" : "Judge the buzzed player. With no buzzer, this just marks the tile correct and advances."}
                  >
                    ✓ Correct{buzzed ? ` (${buzzed.nickname})` : ""}
                  </button>
                  <button
                    className="btn-ghost"
                    onClick={() => onJudge(false)}
                  >
                    ✗ Wrong{buzzed ? ` (${buzzed.nickname})` : ""}
                  </button>
                  <button className="btn-ghost" onClick={onRevealAnswer}>
                    Reveal answer
                  </button>
                </>
              )}
              {(active.answerRevealed || room.phase === "reveal") && (
                <button className="btn-primary" onClick={onClose}>
                  Next →
                </button>
              )}
            </div>
          )}
        </div>
      </motion.div>
    </AnimatePresence>
  );
}

function DDWagerForm({
  onWager,
  max,
}: {
  onWager: (amt: number) => void;
  max: number;
}) {
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        const amt = Number(fd.get("amt"));
        if (!Number.isFinite(amt) || amt < 5) return;
        onWager(amt);
      }}
      className="mt-6 flex justify-center items-end gap-3"
    >
      <label className="text-white/80">
        Your wager (min 5, max {max})
        <input
          name="amt"
          type="number"
          min={5}
          max={max}
          defaultValue={Math.min(1000, max)}
          className="w-40 ml-2 text-xl font-bold"
        />
      </label>
      <button type="submit" className="btn-primary">
        Lock it in
      </button>
    </form>
  );
}
