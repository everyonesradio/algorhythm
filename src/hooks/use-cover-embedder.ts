// ** React/Next.js Imports
import { useCallback, useEffect, useRef, useState } from "react";

// ** Custom Components, Hooks, Utils, etc.
import type { EmbeddingModelKey } from "@/lib/embeddings/config";
import type {
  EmbedWorkerRequest,
  EmbedWorkerResponse,
} from "@/workers/embed.worker";

type Status = "idle" | "loading" | "ready" | "error";

/** Owns the embedding Web Worker and exposes a promise-based `embed`. */
export const useCoverEmbedder = () => {
  const workerRef = useRef<Worker | null>(null);
  const pending = useRef(
    new Map<number, { resolve: (v: number[]) => void; reject: (e: Error) => void }>()
  );
  const nextId = useRef(0);

  const [status, setStatus] = useState<Status>("idle");
  const [progress, setProgress] = useState(0);
  const [model, setModel] = useState<EmbeddingModelKey | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastMs, setLastMs] = useState<number | null>(null);

  useEffect(() => {
    const worker = new Worker(
      new URL("../workers/embed.worker.ts", import.meta.url),
      { type: "module" }
    );
    workerRef.current = worker;
    // Track download progress per file, report the overall average.
    const files = new Map<string, number>();
    const inflight = pending.current;

    worker.onmessage = (event: MessageEvent<EmbedWorkerResponse>) => {
      const msg = event.data;
      switch (msg.type) {
        case "progress":
          if (msg.file && typeof msg.progress === "number") {
            files.set(msg.file, msg.progress);
            const vals = [...files.values()];
            setProgress(vals.reduce((a, b) => a + b, 0) / vals.length);
          }
          break;
        case "ready":
          setModel(msg.model as EmbeddingModelKey);
          setStatus("ready");
          break;
        case "result":
          setLastMs(msg.ms);
          inflight.get(msg.id)?.resolve(msg.vector);
          inflight.delete(msg.id);
          break;
        case "error":
          if (msg.id !== undefined) {
            inflight.get(msg.id)?.reject(new Error(msg.message));
            inflight.delete(msg.id);
          } else {
            setError(msg.message);
            setStatus("error");
          }
          break;
      }
    };

    setStatus("loading");
    worker.postMessage({ type: "load" } satisfies EmbedWorkerRequest);

    return () => {
      worker.terminate();
      workerRef.current = null;
      inflight.forEach((p) => p.reject(new Error("worker terminated")));
      inflight.clear();
    };
  }, []);

  const embed = useCallback((image: ImageData) => {
    const worker = workerRef.current;
    if (!worker) return Promise.reject(new Error("embedder not started"));
    const id = nextId.current++;
    return new Promise<number[]>((resolve, reject) => {
      pending.current.set(id, { resolve, reject });
      worker.postMessage({ type: "embed", id, image } satisfies EmbedWorkerRequest);
    });
  }, []);

  return { status, progress, model, error, lastMs, embed };
};
