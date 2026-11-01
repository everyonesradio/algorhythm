/**
 * Isomorphic cover-art embedder (browser Web Worker + Node seeding scripts).
 *
 * Both sides MUST go through this file so preprocessing, weights and output
 * pooling are identical. If they diverge, scans stop matching the catalog.
 */
import type { RawImage as RawImageType } from "@huggingface/transformers";

import {
  EmbeddingModelKey,
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
  /** Re-exported so callers can build RawImage instances without a 2nd import. */
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

  // Never look for weights on our own server; always pull from the HF hub
  // (cached by the browser Cache API / ~/.cache on Node after first load).
  tf.env.allowLocalModels = false;

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
      // DINOv2: pooler_output is the layer-normed CLS token.
      const pooled =
        out.pooler_output ?? out.last_hidden_state.slice(null, 0, null);
      return l2Normalize((pooled.data as Float32Array).slice(0, cfg.dims));
    },
  };
};
