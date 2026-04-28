import { Injectable, NotFoundException } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { Model } from "mongoose";
import { randomUUID } from "crypto";
import type { Category, GameBoard, Question } from "@jeoparty/shared";
import { Board, BoardDocument } from "./schemas/board.schema";
import { parseYouTubeId } from "../common/youtube";

@Injectable()
export class QuestionsService {
  constructor(
    @InjectModel(Board.name) private readonly boardModel: Model<BoardDocument>,
  ) {}

  /** Assigns stable IDs and normalizes media (YouTube URL -> id). */
  normalizeBoard(partial: Partial<GameBoard>): GameBoard {
    const id = partial.id ?? randomUUID();
    const categories: Category[] = (partial.categories ?? []).map((cat) => ({
      id: cat.id ?? randomUUID(),
      title: cat.title ?? "Category",
      questions: (cat.questions ?? [])
        .map((q) => this.normalizeQuestion(q))
        .sort((a, b) => a.value - b.value),
    }));
    const final = partial.final ? this.normalizeQuestion(partial.final) : undefined;
    return {
      id,
      title: partial.title ?? "Untitled board",
      categories,
      final,
    };
  }

  normalizeQuestion(q: Partial<Question>): Question {
    return {
      id: q.id ?? randomUUID(),
      prompt: q.prompt ?? "",
      answer: q.answer ?? "",
      value: Math.max(0, Number(q.value ?? 100)),
      media: this.normalizeMedia(q.media),
      answerMedia: this.normalizeMedia(q.answerMedia),
      isDailyDouble: false,
    };
  }

  private normalizeMedia(input: Question["media"]): Question["media"] {
    if (!input) return undefined;
    const media = { ...input };
    if (media.kind === "youtube" && media.url && !media.youtubeId) {
      const id = parseYouTubeId(media.url);
      if (id) {
        media.youtubeId = id;
        media.url = `https://www.youtube.com/embed/${id}`;
      }
    }
    return media;
  }

  async save(partial: Partial<Board> & { board: GameBoard }): Promise<BoardDocument> {
    const normalized = this.normalizeBoard(partial.board);
    const doc = await this.boardModel.create({
      title: normalized.title,
      description: partial.description ?? "",
      ownerName: partial.ownerName ?? "anonymous",
      categories: normalized.categories,
      final: normalized.final ?? null,
      isPublic: partial.isPublic ?? false,
    });
    return doc;
  }

  async list(): Promise<BoardDocument[]> {
    return this.boardModel.find({ isPublic: true }).sort({ createdAt: -1 }).limit(100);
  }

  async get(id: string): Promise<BoardDocument> {
    const doc = await this.boardModel.findById(id);
    if (!doc) throw new NotFoundException("Board not found");
    return doc;
  }

  /** Exported JSON shape users can share. */
  toExport(doc: BoardDocument): GameBoard {
    return this.normalizeBoard({
      id: doc._id.toString(),
      title: doc.title,
      categories: doc.categories,
      final: doc.final ?? undefined,
    });
  }
}
