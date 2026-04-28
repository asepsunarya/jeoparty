import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from "@nestjs/websockets";
import { Logger } from "@nestjs/common";
import { Server, Socket } from "socket.io";
import type { Ack, GameBoard, RoomSettings } from "@jeoparty/shared";
import { RoomsService } from "./rooms.service";

const CORS = process.env.CORS_ORIGIN?.split(",") ?? ["http://localhost:3000"];

/**
 * Central real-time gateway. Each room is a Socket.IO room (keyed by code)
 * so broadcasts are O(clients-in-room) instead of O(all clients).
 *
 * Buzz fairness:
 *  - We rely on the event-loop ordering at the server to break ties.
 *  - buzz_in is ignored after activeQuestion.buzzedPlayerId is set.
 */
@WebSocketGateway({
  cors: { origin: CORS, credentials: true },
  maxHttpBufferSize: 1e6,
})
export class RoomsGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer() server!: Server;
  private readonly log = new Logger(RoomsGateway.name);

  // Per-room short-lived timers (buzz window, question timer)
  private timers = new Map<string, NodeJS.Timeout[]>();

  constructor(private readonly rooms: RoomsService) {}

  handleConnection(socket: Socket) {
    this.log.debug(`socket connected ${socket.id}`);
  }

  async handleDisconnect(socket: Socket) {
    const rooms = await this.rooms.markDisconnected(socket.id);
    for (const room of rooms) {
      this.broadcastState(room.code);
    }
  }

  /* --------------------------- room lifecycle ---------------------- */

  @SubscribeMessage("create_room")
  async onCreateRoom(
    @ConnectedSocket() socket: Socket,
    @MessageBody()
    payload: { nickname: string; board?: GameBoard; settings?: Partial<RoomSettings> },
  ): Promise<Ack<{ code: string; room: unknown; hostToken: string }>> {
    try {
      const { room, hostToken } = await this.rooms.createRoom({
        hostSocketId: socket.id,
        hostName: payload.nickname,
        board: payload.board,
        settings: payload.settings,
      });
      socket.join(room.code);
      socket.data.role = "host";
      socket.data.code = room.code;
      socket.data.hostToken = hostToken;
      return {
        ok: true,
        data: {
          code: room.code,
          room: this.rooms.toPublic(room),
          hostToken,
        },
      };
    } catch (e: any) {
      return { ok: false, error: e.message ?? "create_room failed" };
    }
  }

  @SubscribeMessage("join_room")
  async onJoin(
    @ConnectedSocket() socket: Socket,
    @MessageBody()
    payload: {
      code: string;
      nickname: string;
      asHost?: boolean;
      hostToken?: string;
    },
  ): Promise<Ack<any>> {
    try {
      const code = payload.code.toUpperCase();
      let room;
      let role: "host" | "player";
      let hostTokenOut: string | undefined;
      if (payload.asHost && payload.hostToken) {
        room = await this.rooms.reconnectHost(
          code,
          socket.id,
          payload.hostToken,
        );
        role = "host";
        hostTokenOut = payload.hostToken;
      } else {
        const res = await this.rooms.addPlayer(
          code,
          socket.id,
          payload.nickname,
        );
        room = res.room;
        role = "player";
      }
      socket.join(code);
      socket.data.role = role;
      socket.data.code = code;
      if (hostTokenOut) socket.data.hostToken = hostTokenOut;

      const you = room.players.find((p) => p.id === socket.id);
      const publicRoom = this.rooms.toPublic(room);
      // Players only see redacted board
      const redacted =
        role === "host"
          ? publicRoom
          : { ...publicRoom, board: this.rooms.publicBoard(room) };
      this.server.to(code).emit("room_state", redacted);
      return {
        ok: true,
        data: { room: redacted, you, role, hostToken: hostTokenOut },
      };
    } catch (e: any) {
      return { ok: false, error: e.message ?? "join_room failed" };
    }
  }

  @SubscribeMessage("leave_room")
  async onLeave(
    @ConnectedSocket() socket: Socket,
    @MessageBody() payload: { code: string },
  ) {
    const code = payload.code.toUpperCase();
    try {
      await this.rooms.removePlayer(code, socket.id);
      socket.leave(code);
      this.broadcastState(code);
    } catch {
      /* ignore */
    }
  }

  /* ------------------------------- host ---------------------------- */

  @SubscribeMessage("set_board")
  async onSetBoard(
    @ConnectedSocket() socket: Socket,
    @MessageBody() payload: { code: string; board: GameBoard },
  ): Promise<Ack<any>> {
    if (!(await this.requireHost(socket, payload.code)))
      return { ok: false, error: "Only the host can set the board" };
    try {
      const room = await this.rooms.setBoard(payload.code, payload.board);
      this.broadcastState(room.code);
      return { ok: true, data: { room: this.rooms.toPublic(room) } };
    } catch (e: any) {
      return { ok: false, error: e.message };
    }
  }

  @SubscribeMessage("update_settings")
  async onUpdateSettings(
    @ConnectedSocket() socket: Socket,
    @MessageBody() payload: { code: string; settings: Partial<RoomSettings> },
  ): Promise<Ack<any>> {
    if (!(await this.requireHost(socket, payload.code)))
      return { ok: false, error: "Host only" };
    const room = await this.rooms.updateSettings(payload.code, payload.settings);
    this.broadcastState(room.code);
    return { ok: true, data: { room: this.rooms.toPublic(room) } };
  }

  @SubscribeMessage("start_game")
  async onStart(
    @ConnectedSocket() socket: Socket,
    @MessageBody() payload: { code: string },
  ): Promise<Ack> {
    if (!(await this.requireHost(socket, payload.code)))
      return { ok: false, error: "Host only" };
    try {
      const room = await this.rooms.startGame(payload.code);
      this.broadcastState(room.code);
      this.server.to(room.code).emit("toast", {
        level: "success",
        message: "Let's play!",
      });
      return { ok: true, data: undefined };
    } catch (e: any) {
      return { ok: false, error: e.message };
    }
  }

  @SubscribeMessage("select_question")
  async onSelect(
    @ConnectedSocket() socket: Socket,
    @MessageBody()
    payload: { code: string; categoryId: string; questionId: string },
  ) {
    if (!(await this.requireHost(socket, payload.code))) return;
    try {
      const room = await this.rooms.selectQuestion(
        payload.code,
        payload.categoryId,
        payload.questionId,
      );
      this.server
        .to(room.code)
        .emit("question_selected", {
          categoryId: payload.categoryId,
          questionId: payload.questionId,
        });
      this.broadcastState(room.code);
    } catch (e: any) {
      socket.emit("error", e.message);
    }
  }

  @SubscribeMessage("reveal_question")
  async onReveal(
    @ConnectedSocket() socket: Socket,
    @MessageBody() payload: { code: string },
  ) {
    if (!(await this.requireHost(socket, payload.code))) return;
    const room = await this.rooms.getRoom(payload.code);
    if (!room.activeQuestion || !room.board) return;
    const cat = room.board.categories.find(
      (c) => c.id === room.activeQuestion!.categoryId,
    );
    const q = cat?.questions.find(
      (q) => q.id === room.activeQuestion!.questionId,
    );
    if (q) {
      this.server.to(room.code).emit("question_revealed", q);
      this.startBuzzWindow(room.code);
    }
  }

  @SubscribeMessage("reveal_answer")
  async onRevealAnswer(
    @ConnectedSocket() socket: Socket,
    @MessageBody() payload: { code: string },
  ) {
    if (!(await this.requireHost(socket, payload.code))) return;
    // Host took manual control — stop any pending auto-reveal / auto-judge.
    this.clearTimers(payload.code);
    const room = await this.rooms.revealAnswer(payload.code);
    const q = room.board?.categories
      .find((c) => c.id === room.activeQuestion?.categoryId)
      ?.questions.find((q) => q.id === room.activeQuestion?.questionId);
    if (q) this.server.to(room.code).emit("answer_revealed", q.answer);
    this.broadcastState(room.code);
  }

  @SubscribeMessage("judge_answer")
  async onJudge(
    @ConnectedSocket() socket: Socket,
    @MessageBody() payload: { code: string; correct: boolean },
  ) {
    if (!(await this.requireHost(socket, payload.code))) return;
    // Host resolved it — cancel any timer that might also try to judge.
    this.clearTimers(payload.code);
    try {
      const { room, delta, playerId } = await this.rooms.judgeAnswer(
        payload.code,
        payload.correct,
      );
      if (playerId) {
        const p = room.players.find((pl) => pl.id === playerId);
        if (p)
          this.server
            .to(room.code)
            .emit("score_updated", playerId, p.score, delta);
      }
      // If wrong on a regular tile, also broadcast the answer so players
      // can see why it was wrong, then re-open buzzers for remaining players.
      if (!payload.correct && !room.activeQuestion?.isDailyDouble) {
        this.broadcastState(room.code);
        this.startBuzzWindow(room.code);
      } else {
        // Correct, or wrong-DD: question is fully resolved. Broadcast the
        // answer so the UI can show it alongside the "Next" button.
        const q = room.board?.categories
          .find((c) => c.id === room.activeQuestion?.categoryId)
          ?.questions.find((q) => q.id === room.activeQuestion?.questionId);
        if (q) this.server.to(room.code).emit("answer_revealed", q.answer);
        this.broadcastState(room.code);
      }
    } catch (e: any) {
      socket.emit("error", e.message);
    }
  }

  @SubscribeMessage("update_score")
  async onUpdateScore(
    @ConnectedSocket() socket: Socket,
    @MessageBody() payload: { code: string; playerId: string; delta: number },
  ) {
    if (!(await this.requireHost(socket, payload.code))) return;
    const { room, score } = await this.rooms.updateScore(
      payload.code,
      payload.playerId,
      payload.delta,
    );
    this.server
      .to(room.code)
      .emit("score_updated", payload.playerId, score, payload.delta);
    this.broadcastState(room.code);
  }

  @SubscribeMessage("next_turn")
  async onNextTurn(
    @ConnectedSocket() socket: Socket,
    @MessageBody() payload: { code: string; controlPlayerId?: string },
  ) {
    if (!(await this.requireHost(socket, payload.code))) return;
    const room = await this.rooms.nextTurn(
      payload.code,
      payload.controlPlayerId,
    );
    this.clearTimers(room.code);
    if (room.controlPlayerId)
      this.server.to(room.code).emit("turn_changed", room.controlPlayerId);
    if (room.phase === "ended") {
      const winners = [...room.players]
        .filter((p) => p.id !== room.hostId)
        .sort((a, b) => b.score - a.score);
      this.server.to(room.code).emit("game_ended", winners);
    }
    this.broadcastState(room.code);
  }

  @SubscribeMessage("start_final")
  async onStartFinal(
    @ConnectedSocket() socket: Socket,
    @MessageBody() payload: { code: string },
  ) {
    if (!(await this.requireHost(socket, payload.code))) return;
    const room = await this.rooms.getRoom(payload.code);
    if (!room.board?.final) {
      socket.emit("error", "No Final Jeopardy question set");
      return;
    }
    room.phase = "final-wager";
    room.finalWagers = {};
    room.finalAnswers = {};
    await this.rooms.save(room);
    this.broadcastState(room.code);
  }

  @SubscribeMessage("end_game")
  async onEnd(
    @ConnectedSocket() socket: Socket,
    @MessageBody() payload: { code: string },
  ) {
    if (!(await this.requireHost(socket, payload.code))) return;
    const room = await this.rooms.endGame(payload.code);
    const winners = [...room.players]
      .filter((p) => p.id !== room.hostId)
      .sort((a, b) => b.score - a.score);
    this.server.to(room.code).emit("game_ended", winners);
    this.broadcastState(room.code);
  }

  /* ----------------------------- players --------------------------- */

  @SubscribeMessage("buzz_in")
  async onBuzz(
    @ConnectedSocket() socket: Socket,
    @MessageBody() payload: { code: string },
  ) {
    try {
      const room = await this.rooms.setBuzzed(payload.code, socket.id);
      const player = room.players.find((p) => p.id === socket.id);
      if (player) {
        this.server.to(room.code).emit("buzz_in", player);
        this.server.to(room.code).emit("buzz_closed");
      }
      this.broadcastState(room.code);
      this.startAnswerTimer(room.code);
    } catch (e: any) {
      socket.emit("error", e.message);
    }
  }

  @SubscribeMessage("wager")
  async onWager(
    @ConnectedSocket() socket: Socket,
    @MessageBody() payload: { code: string; amount: number },
  ) {
    try {
      const room = await this.rooms.setWager(
        payload.code,
        socket.id,
        payload.amount,
      );
      this.broadcastState(room.code);
    } catch (e: any) {
      socket.emit("error", e.message);
    }
  }

  @SubscribeMessage("submit_answer")
  async onSubmitAnswer(
    @ConnectedSocket() socket: Socket,
    @MessageBody() payload: { code: string; answer: string },
  ) {
    try {
      const room = await this.rooms.submitFinalAnswer(
        payload.code,
        socket.id,
        payload.answer,
      );
      this.broadcastState(room.code);
    } catch (e: any) {
      socket.emit("error", e.message);
    }
  }

  /* ------------------------------ helpers -------------------------- */

  private async requireHost(socket: Socket, code: string): Promise<boolean> {
    const room = await this.rooms.findRoom(code);
    if (!room) return false;
    return room.hostId === socket.id;
  }

  private async broadcastState(code: string) {
    const room = await this.rooms.findRoom(code);
    if (!room) return;
    const hostView = this.rooms.toPublic(room);
    const playerView = { ...hostView, board: this.rooms.publicBoard(room) };

    // Emit host-specific state only to the host's socket; players get redacted.
    const sockets = await this.server.in(code).fetchSockets();
    for (const s of sockets) {
      if (s.id === room.hostId) s.emit("room_state", hostView);
      else s.emit("room_state", playerView);
    }
  }

  private clearTimers(code: string) {
    const arr = this.timers.get(code);
    if (arr) {
      arr.forEach((t) => clearTimeout(t));
      this.timers.delete(code);
    }
  }

  private pushTimer(code: string, t: NodeJS.Timeout) {
    const arr = this.timers.get(code) ?? [];
    arr.push(t);
    this.timers.set(code, arr);
  }

  /** Starts the window in which players can buzz in. */
  private async startBuzzWindow(code: string) {
    this.clearTimers(code);
    const room = await this.rooms.findRoom(code);
    if (!room) return;
    const duration = room.settings.buzzWindowSec * 1000;
    const end = Date.now() + duration;

    const interval = setInterval(() => {
      const remaining = end - Date.now();
      if (remaining <= 0) {
        clearInterval(interval);
        return;
      }
      this.server.to(code).emit("timer_tick", remaining);
    }, 250);

    const timeout = setTimeout(async () => {
      clearInterval(interval);
      const latest = await this.rooms.findRoom(code);
      if (!latest || !latest.activeQuestion) return;
      // Only auto-reveal if nothing changed since this timer started — i.e.
      // we're still in the open-buzz window for the same question and nobody
      // has buzzed / answered in the meantime.
      if (
        latest.phase !== "question" ||
        latest.activeQuestion.buzzedPlayerId ||
        latest.activeQuestion.answerRevealed
      ) {
        return;
      }
      const updated = await this.rooms.revealAnswer(code);
      const q = updated.board?.categories
        .find((c) => c.id === updated.activeQuestion?.categoryId)
        ?.questions.find((q) => q.id === updated.activeQuestion?.questionId);
      if (q) this.server.to(code).emit("answer_revealed", q.answer);
      this.server.to(code).emit("buzz_closed");
      this.broadcastState(code);
    }, duration);

    this.pushTimer(code, interval as unknown as NodeJS.Timeout);
    this.pushTimer(code, timeout);
  }

  private async startAnswerTimer(code: string) {
    this.clearTimers(code);
    const room = await this.rooms.findRoom(code);
    if (!room) return;
    const duration = room.settings.questionTimerSec * 1000;
    const end = Date.now() + duration;
    // Snapshot which player's attempt this timer is bound to, so a host who
    // manually judges (or a subsequent buzz after a wrong answer) doesn't get
    // double-judged by a stale timer firing.
    const expectedBuzzer = room.activeQuestion?.buzzedPlayerId;
    const expectedQuestionId = room.activeQuestion?.questionId;

    const interval = setInterval(() => {
      const remaining = end - Date.now();
      if (remaining <= 0) {
        clearInterval(interval);
        return;
      }
      this.server.to(code).emit("timer_tick", remaining);
    }, 250);

    const timeout = setTimeout(async () => {
      clearInterval(interval);
      const latest = await this.rooms.findRoom(code);
      if (!latest || !latest.activeQuestion) return;
      // Bail if host already resolved it or the buzzed player changed.
      if (
        latest.phase !== "buzzed" ||
        latest.activeQuestion.answerRevealed ||
        latest.activeQuestion.questionId !== expectedQuestionId ||
        latest.activeQuestion.buzzedPlayerId !== expectedBuzzer
      ) {
        return;
      }
      try {
        const { room: updated, delta, playerId } =
          await this.rooms.judgeAnswer(code, false);
        if (playerId) {
          const p = updated.players.find((pl) => pl.id === playerId);
          if (p)
            this.server
              .to(code)
              .emit("score_updated", playerId, p.score, delta);
        }
        this.broadcastState(code);
        if (updated.phase === "question") this.startBuzzWindow(code);
      } catch {
        /* ignore */
      }
    }, duration);

    this.pushTimer(code, interval as unknown as NodeJS.Timeout);
    this.pushTimer(code, timeout);
  }
}
