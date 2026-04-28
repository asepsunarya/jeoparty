import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { HydratedDocument } from "mongoose";
import type { Category, Question } from "@jeoparty/shared";

export type BoardDocument = HydratedDocument<Board>;

@Schema({ timestamps: true, collection: "boards" })
export class Board {
  @Prop({ required: true })
  title!: string;

  @Prop({ default: "" })
  description!: string;

  @Prop({ default: "anonymous" })
  ownerName!: string;

  @Prop({ type: [Object], default: [] })
  categories!: Category[];

  @Prop({ type: Object, default: null })
  final!: Question | null;

  @Prop({ default: false })
  isPublic!: boolean;
}

export const BoardSchema = SchemaFactory.createForClass(Board);
