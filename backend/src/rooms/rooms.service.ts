import { Injectable, Logger, NotFoundException } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { Model } from "mongoose";
import { randomUUID } from "crypto";
import {
  AVATAR_COLORS,
  DEFAULT_SETTINGS,
  GameBoard,
  Player,
  RoomPublic,
  RoomSettings,
  TileState,
} from "@jeoparty/shared";
import { Room, RoomDocument } from "./schemas/room.schema";
import { generateRoomCode } from "../common/room-code";

/**
 * Thin, pure-ish domain service. All mutations go through here so the
 * gateway can stay focused on socket plumbing.
 */
@Injectable()
export class RoomsService {
  private readonly log = new Logger(RoomsService.name);

  constructor(
    @InjectModel(Room.name) private readonly roomModel: Model<RoomDocument>,
  ) {}

  /* --------------------------- lifecycle --------------------------- */

  async createRoom(opts: {
    hostSocketId: string;
    hostName: string;
    board?: GameBoard;
    settings?: Partial<RoomSettings>;
  }): Promise<{ room: RoomDocument; hostToken: string }> {
    const code = await this.generateUniqueCode();
    const hostToken = randomUUID();
    const settings: RoomSettings = { ...DEFAULT_SETTINGS, ...opts.settings };
    const board = opts.board ?? null;
    const tiles = board ? this.buildTiles(board, settings.dailyDoubleCount) : [];

    const host: Player = {
      id: opts.hostSocketId,
      nickname: opts.hostName || "Host",
      score: 0,
      connected: true,
      avatarColor: pickColor(0),
      joinedAt: Date.now(),
    };

    const room = await this.roomModel.create({
      code,
      hostId: opts.hostSocketId,
      hostName: host.nickname,
      hostToken,
      phase: "lobby",
      board,
      tiles,
      players: [host],
      activeQuestion: null,
      settings,
    });

    this.log.log(`Room ${code} created by ${host.nickname}`);
    return { room, hostToken };
  }

  async getRoom(code: string): Promise<RoomDocument> {
    const room = await this.roomModel.findOne({ code: code.toUpperCase() });
    if (!room) throw new NotFoundException(`Room ${code} not found`);
    return room;
  }

  async findRoom(code: string): Promise<RoomDocument | null> {
    return this.roomModel.findOne({ code: code.toUpperCase() });
  }

  async save(room: RoomDocument) {
    return room.save();
  }

  /* ------------------------------ players -------------------------- */

  async addPlayer(
    code: string,
    socketId: string,
    nickname: string,
  ): Promise<{ room: RoomDocument; player: Player }> {
    const room = await this.getRoom(code);

    // Case-insensitive duplicate nickname guard
    const clean = nickname.trim().slice(0, 24);
    if (!clean) throw new Error("Nickname required");
    const exists = room.players.find(
      (p) => p.nickname.toLowerCase() === clean.toLowerCase() && p.connected,
    );
    if (exists) throw new Error("That nickname is taken in this room");
    if (room.players.length >= 50) throw new Error("Room is full");

    const player: Player = {
      id: socketId,
      nickname: clean,
      score: 0,
      connected: true,
      avatarColor: pickColor(room.players.length),
      joinedAt: Date.now(),
    };
    room.players.push(player);
    room.markModified("players");
    await room.save();
    return { room, player };
  }

  async reconnectHost(
    code: string,
    socketId: string,
    hostToken: string,
  ): Promise<RoomDocument> {
    const room = await this.getRoom(code);
    if (room.hostToken !== hostToken) throw new Error("Invalid host token");
    const oldId = room.hostId;
    room.hostId = socketId;
    // Update the host entry in players[] so the UI reflects the new socket id.
    const host = room.players.find((p) => p.id === oldId);
    if (host) {
      host.id = socketId;
      host.connected = true;
    }
    // Keep controlPlayerId stable if it referenced the old host
    if (room.controlPlayerId === oldId) room.controlPlayerId = socketId;
    room.markModified("players");
    await room.save();
    return room;
  }

  async markDisconnected(socketId: string): Promise<RoomDocument[]> {
    // Atomic update avoids load-modify-save races with reconnectHost /
    // addPlayer that caused Mongoose VersionError on host refresh.
    // We also skip if the player is the current host (their id has already
    // been swapped out during reconnect in reconnectHost).
    await this.roomModel.updateMany(
      { "players.id": socketId },
      { $set: { "players.$[elem].connected": false } },
      { arrayFilters: [{ "elem.id": socketId }] },
    );
    return this.roomModel.find({ "players.id": socketId });
  }

  async removePlayer(code: string, socketId: string) {
    const room = await this.getRoom(code);
    room.players = room.players.filter((p) => p.id !== socketId);
    room.markModified("players");
    await room.save();
    return room;
  }

  /* ------------------------------ board ---------------------------- */

  async setBoard(code: string, board: GameBoard): Promise<RoomDocument> {
    const room = await this.getRoom(code);
    if (room.phase !== "lobby") throw new Error("Cannot change board mid-game");
    room.board = board;
    room.tiles = this.buildTiles(board, room.settings.dailyDoubleCount);
    room.markModified("board");
    room.markModified("tiles");
    await room.save();
    return room;
  }

  async updateSettings(
    code: string,
    partial: Partial<RoomSettings>,
  ): Promise<RoomDocument> {
    const room = await this.getRoom(code);
    room.settings = { ...room.settings, ...partial };
    if (room.board && room.phase === "lobby") {
      room.tiles = this.buildTiles(room.board, room.settings.dailyDoubleCount);
    }
    await room.save();
    return room;
  }

  buildTiles(board: GameBoard, dailyDoubleCount: number): TileState[] {
    const tiles: TileState[] = [];
    for (const cat of board.categories) {
      for (const q of cat.questions) {
        tiles.push({
          categoryId: cat.id,
          questionId: q.id,
          status: "available",
        });
      }
    }
    // Randomly mark N tiles as Daily Doubles by flipping the flag on the
    // underlying question (never exposed to players on the board).
    const pool = [...tiles];
    for (let i = 0; i < Math.min(dailyDoubleCount, pool.length); i++) {
      const idx = Math.floor(Math.random() * pool.length);
      const [picked] = pool.splice(idx, 1);
      const cat = board.categories.find((c) => c.id === picked.categoryId);
      const q = cat?.questions.find((q) => q.id === picked.questionId);
      if (q) q.isDailyDouble = true;
    }
    return tiles;
  }

  /* ----------------------------- gameplay -------------------------- */

  async startGame(code: string): Promise<RoomDocument> {
    const room = await this.getRoom(code);
    if (!room.board) throw new Error("No board set");
    room.phase = "board";
    // First pick goes to a random player (or host if none)
    const players = room.players.filter((p) => p.id !== room.hostId);
    room.controlPlayerId =
      players[Math.floor(Math.random() * players.length)]?.id ?? room.hostId;
    await room.save();
    return room;
  }

  async selectQuestion(
    code: string,
    categoryId: string,
    questionId: string,
  ): Promise<RoomDocument> {
    const room = await this.getRoom(code);
    const tile = room.tiles.find(
      (t) => t.categoryId === categoryId && t.questionId === questionId,
    );
    if (!tile) throw new Error("Tile not found");
    if (tile.status !== "available") throw new Error("Tile already used");

    const cat = room.board?.categories.find((c) => c.id === categoryId);
    const q = cat?.questions.find((q) => q.id === questionId);
    if (!q) throw new Error("Question missing");

    tile.status = "active";
    room.markModified("tiles");

    room.activeQuestion = {
      categoryId,
      questionId,
      isDailyDouble: !!q.isDailyDouble,
      answerRevealed: false,
    };
    room.phase = "question";
    await room.save();
    return room;
  }

  async setBuzzed(code: string, playerId: string): Promise<RoomDocument> {
    const room = await this.getRoom(code);
    if (!room.activeQuestion) throw new Error("No active question");
    if (room.activeQuestion.buzzedPlayerId) throw new Error("Too late");
    const p = room.players.find((pl) => pl.id === playerId);
    if (!p || p.id === room.hostId) throw new Error("Not a player");
    room.activeQuestion.buzzedPlayerId = playerId;
    room.phase = "buzzed";
    // activeQuestion is a Mixed type in Mongoose — mutations on sub-fields
    // aren't tracked automatically, so we have to tell Mongoose it changed.
    room.markModified("activeQuestion");
    await room.save();
    return room;
  }

  async clearBuzz(code: string): Promise<RoomDocument> {
    const room = await this.getRoom(code);
    if (room.activeQuestion) {
      room.activeQuestion.buzzedPlayerId = undefined;
      room.markModified("activeQuestion");
    }
    room.phase = "question";
    await room.save();
    return room;
  }

  async judgeAnswer(
    code: string,
    correct: boolean,
  ): Promise<{ room: RoomDocument; delta: number; playerId?: string }> {
    const room = await this.getRoom(code);
    if (!room.activeQuestion) throw new Error("No active question");
    const pid = room.activeQuestion.buzzedPlayerId;
    const q = this.findQuestion(room);
    if (!q) throw new Error("Question missing");
    const amount = room.activeQuestion.isDailyDouble
      ? room.activeQuestion.wager ?? q.value
      : q.value;

    let delta = 0;
    if (pid) {
      const p = room.players.find((pl) => pl.id === pid);
      if (p) {
        delta = correct ? amount : -amount;
        const newScore = p.score + delta;
        p.score = room.settings.allowNegativeScores
          ? newScore
          : Math.max(0, newScore);
        room.markModified("players");
      }
    }

    if (correct) {
      // Tile is done. Control passes to the player who got it right.
      this.markTileAnswered(room);
      if (pid) room.controlPlayerId = pid;
      room.activeQuestion.answerRevealed = true;
      room.phase = "reveal";
    } else {
      // Clear the buzz; someone else can try. If DD, end the tile.
      if (room.activeQuestion.isDailyDouble) {
        this.markTileAnswered(room);
        room.activeQuestion.answerRevealed = true;
        room.phase = "reveal";
      } else {
        room.activeQuestion.buzzedPlayerId = undefined;
        room.phase = "question";
      }
    }

    room.markModified("activeQuestion");
    await room.save();
    return { room, delta, playerId: pid };
  }

  async revealAnswer(code: string): Promise<RoomDocument> {
    const room = await this.getRoom(code);
    if (!room.activeQuestion) throw new Error("No active question");
    room.activeQuestion.answerRevealed = true;
    room.markModified("activeQuestion");
    // If it was never answered correctly, mark tile done.
    this.markTileAnswered(room);
    room.phase = "reveal";
    await room.save();
    return room;
  }

  async nextTurn(
    code: string,
    controlPlayerId?: string,
  ): Promise<RoomDocument> {
    const room = await this.getRoom(code);
    room.activeQuestion = null;
    if (controlPlayerId) room.controlPlayerId = controlPlayerId;
    // Detect game end (all tiles used)
    const remaining = room.tiles.filter((t) => t.status !== "answered");
    if (remaining.length === 0) {
      room.phase = room.board?.final ? "final-wager" : "ended";
    } else {
      room.phase = "board";
    }
    await room.save();
    return room;
  }

  async updateScore(
    code: string,
    playerId: string,
    delta: number,
  ): Promise<{ room: RoomDocument; score: number }> {
    const room = await this.getRoom(code);
    const p = room.players.find((pl) => pl.id === playerId);
    if (!p) throw new Error("Player missing");
    p.score = room.settings.allowNegativeScores
      ? p.score + delta
      : Math.max(0, p.score + delta);
    room.markModified("players");
    await room.save();
    return { room, score: p.score };
  }

  async setWager(
    code: string,
    playerId: string,
    amount: number,
  ): Promise<RoomDocument> {
    const room = await this.getRoom(code);
    if (room.phase === "final-wager") {
      if (amount < 0) throw new Error("Wager must be >= 0");
      const p = room.players.find((pl) => pl.id === playerId);
      if (!p) throw new Error("Unknown player");
      if (amount > Math.max(p.score, 0)) throw new Error("Wager too high");
      room.finalWagers = { ...(room.finalWagers ?? {}), [playerId]: amount };
      room.markModified("finalWagers");
      // Once everyone has wagered, advance.
      const players = room.players.filter((pl) => pl.id !== room.hostId);
      if (players.every((pl) => room.finalWagers?.[pl.id] !== undefined)) {
        room.phase = "final-question";
      }
    } else if (room.activeQuestion?.isDailyDouble && room.phase === "question") {
      if (amount < 5) throw new Error("Minimum wager is 5");
      const p = room.players.find((pl) => pl.id === playerId);
      if (!p) throw new Error("Unknown player");
      const q = this.findQuestion(room);
      const max = Math.max(p.score, q?.value ?? 1000);
      if (amount > max) throw new Error(`Max wager is ${max}`);
      room.activeQuestion.wager = amount;
      room.activeQuestion.buzzedPlayerId = playerId;
      room.markModified("activeQuestion");
      room.phase = "buzzed";
    } else {
      throw new Error("Cannot wager right now");
    }
    await room.save();
    return room;
  }

  async submitFinalAnswer(
    code: string,
    playerId: string,
    answer: string,
  ): Promise<RoomDocument> {
    const room = await this.getRoom(code);
    if (room.phase !== "final-question") throw new Error("Not in Final round");
    room.finalAnswers = {
      ...(room.finalAnswers ?? {}),
      [playerId]: answer.slice(0, 500),
    };
    room.markModified("finalAnswers");
    const players = room.players.filter((pl) => pl.id !== room.hostId);
    if (players.every((pl) => room.finalAnswers?.[pl.id] !== undefined)) {
      room.phase = "final-reveal";
    }
    await room.save();
    return room;
  }

  async endGame(code: string): Promise<RoomDocument> {
    const room = await this.getRoom(code);
    room.phase = "ended";
    await room.save();
    return room;
  }

  /* ------------------------------ utils ---------------------------- */

  toPublic(room: RoomDocument): RoomPublic {
    return {
      code: room.code,
      phase: room.phase,
      hostId: room.hostId,
      hostName: room.hostName,
      players: room.players,
      board: room.board ?? null,
      tiles: room.tiles,
      activeQuestion: room.activeQuestion ?? null,
      controlPlayerId: room.controlPlayerId,
      settings: room.settings,
      finalWagers: room.finalWagers,
      finalAnswers: room.finalAnswers,
      createdAt: room.createdAt,
    };
  }

  /** Redacts the answer text for the public view while a question is live. */
  publicBoard(room: RoomDocument): GameBoard | null {
    if (!room.board) return null;
    return {
      ...room.board,
      categories: room.board.categories.map((c) => ({
        ...c,
        questions: c.questions.map((q) => {
          const tile = room.tiles.find(
            (t) => t.categoryId === c.id && t.questionId === q.id,
          );
          const active =
            room.activeQuestion?.categoryId === c.id &&
            room.activeQuestion.questionId === q.id;
          const reveal = active && room.activeQuestion?.answerRevealed;
          // Hide answer + answerMedia + Daily Double flag until revealed
          return {
            ...q,
            answer: reveal ? q.answer : "",
            answerMedia: reveal ? q.answerMedia : undefined,
            isDailyDouble:
              tile?.status === "active" ? q.isDailyDouble : undefined,
          };
        }),
      })),
    };
  }

  private findQuestion(room: RoomDocument) {
    if (!room.activeQuestion || !room.board) return null;
    const cat = room.board.categories.find(
      (c) => c.id === room.activeQuestion!.categoryId,
    );
    return cat?.questions.find(
      (q) => q.id === room.activeQuestion!.questionId,
    );
  }

  private markTileAnswered(room: RoomDocument) {
    if (!room.activeQuestion) return;
    const tile = room.tiles.find(
      (t) =>
        t.categoryId === room.activeQuestion!.categoryId &&
        t.questionId === room.activeQuestion!.questionId,
    );
    if (tile) tile.status = "answered";
    room.markModified("tiles");
  }

  private async generateUniqueCode(): Promise<string> {
    for (let i = 0; i < 10; i++) {
      const code = generateRoomCode();
      const exists = await this.roomModel.exists({ code });
      if (!exists) return code;
    }
    throw new Error("Failed to generate unique room code");
  }
}

function pickColor(index: number) {
  return AVATAR_COLORS[index % AVATAR_COLORS.length];
}
