"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { useGame } from "@/store/gameStore";
import { emit, getSocket } from "@/lib/socket";
import { Board } from "@/components/Board";
import { QuestionModal } from "@/components/QuestionModal";
import { Scoreboard } from "@/components/Scoreboard";
import { PlayerList } from "@/components/PlayerList";
import type { Player, RoomPublic } from "@jeoparty/shared";
import toast from "react-hot-toast";

export default function PlayPage() {
  const { code } = useParams<{ code: string }>();
  const router = useRouter();
  const room = useGame((s) => s.room);
  const you = useGame((s) => s.you);
  const currentQuestion = useGame((s) => s.currentQuestion);
  const winners = useGame((s) => s.winners);
  const setInitial = useGame((s) => s.setInitial);
  const attachListeners = useGame((s) => s.attachListeners);
  const [nicknamePrompt, setNicknamePrompt] = useState<string | null>(null);

  useEffect(() => {
    const detach = attachListeners();
    if (!room) {
      setNicknamePrompt("");
    }
    return () => detach();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function joinWithNickname(nickname: string) {
    try {
      const res = await emit<{
        room: RoomPublic;
        you: Player;
        role: "player";
      }>("join_room", { code, nickname });
      setInitial(res);
      setNicknamePrompt(null);
    } catch (e: any) {
      toast.error(e.message);
    }
  }

  if (nicknamePrompt !== null && !room) {
    return (
      <main className="min-h-screen flex items-center justify-center p-6">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            joinWithNickname(String(fd.get("nickname") ?? ""));
          }}
          className="card w-full max-w-md space-y-4 text-center"
        >
          <h1 className="font-display text-4xl text-jeopardy-gold">
            Join room {code}
          </h1>
          <input
            name="nickname"
            placeholder="Your nickname"
            maxLength={24}
            className="w-full text-lg text-center"
            autoFocus
          />
          <button className="btn-primary w-full" type="submit">
            Join
          </button>
          <button
            type="button"
            onClick={() => router.push("/")}
            className="block w-full text-white/60 text-sm"
          >
            ← Back
          </button>
        </form>
      </main>
    );
  }

  if (!room || !you)
    return <div className="p-10 text-center text-white/60">Loading…</div>;

  const isMyTurn = room.controlPlayerId === you.id;

  return (
    <main className="min-h-screen p-4 md:p-8 space-y-6">
      <header className="flex justify-between items-center">
        <div>
          <h1 className="font-display text-3xl text-jeopardy-gold">
            {room.board?.title ?? "Jeoparty"}
          </h1>
          <div className="text-xs text-white/60">Room {room.code}</div>
        </div>
        <div
          className="px-3 py-1.5 rounded-full text-sm font-bold"
          style={{ background: you.avatarColor }}
        >
          {you.nickname} · {you.score} pts
        </div>
      </header>

      {room.phase === "lobby" && (
        <section className="card text-center space-y-4">
          <motion.div
            animate={{ scale: [1, 1.02, 1] }}
            transition={{ repeat: Infinity, duration: 2 }}
            className="font-display text-3xl text-jeopardy-gold"
          >
            Waiting for host to start…
          </motion.div>
          <PlayerList players={room.players} hostId={room.hostId} />
        </section>
      )}

      {room.phase !== "lobby" && room.phase !== "ended" && (
        <>
          {isMyTurn && room.phase === "board" && (
            <div className="text-center text-jeopardy-gold font-display text-2xl">
              YOUR TURN — pick a tile!
            </div>
          )}
          <Board room={room} interactive={false} />
        </>
      )}

      <Scoreboard room={room} youId={you.id} />

      {room.activeQuestion && (
        <QuestionModal
          room={room}
          question={currentQuestion}
          isHost={false}
          you={you}
          onReveal={() => {}}
          onRevealAnswer={() => {}}
          onJudge={() => {}}
          onClose={() => {}}
          onBuzz={() => getSocket().emit("buzz_in", { code: room.code })}
          onWager={(amt) =>
            getSocket().emit("wager", { code: room.code, amount: amt })
          }
        />
      )}

      {room.phase === "final-wager" && <PlayerFinalWager room={room} you={you} />}
      {room.phase === "final-question" && (
        <PlayerFinalQuestion room={room} you={you} />
      )}

      {room.phase === "ended" && (
        <section className="card text-center space-y-4">
          <h2 className="font-display text-4xl text-jeopardy-gold">
            Game over
          </h2>
          <p>Final score: {you.score} pts</p>
          <ol className="space-y-1">
            {(winners ?? [...room.players].filter((p) => p.id !== room.hostId).sort((a, b) => b.score - a.score)).map((p, i) => (
              <li key={p.id} className="flex justify-between">
                <span>#{i + 1} {p.nickname}</span>
                <span>{p.score} pts</span>
              </li>
            ))}
          </ol>
        </section>
      )}
    </main>
  );
}

function PlayerFinalWager({ room, you }: { room: RoomPublic; you: Player }) {
  const submitted = room.finalWagers?.[you.id] !== undefined;
  if (submitted)
    return (
      <section className="card text-center">
        <div className="font-display text-2xl text-jeopardy-gold">
          Wager locked in. Waiting on others…
        </div>
      </section>
    );
  return (
    <section className="card max-w-md mx-auto text-center space-y-3">
      <h2 className="font-display text-3xl text-jeopardy-gold">
        Final Jeopardy — your wager
      </h2>
      <p className="text-white/70">Max {Math.max(you.score, 0)} pts</p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const amt = Number(new FormData(e.currentTarget).get("amt"));
          if (!Number.isFinite(amt)) return;
          getSocket().emit("wager", { code: room.code, amount: amt });
        }}
        className="flex gap-2 justify-center"
      >
        <input
          name="amt"
          type="number"
          min={0}
          max={Math.max(you.score, 0)}
          defaultValue={Math.min(0, Math.max(you.score, 0))}
          className="w-40 text-xl text-center"
        />
        <button className="btn-primary" type="submit">
          Lock it in
        </button>
      </form>
    </section>
  );
}

function PlayerFinalQuestion({ room, you }: { room: RoomPublic; you: Player }) {
  const submitted = room.finalAnswers?.[you.id] !== undefined;
  if (submitted)
    return (
      <section className="card text-center font-display text-2xl">
        Answer submitted. Fingers crossed…
      </section>
    );
  return (
    <section className="card max-w-2xl mx-auto space-y-3">
      <h2 className="font-display text-3xl text-jeopardy-gold text-center">
        Final Jeopardy
      </h2>
      <div className="text-xl text-center">{room.board?.final?.prompt}</div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const ans = String(new FormData(e.currentTarget).get("ans") ?? "");
          getSocket().emit("submit_answer", { code: room.code, answer: ans });
        }}
        className="flex gap-2"
      >
        <input
          name="ans"
          placeholder="Your answer"
          className="flex-1 text-lg"
          autoFocus
        />
        <button className="btn-primary">Submit</button>
      </form>
    </section>
  );
}
