/**
 * Resolve the REST base at runtime so devices on the LAN auto-target the
 * right host (same rationale as `lib/socket.ts`). In production a caller
 * can still set NEXT_PUBLIC_API_URL to pin to a public hostname.
 */
function getBase(): string {
  const explicit = process.env.NEXT_PUBLIC_API_URL;
  if (explicit) return explicit;
  if (typeof window !== "undefined") {
    return `${window.location.protocol}//${window.location.hostname}:4000`;
  }
  return "http://localhost:4000";
}

async function json<T>(r: Response): Promise<T> {
  if (!r.ok) throw new Error((await r.text()) || `${r.status}`);
  return r.json();
}

export const api = {
  async uploadMedia(file: File) {
    const fd = new FormData();
    fd.append("file", file);
    const r = await fetch(`${getBase()}/api/media/upload`, {
      method: "POST",
      body: fd,
    });
    return json<{ kind: string; url: string }>(r);
  },
  async mediaFromUrl(url: string) {
    const r = await fetch(`${getBase()}/api/media/from-url`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ url }),
    });
    return json<{ kind: string; url?: string; youtubeId?: string }>(r);
  },
  async generateAiBoard(topic: string, difficulty: string, categories = 5) {
    const r = await fetch(`${getBase()}/api/ai/generate-board`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ topic, difficulty, categories }),
    });
    return json(r);
  },
  async saveBoard(board: any, meta: { ownerName?: string; isPublic?: boolean } = {}) {
    const r = await fetch(`${getBase()}/api/boards`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ board, ...meta }),
    });
    return json<{ id: string; board: any }>(r);
  },
  async listBoards() {
    const r = await fetch(`${getBase()}/api/boards`);
    return json<any[]>(r);
  },
  async getBoard(id: string) {
    const r = await fetch(`${getBase()}/api/boards/${id}`);
    return json<any>(r);
  },
};
