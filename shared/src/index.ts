/**
 * Shared types and real-time event contracts used by both the Next.js
 * frontend and the NestJS backend.
 *
 * Keeping these in a single file means both sides are type-checked against
 * the same shape; any drift becomes a compile-time error.
 */

export type Role = "host" | "player";

export type MediaKind = "text" | "image" | "video" | "audio" | "youtube";

export interface Media {
  kind: MediaKind;
  /** Public URL for image/video/audio or the YouTube video id for youtube. */
  url?: string;
  youtubeId?: string;
  /** Optional caption or markdown text to display alongside media. */
  caption?: string;
}

export interface Question {
  id: string;
  prompt: string;           // markdown supported
  answer: string;           // markdown supported
  value: number;            // point value
  /** Media shown with the prompt (the "clue"). */
  media?: Media;
  /** Media shown with the answer, revealed only after the host reveals. */
  answerMedia?: Media;
  isDailyDouble?: boolean;
}

export interface Category {
  id: string;
  title: string;
  questions: Question[];    // ordered ascending by value
}

export interface GameBoard {
  id: string;
  title: string;
  categories: Category[];
  /** Final Jeopardy (optional) */
  final?: Question;
}

export type TileStatus = "available" | "active" | "answered";

export interface TileState {
  categoryId: string;
  questionId: string;
  status: TileStatus;
  revealedToPlayers?: boolean;
}

export interface Player {
  id: string;        // socket id
  nickname: string;
  score: number;
  connected: boolean;
  avatarColor: string;
  joinedAt: number;
}

export type RoomPhase =
  | "lobby"
  | "board"
  | "question"
  | "buzzed"
  | "reveal"
  | "final-wager"
  | "final-question"
  | "final-reveal"
  | "ended";

export interface RoomPublic {
  code: string;
  phase: RoomPhase;
  hostId: string;
  hostName: string;
  players: Player[];
  board: GameBoard | null;
  tiles: TileState[];
  activeQuestion: {
    categoryId: string;
    questionId: string;
    isDailyDouble: boolean;
    wager?: number;
    buzzedPlayerId?: string;
    answerRevealed: boolean;
  } | null;
  controlPlayerId?: string; // who picks next
  settings: RoomSettings;
  finalWagers?: Record<string, number>;     // playerId -> wager
  finalAnswers?: Record<string, string>;    // playerId -> answer
  createdAt: number;
}

export interface RoomSettings {
  questionTimerSec: number;   // timer once buzzed
  buzzWindowSec: number;      // total window to buzz
  allowNegativeScores: boolean;
  dailyDoubleCount: number;   // how many tiles are DDs
  soundEnabled: boolean;
}

/* ------------------------------------------------------------------ */
/* Socket.IO events                                                   */
/* ------------------------------------------------------------------ */

/** Client -> Server */
export interface C2SEvents {
  create_room: (
    payload: { nickname: string; board?: GameBoard; settings?: Partial<RoomSettings> },
    cb: (res: Ack<{ code: string; room: RoomPublic }>) => void,
  ) => void;

  join_room: (
    payload: { code: string; nickname: string; asHost?: boolean; hostToken?: string },
    cb: (res: Ack<{ room: RoomPublic; you: Player; role: Role; hostToken?: string }>) => void,
  ) => void;

  leave_room: (payload: { code: string }) => void;

  set_board: (
    payload: { code: string; board: GameBoard },
    cb?: (res: Ack<{ room: RoomPublic }>) => void,
  ) => void;

  update_settings: (
    payload: { code: string; settings: Partial<RoomSettings> },
    cb?: (res: Ack<{ room: RoomPublic }>) => void,
  ) => void;

  start_game: (payload: { code: string }, cb?: (res: Ack) => void) => void;

  select_question: (payload: {
    code: string;
    categoryId: string;
    questionId: string;
  }) => void;

  reveal_question: (payload: { code: string }) => void;

  buzz_in: (payload: { code: string }) => void;

  submit_answer: (payload: { code: string; answer: string }) => void; // final/daily double text

  wager: (payload: { code: string; amount: number }) => void; // daily double / final wager

  judge_answer: (payload: { code: string; correct: boolean }) => void;

  reveal_answer: (payload: { code: string }) => void;

  next_turn: (payload: { code: string; controlPlayerId?: string }) => void;

  update_score: (payload: {
    code: string;
    playerId: string;
    delta: number;
  }) => void;

  start_final: (payload: { code: string }) => void;

  end_game: (payload: { code: string }) => void;
}

/** Server -> Client */
export interface S2CEvents {
  room_state: (room: RoomPublic) => void;
  player_joined: (player: Player) => void;
  player_left: (playerId: string) => void;
  phase_changed: (phase: RoomPhase) => void;
  question_selected: (q: { categoryId: string; questionId: string }) => void;
  question_revealed: (q: Question) => void;
  buzz_in: (player: Player) => void;
  buzz_closed: () => void;
  answer_revealed: (answer: string) => void;
  score_updated: (playerId: string, score: number, delta: number) => void;
  turn_changed: (playerId: string) => void;
  timer_tick: (remainingMs: number) => void;
  toast: (payload: { level: "info" | "success" | "error"; message: string }) => void;
  error: (message: string) => void;
  game_ended: (winners: Player[]) => void;
}

/** Simple Ack helper. */
export type Ack<T = undefined> =
  | { ok: true; data: T }
  | { ok: false; error: string };

/* ------------------------------------------------------------------ */
/* Helpers                                                            */
/* ------------------------------------------------------------------ */

export const DEFAULT_SETTINGS: RoomSettings = {
  questionTimerSec: 20,
  buzzWindowSec: 10,
  allowNegativeScores: true,
  dailyDoubleCount: 2,
  soundEnabled: true,
};

export const AVATAR_COLORS = [
  "#ef4444",
  "#f97316",
  "#f59e0b",
  "#eab308",
  "#84cc16",
  "#22c55e",
  "#10b981",
  "#14b8a6",
  "#06b6d4",
  "#0ea5e9",
  "#3b82f6",
  "#6366f1",
  "#8b5cf6",
  "#a855f7",
  "#d946ef",
  "#ec4899",
];
