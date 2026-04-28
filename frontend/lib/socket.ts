import { io, Socket } from "socket.io-client";

let socket: Socket | null = null;

/**
 * Resolve the backend URL at runtime from the browser's current origin,
 * so that when a peer on the LAN opens http://192.168.1.42:3000 the socket
 * connects back to http://192.168.1.42:4000 instead of a baked-in "localhost".
 *
 * Explicit NEXT_PUBLIC_WS_URL overrides this (useful in production with a
 * separate WebSocket domain).
 */
export function getBackendUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_WS_URL;
  if (explicit) return explicit;
  if (typeof window !== "undefined") {
    return `${window.location.protocol}//${window.location.hostname}:4000`;
  }
  return "http://localhost:4000";
}

export function getSocket(): Socket {
  if (socket) return socket;
  socket = io(getBackendUrl(), {
    transports: ["websocket"],
    autoConnect: true,
    reconnection: true,
    reconnectionDelayMax: 5000,
  });
  return socket;
}

/** Promisified emit with ack. */
export function emit<T = unknown>(event: string, payload: any): Promise<T> {
  return new Promise((resolve, reject) => {
    const s = getSocket();
    s.emit(event, payload, (res: any) => {
      if (res?.ok) resolve(res.data as T);
      else reject(new Error(res?.error ?? "unknown error"));
    });
  });
}
