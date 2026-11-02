/**
 * Maps the on-screen guide square to pixel coordinates in the raw video frame.
 *
 * The <video> is rendered with `object-fit: cover`, so the frame is scaled by
 * s = max(displayW / videoW, displayH / videoH) and centred, with overflow
 * cropped. The guide is a centred square of `fraction * min(displayW, displayH)`
 * display pixels; dividing by s gives its size in video pixels.
 */
export type CropRect = { sx: number; sy: number; size: number };

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

/** Centre square of an image (used for uploaded photos). */
export const centerSquareCrop = (
  w: number,
  h: number,
  fraction = 0.9
): CropRect => {
  const size = Math.min(w, h) * fraction;
  return { sx: (w - size) / 2, sy: (h - size) / 2, size };
};

/** Model input resolution. CLIP/DINOv2 processors resize to 224 anyway. */
export const EMBED_INPUT_SIZE = 224;

/**
 * Draw a crop from any canvas image source into a square ImageData ready for
 * the embedding worker.
 */
export const cropToImageData = (
  source: CanvasImageSource,
  crop: CropRect,
  canvas: HTMLCanvasElement | OffscreenCanvas,
  out = EMBED_INPUT_SIZE
): ImageData | null => {
  if (crop.size <= 0) return null;
  canvas.width = out;
  canvas.height = out;
  // The union of canvas types widens getContext's return; narrow it back.
  const ctx = canvas.getContext("2d", { willReadFrequently: true }) as
    CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null;
  if (!ctx) return null;
  ctx.drawImage(source, crop.sx, crop.sy, crop.size, crop.size, 0, 0, out, out);
  return ctx.getImageData(0, 0, out, out);
};

/**
 * Mean absolute difference between two small grayscale thumbnails, 0..255.
 * Used to skip identical frames and to wait for the camera to settle.
 */
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

/**
 * Mean grey-level change (0-255) below which two frames show the same
 * scene: sensor noise on a still camera is ~1-3, a sleeve coming into view
 * is 20+.
 */
export const SAME_SCENE_DIFF = 4;
/** Re-ask anyway after this many skipped frames (catalog may have grown). */
export const MAX_SAME_SCENE_SKIPS = 12;

/**
 * Skip the search for this frame? Only when the last search found nothing
 * and the camera still sees the same thing: same answer, no point asking.
 * Saves the server search and the on-device embedding (battery).
 */
export const skipSameScene = (opts: {
  lastStatus: string | null;
  diff: number;
  skips: number;
  /** The next search must run (it may open the artist picker). */
  mustAsk: boolean;
}) =>
  !opts.mustAsk &&
  opts.lastStatus === "none" &&
  opts.diff < SAME_SCENE_DIFF &&
  opts.skips < MAX_SAME_SCENE_SKIPS;
