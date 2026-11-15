// Browser and seeder must both embed through this file or scans won't match.
import type { RawImage as RawImageType } from "@huggingface/transformers";

import {
  type EmbeddingModelKey,
  getEmbeddingModel,
  ACTIVE_EMBEDDING_MODEL,
} from "./config";
import { l2Normalize } from "./vector";

type Transformers = typeof import("@huggingface/transformers");

export type ProgressInfo = {
  status: string;
  file?: string;
  progress?: number;
  loaded?: number;
  total?: number;
};

export type Embedder = {
  model: EmbeddingModelKey;
  dims: number;
  embed: (image: RawImageType) => Promise<number[]>;
  RawImage: Transformers["RawImage"];
};

const cache = new Map<EmbeddingModelKey, Promise<Embedder>>();

export const loadEmbedder = (
  modelKey: EmbeddingModelKey = ACTIVE_EMBEDDING_MODEL,
  opts: {
    onProgress?: (p: ProgressInfo) => void;
    device?: "wasm" | "webgpu" | "cpu";
  } = {}
): Promise<Embedder> => {
  const existing = cache.get(modelKey);
  if (existing) return existing;

  const promise = createEmbedder(modelKey, opts).catch((err) => {
    cache.delete(modelKey);
    throw err;
  });
  cache.set(modelKey, promise);
  return promise;
};

const createEmbedder = async (
  modelKey: EmbeddingModelKey,
  opts: {
    onProgress?: (p: ProgressInfo) => void;
    device?: "wasm" | "webgpu" | "cpu";
  }
): Promise<Embedder> => {
  const cfg = getEmbeddingModel(modelKey);
  const tf: Transformers = await import("@huggingface/transformers");

  tf.env.allowLocalModels = false;
  // Serverless file systems are read-only except /tmp; cache weights there.
  if (typeof window === "undefined" && typeof process !== "undefined") {
    const dir =
      process.env.TRANSFORMERS_CACHE ??
      (process.env.VERCEL ? "/tmp/transformers-cache" : undefined);
    if (dir) tf.env.cacheDir = dir;
  }

  const loadOpts = {
    dtype: cfg.dtype,
    progress_callback: opts.onProgress as never,
    ...(opts.device ? { device: opts.device } : {}),
  };

  const processor = await tf.AutoProcessor.from_pretrained(cfg.hfId);

  if (cfg.kind === "clip") {
    const model = await tf.CLIPVisionModelWithProjection.from_pretrained(
      cfg.hfId,
      loadOpts
    );
    return {
      model: modelKey,
      dims: cfg.dims,
      RawImage: tf.RawImage,
      embed: async (image) => {
        const inputs = await processor(image);
        const { image_embeds } = await model(inputs);
        return l2Normalize(image_embeds.data as Float32Array);
      },
    };
  }

  const model = await tf.AutoModel.from_pretrained(cfg.hfId, loadOpts);
  return {
    model: modelKey,
    dims: cfg.dims,
    RawImage: tf.RawImage,
    embed: async (image) => {
      const inputs = await processor(image);
      const out = await model(inputs);
      const pooled =
        out.pooler_output ?? out.last_hidden_state.slice(null, 0, null);
      return l2Normalize((pooled.data as Float32Array).slice(0, cfg.dims));
    },
  };
};
