import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { HydratedDocument } from "mongoose";
import type {
  GameBoard,
  Player,
  RoomPhase,
  RoomSettings,
  TileState,
} from "@jeoparty/shared";

export type RoomDocument = HydratedDocument<Room>;

/**
 * Room is the single persisted aggregate for a game. Live socket presence
 * (player connection state, current buzz) is kept in memory in the gateway
 * but serialized back to Mongo on significant state changes so reconnects
 * can rehydrate.
 */
// versionKey: false — we intentionally disable optimistic concurrency. A live
// room is a small, ephemeral aggregate mutated by many near-simultaneous
// socket events (disconnect races, host reconnect, buzz, score). A VersionError
// on any of those would crash the event; last-write-wins is fine because the
// next broadcast re-syncs clients.
@Schema({ collection: "rooms", versionKey: false, optimisticConcurrency: false })
export class Room {
  @Prop({ required: true, unique: true, index: true })
  code!: string;

  @Prop({ required: true })
  hostId!: string;

  @Prop({ required: true })
  hostName!: string;

  /** Secret token only the host knows; lets them reconnect as host. */
  @Prop({ required: true })
  hostToken!: string;

  @Prop({
    type: String,
    enum: [
      "lobby",
      "board",
      "question",
      "buzzed",
      "reveal",
      "final-wager",
      "final-question",
      "final-reveal",
      "ended",
    ],
    default: "lobby",
  })
  phase!: RoomPhase;

  @Prop({ type: Object, default: null })
  board!: GameBoard | null;

  @Prop({ type: [Object], default: [] })
  tiles!: TileState[];

  @Prop({ type: [Object], default: [] })
  players!: Player[];

  @Prop({ type: Object, default: null })
  activeQuestion!: {
    categoryId: string;
    questionId: string;
    isDailyDouble: boolean;
    wager?: number;
    buzzedPlayerId?: string;
    answerRevealed: boolean;
  } | null;

  @Prop({ type: String })
  controlPlayerId?: string;

  @Prop({ type: Object, required: true })
  settings!: RoomSettings;

  @Prop({ type: Object, default: {} })
  finalWagers?: Record<string, number>;

  @Prop({ type: Object, default: {} })
  finalAnswers?: Record<string, string>;

  @Prop({ default: () => Date.now() })
  createdAt!: number;
}

export const RoomSchema = SchemaFactory.createForClass(Room);
