export type EmbeddingModelKey = "clip-vit-b32" | "dinov2-small";

export type EmbeddingModelConfig = {
  key: EmbeddingModelKey;
  hfId: string;
  // Must match the Atlas vector index definition.
  dims: number;
  kind: "clip" | "dinov2";
  // Seeder and browser must use the same dtype or vectors drift.
  dtype: "fp32" | "q8";
};

export const EMBEDDING_MODELS: Record<EmbeddingModelKey, EmbeddingModelConfig> =
  {
    "clip-vit-b32": {
      key: "clip-vit-b32",
      hfId: "Xenova/clip-vit-base-patch32",
      dims: 512,
      kind: "clip",
      dtype: "q8",
    },
    "dinov2-small": {
      key: "dinov2-small",
      hfId: "Xenova/dinov2-small",
      dims: 384,
      kind: "dinov2",
      dtype: "q8",
    },
  };

export const ACTIVE_EMBEDDING_MODEL: EmbeddingModelKey = "clip-vit-b32";

export const getEmbeddingModel = (key: EmbeddingModelKey = ACTIVE_EMBEDDING_MODEL) =>
  EMBEDDING_MODELS[key];

export const COVER_VECTOR_INDEX = "cover_vector_index";
