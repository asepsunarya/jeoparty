import { Injectable, Logger, BadRequestException, OnModuleInit } from "@nestjs/common";
import {
  CreateBucketCommand,
  HeadBucketCommand,
  PutBucketPolicyCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { randomUUID } from "crypto";
import type { Media } from "@jeoparty/shared";
import { parseYouTubeId } from "../common/youtube";

const ALLOWED_MIME: Record<string, "image" | "video" | "audio"> = {
  "image/png": "image",
  "image/jpeg": "image",
  "image/webp": "image",
  "image/gif": "image",
  "video/mp4": "video",
  "video/webm": "video",
  "video/quicktime": "video",
  "audio/mpeg": "audio",
  "audio/mp3": "audio",
  "audio/wav": "audio",
  "audio/ogg": "audio",
};

const MAX_BYTES = 40 * 1024 * 1024; // 40MB

@Injectable()
export class MediaService implements OnModuleInit {
  private readonly log = new Logger(MediaService.name);
  private s3: S3Client;
  private bucket: string;
  private publicBase: string;

  constructor() {
    this.bucket = process.env.S3_BUCKET ?? "jeoparty-media";
    this.publicBase =
      process.env.S3_PUBLIC_URL ??
      `${process.env.S3_ENDPOINT ?? ""}/${this.bucket}`;

    this.s3 = new S3Client({
      region: process.env.S3_REGION ?? "us-east-1",
      endpoint: process.env.S3_ENDPOINT,
      forcePathStyle: true,
      credentials: {
        accessKeyId: process.env.S3_ACCESS_KEY ?? "",
        secretAccessKey: process.env.S3_SECRET_KEY ?? "",
      },
    });
  }

  async onModuleInit() {
    await this.ensureBucket();
  }

  private async ensureBucket() {
    const policy = JSON.stringify({
      Version: "2012-10-17",
      Statement: [
        {
          Effect: "Allow",
          Principal: "*",
          Action: ["s3:GetObject"],
          Resource: [`arn:aws:s3:::${this.bucket}/*`],
        },
      ],
    });

    for (let attempt = 1; attempt <= 20; attempt++) {
      try {
        try {
          await this.s3.send(new HeadBucketCommand({ Bucket: this.bucket }));
        } catch {
          await this.s3.send(new CreateBucketCommand({ Bucket: this.bucket }));
          this.log.log(`created media bucket ${this.bucket}`);
        }
        await this.s3.send(
          new PutBucketPolicyCommand({ Bucket: this.bucket, Policy: policy }),
        );
        return;
      } catch (err) {
        if (attempt === 20) {
          this.log.error(`media bucket initialization failed: ${String(err)}`);
          return;
        }
        await new Promise((resolve) => setTimeout(resolve, 2000));
      }
    }
  }

  async upload(file: Express.Multer.File): Promise<Media> {
    if (!file) throw new BadRequestException("No file");
    if (file.size > MAX_BYTES)
      throw new BadRequestException("File too large (max 40MB)");
    const kind = ALLOWED_MIME[file.mimetype];
    if (!kind) throw new BadRequestException(`Unsupported type: ${file.mimetype}`);

    const ext = file.originalname.split(".").pop()?.toLowerCase() ?? "bin";
    const key = `${kind}/${new Date().toISOString().slice(0, 10)}/${randomUUID()}.${ext}`;
    await this.s3.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: file.buffer,
        ContentType: file.mimetype,
        CacheControl: "public, max-age=31536000, immutable",
      }),
    );
    const url = `${this.publicBase.replace(/\/+$/, "")}/${key}`;
    this.log.log(`uploaded ${kind} ${key}`);
    return { kind, url };
  }

  parseUrl(url: string): Media {
    const yt = parseYouTubeId(url);
    if (yt) {
      return {
        kind: "youtube",
        youtubeId: yt,
        url: `https://www.youtube.com/embed/${yt}`,
      };
    }
    const lower = url.toLowerCase();
    if (/\.(png|jpe?g|webp|gif)(\?.*)?$/.test(lower))
      return { kind: "image", url };
    if (/\.(mp4|webm|mov)(\?.*)?$/.test(lower))
      return { kind: "video", url };
    if (/\.(mp3|wav|ogg|m4a)(\?.*)?$/.test(lower))
      return { kind: "audio", url };
    return { kind: "text", url };
  }
}
