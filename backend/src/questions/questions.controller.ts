import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Res,
} from "@nestjs/common";
import { QuestionsService } from "./questions.service";
import type { Response } from "express";

@Controller("boards")
export class QuestionsController {
  constructor(private readonly svc: QuestionsService) {}

  @Get()
  list() {
    return this.svc.list();
  }

  @Get(":id")
  async get(@Param("id") id: string) {
    const doc = await this.svc.get(id);
    return this.svc.toExport(doc);
  }

  @Get(":id/export")
  async export(@Param("id") id: string, @Res() res: Response) {
    const doc = await this.svc.get(id);
    res
      .setHeader("Content-Type", "application/json")
      .setHeader(
        "Content-Disposition",
        `attachment; filename="${doc.title.replace(/\W+/g, "_")}.json"`,
      )
      .send(this.svc.toExport(doc));
  }

  @Post()
  async save(@Body() body: any) {
    const doc = await this.svc.save(body);
    return { id: doc._id.toString(), board: this.svc.toExport(doc) };
  }

  @Post("normalize")
  normalize(@Body() body: any) {
    return this.svc.normalizeBoard(body);
  }
}
