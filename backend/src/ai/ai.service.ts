import { Injectable, Logger, ServiceUnavailableException } from "@nestjs/common";
import OpenAI from "openai";
import { randomUUID } from "crypto";
import type { GameBoard } from "@jeoparty/shared";

/**
 * Optional AI question generator. Returns a complete, valid GameBoard
 * that the host can further edit in the builder.
 *
 * The service fails loudly (503) if OPENAI_API_KEY is not configured so
 * the frontend can show a helpful message.
 */
@Injectable()
export class AiService {
  private readonly log = new Logger(AiService.name);
  private client: OpenAI | null = null;

  constructor() {
    const key = process.env.OPENAI_API_KEY;
    if (key) this.client = new OpenAI({ apiKey: key });
  }

  async generateBoard(opts: {
    topic: string;
    categories?: number;
    difficulty?: "easy" | "medium" | "hard";
  }): Promise<GameBoard> {
    if (!this.client)
      throw new ServiceUnavailableException(
        "AI generator disabled — set OPENAI_API_KEY to enable.",
      );
    const categories = Math.min(Math.max(opts.categories ?? 5, 3), 6);
    const difficulty = opts.difficulty ?? "medium";

    const prompt = `You are designing a Jeopardy board on the topic: "${opts.topic}".
Difficulty: ${difficulty}. Produce exactly ${categories} categories, each with 5 questions valued 200,400,600,800,1000.
Questions must be in Jeopardy "answer" form (a statement), and the "answer" field should be the player's correct response phrased as a question ("What is ___?" / "Who is ___?").
Also include one Final Jeopardy question at value 0.
Return JSON ONLY matching this TypeScript type:
{
  title: string;
  categories: { title: string; questions: { prompt: string; answer: string; value: number }[] }[];
  final: { prompt: string; answer: string; value: number };
}`;

    const res = await this.client.chat.completions.create({
      model: "gpt-4o-mini",
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: "You output only valid JSON." },
        { role: "user", content: prompt },
      ],
    });

    const raw = res.choices[0]?.message?.content ?? "{}";
    const parsed = JSON.parse(raw);
    return {
      id: randomUUID(),
      title: parsed.title ?? opts.topic,
      categories: (parsed.categories ?? []).map((c: any) => ({
        id: randomUUID(),
        title: c.title ?? "Category",
        questions: (c.questions ?? []).map((q: any) => ({
          id: randomUUID(),
          prompt: q.prompt ?? "",
          answer: q.answer ?? "",
          value: Number(q.value) || 200,
        })),
      })),
      final: parsed.final
        ? {
            id: randomUUID(),
            prompt: parsed.final.prompt ?? "",
            answer: parsed.final.answer ?? "",
            value: 0,
          }
        : undefined,
    };
  }
}
