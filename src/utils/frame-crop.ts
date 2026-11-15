export type CropRect = { sx: number; sy: number; size: number };

// Assumes the <video> is rendered with `object-fit: cover`.
export const computeGuideCrop = (
  videoW: number,
  videoH: number,
  displayW: number,
  displayH: number,
  fraction: number
): CropRect => {
  if (!videoW || !videoH || !displayW || !displayH) {
    return { sx: 0, sy: 0, size: 0 };
  }
  const scale = Math.max(displayW / videoW, displayH / videoH);
  const guideDisplay = fraction * Math.min(displayW, displayH);
  const size = Math.min(guideDisplay / scale, videoW, videoH);
  return {
    sx: (videoW - size) / 2,
    sy: (videoH - size) / 2,
    size,
  };
};

export const centerSquareCrop = (
  w: number,
  h: number,
  fraction = 0.9
): CropRect => {
  const size = Math.min(w, h) * fraction;
  return { sx: (w - size) / 2, sy: (h - size) / 2, size };
};

export const EMBED_INPUT_SIZE = 224;

export const cropToImageData = (
  source: CanvasImageSource,
  crop: CropRect,
  canvas: HTMLCanvasElement | OffscreenCanvas,
  out = EMBED_INPUT_SIZE
): ImageData | null => {
  if (crop.size <= 0) return null;
  canvas.width = out;
  canvas.height = out;
  const ctx = canvas.getContext("2d", { willReadFrequently: true }) as
    CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null;
  if (!ctx) return null;
  ctx.drawImage(source, crop.sx, crop.sy, crop.size, crop.size, 0, 0, out, out);
  return ctx.getImageData(0, 0, out, out);
};

export const frameDifference = (a: ImageData, b: ImageData, step = 16) => {
  if (a.data.length !== b.data.length) return 255;
  let sum = 0;
  let n = 0;
  for (let i = 0; i < a.data.length; i += 4 * step) {
    const ga = (a.data[i] + a.data[i + 1] + a.data[i + 2]) / 3;
    const gb = (b.data[i] + b.data[i + 1] + b.data[i + 2]) / 3;
    sum += Math.abs(ga - gb);
    n++;
  }
  return n ? sum / n : 255;
};

export const SAME_SCENE_DIFF = 4;
export const MAX_SAME_SCENE_SKIPS = 12;

export const skipSameScene = (opts: {
  lastStatus: string | null;
  diff: number;
  skips: number;
  mustAsk: boolean;
}) =>
  !opts.mustAsk &&
  opts.lastStatus === "none" &&
  opts.diff < SAME_SCENE_DIFF &&
  opts.skips < MAX_SAME_SCENE_SKIPS;
