import { Body, Controller, Post } from "@nestjs/common";
import { AiService } from "./ai.service";

@Controller("ai")
export class AiController {
  constructor(private readonly ai: AiService) {}

  @Post("generate-board")
  generate(
    @Body()
    body: { topic: string; categories?: number; difficulty?: "easy" | "medium" | "hard" },
  ) {
    return this.ai.generateBoard(body);
  }
}
