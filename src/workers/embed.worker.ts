/// <reference lib="webworker" />
/**
 * Runs the cover embedding model off the main thread so the camera preview
 * stays smooth. Weights are fetched once from the Hugging Face hub and then
 * served from the browser cache.
 */
import { ACTIVE_EMBEDDING_MODEL } from "@/lib/embeddings/config";
import { loadEmbedder } from "@/lib/embeddings/embedder";

export type EmbedWorkerRequest =
  | { type: "load" }
  | { type: "embed"; id: number; image: ImageData };

export type EmbedWorkerResponse =
  | { type: "progress"; file?: string; progress?: number; status: string }
  | { type: "ready"; model: string; dims: number }
  | { type: "result"; id: number; vector: number[]; ms: number }
  | { type: "error"; id?: number; message: string };

const ctx = self as unknown as DedicatedWorkerGlobalScope;
const post = (msg: EmbedWorkerResponse) => ctx.postMessage(msg);

const getEmbedder = () =>
  loadEmbedder(ACTIVE_EMBEDDING_MODEL, {
    device: "wasm",
    onProgress: (p) =>
      post({
        type: "progress",
        status: p.status,
        file: p.file,
        progress: p.progress,
      }),
  });

ctx.onmessage = async (event: MessageEvent<EmbedWorkerRequest>) => {
  const msg = event.data;
  try {
    const embedder = await getEmbedder();
    if (msg.type === "load") {
      post({ type: "ready", model: embedder.model, dims: embedder.dims });
      return;
    }
    const start = performance.now();
    const { data, width, height } = msg.image;
    const image = new embedder.RawImage(data, width, height, 4);
    const vector = await embedder.embed(image);
    post({
      type: "result",
      id: msg.id,
      vector,
      ms: Math.round(performance.now() - start),
    });
  } catch (err) {
    post({
      type: "error",
      id: msg.type === "embed" ? msg.id : undefined,
      message: (err as Error).message ?? String(err),
    });
  }
};
