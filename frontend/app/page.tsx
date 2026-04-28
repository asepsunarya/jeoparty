"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import Link from "next/link";
import { emit } from "@/lib/socket";
import { useGame } from "@/store/gameStore";
import { makeSampleBoard } from "@/lib/sample-board";
import toast from "react-hot-toast";
import type { Player, RoomPublic } from "@jeoparty/shared";

export default function HomePage() {
  const router = useRouter();
  const [nickname, setNickname] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const setInitial = useGame((s) => s.setInitial);

  async function handleJoin() {
    if (!nickname.trim() || !code.trim()) {
      toast.error("Enter both nickname and code");
      return;
    }
    setBusy(true);
    try {
      const res = await emit<{
        room: RoomPublic;
        you: Player;
        role: "host" | "player";
      }>("join_room", {
        nickname: nickname.trim(),
        code: code.trim().toUpperCase(),
      });
      setInitial(res);
      router.push(`/play/${res.room.code}`);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function handleHost() {
    if (!nickname.trim()) {
      toast.error("Enter a nickname first");
      return;
    }
    setBusy(true);
    try {
      const sample = makeSampleBoard();
      const res = await emit<{
        code: string;
        room: RoomPublic;
        hostToken: string;
      }>("create_room", {
        nickname: nickname.trim(),
        board: sample,
      });
      const you = res.room.players.find((p) => p.id === res.room.hostId)!;
      setInitial({
        room: res.room,
        you,
        role: "host",
        hostToken: res.hostToken,
      });
      router.push(`/host/${res.code}`);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="min-h-screen flex flex-col items-center justify-center px-6 py-10">
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="text-center mb-10"
      >
        <h1 className="font-display text-7xl md:text-9xl text-jeopardy-gold drop-shadow-[0_6px_0_rgba(0,0,0,0.4)]">
          JEOPARTY
        </h1>
        <p className="mt-3 text-white/80 text-lg md:text-xl">
          A real-time Jeopardy party game. Host a room, share the code, play.
        </p>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ delay: 0.15, duration: 0.35 }}
        className="w-full max-w-md card space-y-4"
      >
        <label className="block">
          <span className="text-sm text-white/70">Your nickname</span>
          <input
            value={nickname}
            onChange={(e) => setNickname(e.target.value)}
            maxLength={24}
            className="w-full mt-1 text-lg"
            placeholder="e.g. Alex"
          />
        </label>

        <div className="flex gap-2">
          <input
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            maxLength={6}
            className="w-36 text-center tracking-[0.3em] font-bold text-xl"
            placeholder="CODE"
          />
          <button
            onClick={handleJoin}
            disabled={busy}
            className="btn-primary flex-1"
          >
            Join game
          </button>
        </div>

        <div className="relative flex items-center">
          <div className="flex-1 border-t border-white/10" />
          <span className="mx-3 text-white/40 text-xs uppercase">or</span>
          <div className="flex-1 border-t border-white/10" />
        </div>

        <button
          onClick={handleHost}
          disabled={busy}
          className="btn-ghost w-full text-lg"
        >
          Host a new game
        </button>

        <Link
          href="/builder"
          className="block text-center text-sm text-white/60 hover:text-white underline underline-offset-2"
        >
          Build / edit your own board →
        </Link>
      </motion.div>

      <p className="mt-10 text-white/40 text-xs">
        No sign-up. No ads. Just trivia.
      </p>
    </main>
  );
}
