import { Module } from "@nestjs/common";
import { MongooseModule } from "@nestjs/mongoose";
import { Room, RoomSchema } from "./schemas/room.schema";
import { RoomsService } from "./rooms.service";
import { RoomsGateway } from "./rooms.gateway";
import { RoomsController } from "./rooms.controller";

@Module({
  imports: [
    MongooseModule.forFeature([{ name: Room.name, schema: RoomSchema }]),
  ],
  providers: [RoomsService, RoomsGateway],
  controllers: [RoomsController],
  exports: [RoomsService],
})
export class RoomsModule {}
