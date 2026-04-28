"use client";

import { create } from "zustand";
import type { Player, Question, Role, RoomPublic } from "@jeoparty/shared";
import { getSocket } from "@/lib/socket";
import toast from "react-hot-toast";

interface GameState {
  role: Role | null;
  code: string | null;
  you: Player | null;
  room: RoomPublic | null;
  hostToken: string | null;
  currentQuestion: Question | null;
  timerRemainingMs: number | null;
  winners: Player[] | null;

  setInitial: (payload: {
    room: RoomPublic;
    you: Player;
    role: Role;
    hostToken?: string;
  }) => void;
  reset: () => void;
  attachListeners: () => () => void;
}

export const useGame = create<GameState>((set, get) => ({
  role: null,
  code: null,
  you: null,
  room: null,
  hostToken: null,
  currentQuestion: null,
  timerRemainingMs: null,
  winners: null,

  setInitial({ room, you, role, hostToken }) {
    set({
      room,
      you,
      role,
      code: room.code,
      hostToken: hostToken ?? get().hostToken,
      winners: null,
    });
    if (hostToken) {
      try {
        localStorage.setItem(`jp:host:${room.code}`, hostToken);
      } catch {
        /* ignore */
      }
    }
  },

  reset() {
    set({
      role: null,
      code: null,
      you: null,
      room: null,
      hostToken: null,
      currentQuestion: null,
      timerRemainingMs: null,
      winners: null,
    });
  },

  attachListeners() {
    const s = getSocket();
    const onRoom = (room: RoomPublic) => {
      const prev = get().room;
      set({ room });
      // When active question cleared, clear revealed question locally too
      if (!room.activeQuestion) set({ currentQuestion: null, timerRemainingMs: null });
      // Surface phase transitions with a tiny toast
      if (prev && prev.phase !== room.phase && room.phase === "buzzed") {
        // handled by buzz_in event
      }
    };
    const onQuestionRevealed = (q: Question) => {
      set({ currentQuestion: q });
    };
    const onAnswerRevealed = (_ans: string) => {
      /* room_state already carries answerRevealed; nothing to do */
    };
    const onBuzzIn = (p: Player) => {
      toast.success(`${p.nickname} buzzed in!`);
    };
    const onTimerTick = (ms: number) => set({ timerRemainingMs: ms });
    const onScoreUpdated = (_pid: string, _score: number, _delta: number) => {};
    const onGameEnded = (winners: Player[]) => set({ winners });
    const onToast = (p: { level: string; message: string }) => {
      if (p.level === "error") toast.error(p.message);
      else if (p.level === "success") toast.success(p.message);
      else toast(p.message);
    };
    const onError = (msg: string) => toast.error(msg);

    s.on("room_state", onRoom);
    s.on("question_revealed", onQuestionRevealed);
    s.on("answer_revealed", onAnswerRevealed);
    s.on("buzz_in", onBuzzIn);
    s.on("timer_tick", onTimerTick);
    s.on("score_updated", onScoreUpdated);
    s.on("game_ended", onGameEnded);
    s.on("toast", onToast);
    s.on("error", onError);

    return () => {
      s.off("room_state", onRoom);
      s.off("question_revealed", onQuestionRevealed);
      s.off("answer_revealed", onAnswerRevealed);
      s.off("buzz_in", onBuzzIn);
      s.off("timer_tick", onTimerTick);
      s.off("score_updated", onScoreUpdated);
      s.off("game_ended", onGameEnded);
      s.off("toast", onToast);
      s.off("error", onError);
    };
  },
}));
