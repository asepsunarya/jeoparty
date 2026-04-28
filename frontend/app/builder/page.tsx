"use client";

import { useCallback, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import toast from "react-hot-toast";
import Link from "next/link";
import type { GameBoard, Media, Question } from "@jeoparty/shared";
import { api } from "@/lib/api";
import { emit } from "@/lib/socket";
import { MediaRenderer } from "@/components/MediaRenderer";
import { makeSampleBoard } from "@/lib/sample-board";
import { useGame } from "@/store/gameStore";

function uid() {
  return Math.random().toString(36).slice(2, 10);
}

const emptyQuestion = (value: number): Question => ({
  id: uid(),
  prompt: "",
  answer: "",
  value,
});

function emptyBoard(): GameBoard {
  return {
    id: uid(),
    title: "My board",
    categories: Array.from({ length: 5 }).map((_, i) => ({
      id: uid(),
      title: `Category ${i + 1}`,
      questions: [200, 400, 600, 800, 1000].map(emptyQuestion),
    })),
    final: { id: uid(), prompt: "", answer: "", value: 0 },
  };
}

export default function BuilderPage() {
  const router = useRouter();
  const [board, setBoard] = useState<GameBoard>(() => emptyBoard());
  const [selected, setSelected] = useState<{ c: string; q: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const fileImportRef = useRef<HTMLInputElement>(null);
  const setInitial = useGame((s) => s.setInitial);

  const activeQuestion =
    selected &&
    board.categories
      .find((c) => c.id === selected.c)
      ?.questions.find((q) => q.id === selected.q);

  const updateBoard = (updater: (b: GameBoard) => GameBoard) =>
    setBoard((b) => updater(structuredClone(b)));

  const updateQuestion = useCallback(
    (c: string, q: string, patch: Partial<Question>) => {
      updateBoard((b) => {
        const cat = b.categories.find((x) => x.id === c);
        if (!cat) return b;
        const qq = cat.questions.find((x) => x.id === q);
        if (qq) Object.assign(qq, patch);
        return b;
      });
    },
    [],
  );

  async function hostWithThisBoard() {
    const nickname = prompt("Your nickname?") ?? "";
    if (!nickname.trim()) return;
    setBusy(true);
    try {
      const res: any = await emit("create_room", {
        nickname,
        board,
      });
      const you = res.room.players.find((p: any) => p.id === res.room.hostId);
      setInitial({
        room: res.room,
        you,
        role: "host",
        hostToken: res.hostToken,
      });
      router.push(`/host/${res.code}`);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setBusy(false);
    }
  }

  function exportJson() {
    const data = JSON.stringify(board, null, 2);
    const blob = new Blob([data], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${board.title.replace(/\W+/g, "_")}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function importJson(file: File) {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result));
        setBoard(parsed);
        toast.success("Imported");
      } catch {
        toast.error("Invalid JSON");
      }
    };
    reader.readAsText(file);
  }

  async function aiGenerate() {
    const topic = prompt("Board topic (e.g., '90s movies'):");
    if (!topic) return;
    setBusy(true);
    try {
      const res: any = await api.generateAiBoard(topic, "medium", 5);
      setBoard(res);
      toast.success("Board generated");
    } catch (e: any) {
      toast.error(e.message ?? "AI generation failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="min-h-screen p-4 md:p-8 space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-4xl text-jeopardy-gold">
            Board Builder
          </h1>
          <input
            value={board.title}
            onChange={(e) => updateBoard((b) => ({ ...b, title: e.target.value }))}
            className="text-2xl mt-1 font-bold"
          />
        </div>
        <div className="flex flex-wrap gap-2">
          <button className="btn-ghost" onClick={() => setBoard(makeSampleBoard())}>
            Load sample
          </button>
          <button className="btn-ghost" onClick={aiGenerate} disabled={busy}>
            ✨ AI generate
          </button>
          <button className="btn-ghost" onClick={() => fileImportRef.current?.click()}>
            Import JSON
          </button>
          <input
            ref={fileImportRef}
            type="file"
            accept="application/json"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) importJson(f);
              e.target.value = "";
            }}
          />
          <button className="btn-ghost" onClick={exportJson}>
            Export JSON
          </button>
          <button className="btn-primary" onClick={hostWithThisBoard} disabled={busy}>
            Host this board →
          </button>
          <Link href="/" className="btn-ghost">
            Home
          </Link>
        </div>
      </header>

      {/* Board grid */}
      <div
        className="grid gap-2"
        style={{
          gridTemplateColumns: `repeat(${board.categories.length}, minmax(140px, 1fr))`,
        }}
      >
        {board.categories.map((cat) => (
          <div key={cat.id} className="bg-jeopardy-blue rounded-lg p-2 shadow-tile">
            <input
              className="w-full bg-transparent border-0 text-center font-display text-xl text-jeopardy-cream focus:ring-0"
              value={cat.title}
              onChange={(e) =>
                updateBoard((b) => {
                  const c = b.categories.find((c) => c.id === cat.id);
                  if (c) c.title = e.target.value;
                  return b;
                })
              }
            />
          </div>
        ))}
        {[0, 1, 2, 3, 4].map((row) =>
          board.categories.map((cat) => {
            const q = cat.questions[row];
            const isSelected = selected?.q === q.id;
            const hasContent = q.prompt.trim() !== "";
            return (
              <motion.button
                key={q.id}
                whileHover={{ scale: 1.03 }}
                whileTap={{ scale: 0.97 }}
                onClick={() => setSelected({ c: cat.id, q: q.id })}
                className={`aspect-[16/9] rounded-lg font-display flex flex-col items-center justify-center shadow-tile relative
                  ${isSelected ? "ring-4 ring-jeopardy-gold" : ""}
                  ${hasContent ? "bg-jeopardy-blue text-jeopardy-gold" : "bg-jeopardy-blue/40 text-jeopardy-gold/40"}`}
              >
                <span className="text-3xl">{q.value}</span>
                <div className="absolute top-1 right-2 flex gap-1">
                  {q.media && (
                    <span className="text-[10px] bg-white/10 rounded px-1">
                      Q:{q.media.kind}
                    </span>
                  )}
                  {q.answerMedia && (
                    <span className="text-[10px] bg-jeopardy-gold/20 text-jeopardy-gold rounded px-1">
                      A:{q.answerMedia.kind}
                    </span>
                  )}
                </div>
              </motion.button>
            );
          }),
        )}
      </div>

      {/* Editor panel */}
      {activeQuestion && (
        <motion.section
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="card space-y-4"
        >
          <div className="flex justify-between">
            <h2 className="font-display text-2xl text-jeopardy-gold">
              Editing: {activeQuestion.value} pts
            </h2>
            <button className="btn-ghost" onClick={() => setSelected(null)}>
              Close
            </button>
          </div>

          <div className="grid md:grid-cols-2 gap-4">
            <div className="space-y-3">
              <label className="block">
                <span className="text-sm text-white/70">Prompt (markdown)</span>
                <textarea
                  value={activeQuestion.prompt}
                  onChange={(e) =>
                    updateQuestion(selected!.c, selected!.q, {
                      prompt: e.target.value,
                    })
                  }
                  rows={4}
                  className="w-full"
                  placeholder="In 1969 this astronaut took a small step…"
                />
              </label>
              <label className="block">
                <span className="text-sm text-white/70">Answer</span>
                <input
                  value={activeQuestion.answer}
                  onChange={(e) =>
                    updateQuestion(selected!.c, selected!.q, {
                      answer: e.target.value,
                    })
                  }
                  className="w-full"
                  placeholder="Who is Neil Armstrong?"
                />
              </label>
              <label className="block">
                <span className="text-sm text-white/70">Value</span>
                <input
                  type="number"
                  value={activeQuestion.value}
                  onChange={(e) =>
                    updateQuestion(selected!.c, selected!.q, {
                      value: Number(e.target.value),
                    })
                  }
                  className="w-32"
                />
              </label>
            </div>

            <div className="space-y-4">
              <MediaPicker
                label="Prompt media (optional)"
                media={activeQuestion.media}
                onChange={(m) =>
                  updateQuestion(selected!.c, selected!.q, { media: m })
                }
              />
              <MediaPicker
                label="Answer media (optional) — shown when host reveals"
                media={activeQuestion.answerMedia}
                onChange={(m) =>
                  updateQuestion(selected!.c, selected!.q, { answerMedia: m })
                }
              />
              <div>
                <div className="text-sm text-white/70 mb-1">Preview</div>
                <div className="card bg-black/30 space-y-3">
                  {activeQuestion.media && (
                    <MediaRenderer media={activeQuestion.media} />
                  )}
                  <div className="font-display text-xl">
                    {activeQuestion.prompt || <span className="text-white/40">(prompt)</span>}
                  </div>
                  <div className="border-t border-white/10 pt-3 space-y-2">
                    <div className="text-[10px] uppercase tracking-wider text-white/40">
                      After reveal
                    </div>
                    {activeQuestion.answerMedia && (
                      <MediaRenderer media={activeQuestion.answerMedia} />
                    )}
                    <div className="text-jeopardy-gold font-display text-xl">
                      {activeQuestion.answer || <span className="text-white/40">(answer)</span>}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </motion.section>
      )}

      {/* Final Jeopardy */}
      <section className="card space-y-3">
        <h2 className="font-display text-2xl text-jeopardy-gold">
          Final Jeopardy (optional)
        </h2>
        <div className="grid md:grid-cols-2 gap-3">
          <textarea
            rows={3}
            placeholder="Prompt"
            value={board.final?.prompt ?? ""}
            onChange={(e) =>
              updateBoard((b) => {
                b.final = { ...(b.final ?? emptyQuestion(0)), prompt: e.target.value };
                return b;
              })
            }
          />
          <input
            placeholder="Answer"
            value={board.final?.answer ?? ""}
            onChange={(e) =>
              updateBoard((b) => {
                b.final = { ...(b.final ?? emptyQuestion(0)), answer: e.target.value };
                return b;
              })
            }
          />
        </div>
      </section>
    </main>
  );
}

function MediaPicker({
  media,
  onChange,
  label = "Media (optional)",
}: {
  media?: Media;
  onChange: (m: Media | undefined) => void;
  label?: string;
}) {
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);

  async function handleFile(file: File) {
    setBusy(true);
    try {
      const res = await api.uploadMedia(file);
      onChange({ kind: res.kind as any, url: res.url });
      toast.success("Uploaded");
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function handleUrl() {
    if (!url) return;
    setBusy(true);
    try {
      const res: any = await api.mediaFromUrl(url);
      onChange({ kind: res.kind, url: res.url, youtubeId: res.youtubeId });
      setUrl("");
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-2">
      <div className="text-sm text-white/70">{label}</div>
      <div
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          const f = e.dataTransfer.files?.[0];
          if (f) handleFile(f);
        }}
        className="border-2 border-dashed border-white/20 rounded-xl p-4 text-center text-white/60 text-sm"
      >
        Drop an image / video / audio here,
        <br />
        or{" "}
        <label className="underline cursor-pointer">
          <input
            type="file"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleFile(f);
              e.target.value = "";
            }}
          />
          pick a file
        </label>
        .
      </div>
      <div className="flex gap-2">
        <input
          placeholder="YouTube or direct URL"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          className="flex-1"
        />
        <button className="btn-ghost" onClick={handleUrl} disabled={busy}>
          Attach
        </button>
      </div>
      {media && (
        <div className="flex items-center justify-between bg-white/5 rounded-lg px-3 py-2 text-sm">
          <span>
            Attached: <strong>{media.kind}</strong>
          </span>
          <button
            className="text-red-300 hover:text-red-200"
            onClick={() => onChange(undefined)}
          >
            Remove
          </button>
        </div>
      )}
    </div>
  );
}
