import { Controller, Get, Param } from "@nestjs/common";
import { RoomsService } from "./rooms.service";

@Controller("rooms")
export class RoomsController {
  constructor(private readonly rooms: RoomsService) {}

  @Get("health")
  health() {
    return { ok: true };
  }

  @Get(":code")
  async get(@Param("code") code: string) {
    const room = await this.rooms.getRoom(code);
    const pub = this.rooms.toPublic(room);
    // Never leak answers via REST
    return { ...pub, board: this.rooms.publicBoard(room) };
  }
}
