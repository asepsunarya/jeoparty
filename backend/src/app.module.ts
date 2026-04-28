import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { MongooseModule } from "@nestjs/mongoose";
import { RoomsModule } from "./rooms/rooms.module";
import { QuestionsModule } from "./questions/questions.module";
import { MediaModule } from "./media/media.module";
import { AiModule } from "./ai/ai.module";

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    MongooseModule.forRootAsync({
      useFactory: () => ({
        uri: process.env.MONGO_URI ?? "mongodb://localhost:27017/jeoparty",
      }),
    }),
    RoomsModule,
    QuestionsModule,
    MediaModule,
    AiModule,
  ],
})
export class AppModule {}
