"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { useGame } from "@/store/gameStore";
import { emit, getSocket } from "@/lib/socket";
import { Board } from "@/components/Board";
import { QuestionModal } from "@/components/QuestionModal";
import { Scoreboard } from "@/components/Scoreboard";
import { PlayerList } from "@/components/PlayerList";
import type { Player, RoomPublic } from "@jeoparty/shared";
import toast from "react-hot-toast";

export default function HostPage() {
  const { code } = useParams<{ code: string }>();
  const router = useRouter();
  const room = useGame((s) => s.room);
  const you = useGame((s) => s.you);
  const currentQuestion = useGame((s) => s.currentQuestion);
  const winners = useGame((s) => s.winners);
  const setInitial = useGame((s) => s.setInitial);
  const attachListeners = useGame((s) => s.attachListeners);
  const hostTokenInStore = useGame((s) => s.hostToken);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const detach = attachListeners();
    (async () => {
      try {
        // First-time creation path already set room in the store; otherwise try to reconnect as host.
        if (!room) {
          const token =
            hostTokenInStore ??
            (typeof localStorage !== "undefined"
              ? localStorage.getItem(`jp:host:${code}`)
              : null);
          if (!token) {
            router.push("/");
            return;
          }
          const res = await emit<{
            room: RoomPublic;
            you: Player;
            role: "host";
            hostToken: string;
          }>("join_room", {
            code,
            asHost: true,
            hostToken: token,
            nickname: "Host",
          });
          setInitial(res);
        }
      } catch (e: any) {
        toast.error(e.message);
        router.push("/");
      } finally {
        setReady(true);
      }
    })();

    const s = getSocket();
    const onConnect = async () => {
      // Reconnect flow if the socket drops
      const token =
        hostTokenInStore ??
        (typeof localStorage !== "undefined"
          ? localStorage.getItem(`jp:host:${code}`)
          : null);
      if (token) {
        try {
          const res = await emit<{
            room: RoomPublic;
            you: Player;
            role: "host";
            hostToken: string;
          }>("join_room", {
            code,
            asHost: true,
            hostToken: token,
            nickname: "Host",
          });
          setInitial(res);
        } catch {
          /* ignore */
        }
      }
    };
    s.on("connect", onConnect);
    return () => {
      s.off("connect", onConnect);
      detach();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code]);

  if (!ready || !room || !you) {
    return <div className="p-10 text-center text-white/60">Loading room…</div>;
  }

  return (
    <main className="min-h-screen p-4 md:p-8 space-y-6">
      <TopBar room={room} />

      {room.phase === "lobby" && <Lobby room={room} />}
      {room.phase !== "lobby" && room.phase !== "ended" && (
        <Board
          room={room}
          interactive={room.phase === "board"}
          onSelect={(categoryId, questionId) =>
            getSocket().emit("select_question", {
              code: room.code,
              categoryId,
              questionId,
            })
          }
        />
      )}

      <Scoreboard room={room} youId={you.id} />

      {room.activeQuestion && (
        <QuestionModal
          room={room}
          question={currentQuestion}
          isHost
          you={you}
          onReveal={() =>
            getSocket().emit("reveal_question", { code: room.code })
          }
          onRevealAnswer={() =>
            getSocket().emit("reveal_answer", { code: room.code })
          }
          onJudge={(correct) =>
            getSocket().emit("judge_answer", { code: room.code, correct })
          }
          onClose={() =>
            getSocket().emit("next_turn", { code: room.code })
          }
          onBuzz={() => {
            /* host never buzzes */
          }}
          onWager={() => {
            /* host doesn't wager */
          }}
        />
      )}

      {room.phase === "ended" && <EndScreen room={room} winners={winners} />}
      {room.phase === "final-wager" && <FinalWagerHost room={room} />}
      {room.phase === "final-question" && <FinalQuestionHost room={room} />}
      {room.phase === "final-reveal" && <FinalRevealHost room={room} />}
    </main>
  );
}

function TopBar({ room }: { room: RoomPublic }) {
  return (
    <header className="flex flex-wrap items-center justify-between gap-3">
      <div>
        <h1 className="font-display text-4xl text-jeopardy-gold">
          {room.board?.title ?? "Jeoparty"}
        </h1>
        <div className="text-sm text-white/60">
          Hosted by {room.hostName} · Phase: {room.phase}
        </div>
      </div>
      <div className="text-right">
        <div className="text-white/60 text-xs uppercase tracking-widest">
          Room code
        </div>
        <div className="font-display text-5xl text-white tracking-[0.4em]">
          {room.code}
        </div>
      </div>
    </header>
  );
}

function Lobby({ room }: { room: RoomPublic }) {
  const playerCount = room.players.filter((p) => p.id !== room.hostId).length;
  return (
    <section className="card max-w-3xl mx-auto text-center space-y-6">
      <div>
        <div className="uppercase text-sm text-white/60 tracking-widest">
          Waiting for players
        </div>
        <div className="font-display text-3xl mt-2">
          Share the code with your friends
        </div>
      </div>
      <PlayerList players={room.players} hostId={room.hostId} />
      <div className="flex flex-wrap items-center justify-center gap-3">
        <button
          className="btn-primary"
          disabled={playerCount === 0}
          onClick={() => getSocket().emit("start_game", { code: room.code })}
        >
          Start game ({playerCount} {playerCount === 1 ? "player" : "players"})
        </button>
        <button
          className="btn-ghost"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(
                `${window.location.origin}/?code=${room.code}`,
              );
              toast.success("Invite link copied!");
            } catch {
              toast.error("Clipboard blocked — share the code manually.");
            }
          }}
        >
          Copy invite link
        </button>
      </div>
    </section>
  );
}

function EndScreen({ room, winners }: { room: RoomPublic; winners: Player[] | null }) {
  const list =
    winners ??
    [...room.players]
      .filter((p) => p.id !== room.hostId)
      .sort((a, b) => b.score - a.score);
  return (
    <AnimatePresence>
      <motion.section
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        className="card max-w-3xl mx-auto text-center space-y-6"
      >
        <h2 className="font-display text-5xl text-jeopardy-gold">
          Game over
        </h2>
        <ol className="space-y-2">
          {list.map((p, i) => (
            <li
              key={p.id}
              className="flex justify-between items-center px-4 py-3 rounded-xl bg-white/5"
            >
              <span className="font-display text-2xl">
                {i === 0 ? "🏆 " : ""}#{i + 1} {p.nickname}
              </span>
              <span className="font-display text-2xl">{p.score} pts</span>
            </li>
          ))}
        </ol>
      </motion.section>
    </AnimatePresence>
  );
}

function FinalWagerHost({ room }: { room: RoomPublic }) {
  const players = room.players.filter((p) => p.id !== room.hostId);
  const pending = players.filter((p) => room.finalWagers?.[p.id] === undefined);
  return (
    <section className="card max-w-3xl mx-auto text-center space-y-4">
      <h2 className="font-display text-4xl text-jeopardy-gold">
        Final Jeopardy! — Wagers
      </h2>
      <p className="text-white/70">
        Category: {room.board?.final ? "hidden until reveal" : "—"}
      </p>
      <p className="text-white/80">
        {pending.length === 0
          ? "All wagers received."
          : `Waiting on ${pending.map((p) => p.nickname).join(", ")}…`}
      </p>
    </section>
  );
}

function FinalQuestionHost({ room }: { room: RoomPublic }) {
  const q = room.board?.final;
  return (
    <section className="card max-w-3xl mx-auto space-y-4">
      <h2 className="font-display text-4xl text-jeopardy-gold text-center">
        Final Jeopardy
      </h2>
      <div className="text-2xl font-display text-center">
        {q?.prompt ?? "—"}
      </div>
      <div className="text-sm text-white/60 text-center">
        Answer: <span className="font-bold">{q?.answer ?? "—"}</span>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-2 mt-4">
        {room.players
          .filter((p) => p.id !== room.hostId)
          .map((p) => (
            <div
              key={p.id}
              className="px-3 py-2 rounded-lg bg-white/5 flex justify-between"
            >
              <span>{p.nickname}</span>
              <span className="text-white/70">
                {room.finalAnswers?.[p.id] ? "submitted" : "thinking..."}
              </span>
            </div>
          ))}
      </div>
    </section>
  );
}

function FinalRevealHost({ room }: { room: RoomPublic }) {
  const players = room.players.filter((p) => p.id !== room.hostId);
  return (
    <section className="card max-w-3xl mx-auto space-y-4">
      <h2 className="font-display text-4xl text-jeopardy-gold text-center">
        Final Reveal
      </h2>
      <p className="text-center text-white/70">
        Adjust scores based on each player's answer + wager.
      </p>
      <div className="space-y-2">
        {players.map((p) => {
          const wager = room.finalWagers?.[p.id] ?? 0;
          const ans = room.finalAnswers?.[p.id] ?? "";
          return (
            <div key={p.id} className="card bg-white/5 border-white/10">
              <div className="flex justify-between items-center">
                <div>
                  <div className="font-bold">{p.nickname}</div>
                  <div className="text-xs text-white/60">
                    Score {p.score} · Wager {wager}
                  </div>
                </div>
                <div className="flex gap-2">
                  <button
                    className="btn-ghost"
                    onClick={() =>
                      getSocket().emit("update_score", {
                        code: room.code,
                        playerId: p.id,
                        delta: wager,
                      })
                    }
                  >
                    +{wager}
                  </button>
                  <button
                    className="btn-ghost"
                    onClick={() =>
                      getSocket().emit("update_score", {
                        code: room.code,
                        playerId: p.id,
                        delta: -wager,
                      })
                    }
                  >
                    −{wager}
                  </button>
                </div>
              </div>
              <div className="mt-2 text-white/90 italic">"{ans}"</div>
            </div>
          );
        })}
      </div>
      <div className="text-center pt-2">
        <button
          className="btn-primary"
          onClick={() => getSocket().emit("end_game", { code: room.code })}
        >
          End game
        </button>
      </div>
    </section>
  );
}
