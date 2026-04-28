import "reflect-metadata";
import { networkInterfaces } from "os";
import { NestFactory } from "@nestjs/core";
import { ValidationPipe, Logger } from "@nestjs/common";
import { IoAdapter } from "@nestjs/platform-socket.io";
import { AppModule } from "./app.module";
import { RedisIoAdapter } from "./ws/redis-io.adapter";

/**
 * Lists all non-internal IPv4 addresses bound to this machine, e.g.
 * ["192.168.1.42", "10.0.0.2"]. Used to print LAN URLs on boot and to
 * whitelist matching CORS origins in dev.
 */
function getLanIPs(): string[] {
  const ifaces = networkInterfaces();
  const ips: string[] = [];
  for (const list of Object.values(ifaces)) {
    for (const iface of list ?? []) {
      if (iface.family === "IPv4" && !iface.internal) ips.push(iface.address);
    }
  }
  return ips;
}

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { cors: false });
  const logger = new Logger("Bootstrap");

  // Optional: enable horizontal scaling for Socket.IO using Redis.
  // In Coolify, add a Redis service and set REDIS_URL=redis://<host>:6379.
  const redisUrl = process.env.REDIS_URL?.trim();
  if (redisUrl) {
    const redisAdapter = new RedisIoAdapter(app);
    const adapter = await redisAdapter.connectToRedis(redisUrl);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (redisAdapter as any).createIOServer = (port: number, options?: any) => {
      const server = IoAdapter.prototype.createIOServer.call(
        redisAdapter,
        port,
        options,
      );
      server.adapter(adapter);
      return server;
    };
    app.useWebSocketAdapter(redisAdapter);
    logger.log("Socket.IO scaling enabled via Redis");
  }

  // In dev, auto-allow any http origin on the LAN (localhost, 127.0.0.1, the
  // host's LAN IPs). In prod, use CORS_ORIGIN as an explicit allowlist.
  const explicit = process.env.CORS_ORIGIN?.split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const isDev = process.env.NODE_ENV !== "production";
  const lanIps = getLanIPs();

  app.enableCors({
    credentials: true,
    origin: (origin, cb) => {
      // Server-to-server / curl / same-origin
      if (!origin) return cb(null, true);
      if (explicit && explicit.length > 0) {
        return explicit.includes(origin)
          ? cb(null, true)
          : cb(new Error(`CORS: ${origin} not allowed`));
      }
      if (!isDev) return cb(new Error("CORS_ORIGIN not configured"));
      try {
        const u = new URL(origin);
        const host = u.hostname;
        const allowed =
          host === "localhost" ||
          host === "127.0.0.1" ||
          host === "::1" ||
          lanIps.includes(host) ||
          // common LAN ranges — handy for mobile / ad-hoc LANs
          /^10\./.test(host) ||
          /^192\.168\./.test(host) ||
          /^172\.(1[6-9]|2\d|3[01])\./.test(host);
        return allowed
          ? cb(null, true)
          : cb(new Error(`CORS: ${origin} not on local network`));
      } catch {
        return cb(new Error("CORS: invalid origin"));
      }
    },
  });

  app.setGlobalPrefix("api");
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, transform: true }),
  );

  const port = Number(process.env.PORT ?? 4000);
  // Bind to 0.0.0.0 so the port is reachable from the LAN, not just the
  // loopback interface.
  await app.listen(port, "0.0.0.0");

  logger.log(`Jeoparty backend listening on :${port}`);
  logger.log(`  local:    http://localhost:${port}`);
  for (const ip of lanIps) logger.log(`  network:  http://${ip}:${port}`);
}

bootstrap();
