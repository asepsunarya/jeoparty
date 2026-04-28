import { IoAdapter } from "@nestjs/platform-socket.io";
import { INestApplicationContext, Logger } from "@nestjs/common";
import { createAdapter } from "@socket.io/redis-adapter";
import { createClient } from "redis";

/**
 * Socket.IO Redis adapter for horizontal scaling.
 *
 * Enable by setting REDIS_URL, e.g.:
 *   REDIS_URL=redis://redis:6379
 *
 * Without this, scaling the backend to >1 replica requires sticky sessions and
 * still won't share room events between replicas.
 */
export class RedisIoAdapter extends IoAdapter {
  private readonly logger = new Logger(RedisIoAdapter.name);

  constructor(app: INestApplicationContext) {
    super(app);
  }

  async connectToRedis(redisUrl: string) {
    const pubClient = createClient({ url: redisUrl });
    const subClient = pubClient.duplicate();
    await Promise.all([pubClient.connect(), subClient.connect()]);
    this.logger.log("Socket.IO Redis adapter connected");
    return createAdapter(pubClient, subClient);
  }
}

