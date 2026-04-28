import {
  Body,
  Controller,
  Post,
  UploadedFile,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { MediaService } from "./media.service";

@Controller("media")
export class MediaController {
  constructor(private readonly media: MediaService) {}

  @Post("upload")
  @UseInterceptors(FileInterceptor("file", { limits: { fileSize: 40 * 1024 * 1024 } }))
  async upload(@UploadedFile() file: Express.Multer.File) {
    return this.media.upload(file);
  }

  /** Classify an arbitrary URL (YouTube / image / video / audio). */
  @Post("from-url")
  fromUrl(@Body() body: { url: string }) {
    return this.media.parseUrl(body.url);
  }
}
