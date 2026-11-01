/**
 * Node-side image helpers: decode to RGBA (the same layout a browser canvas
 * hands the worker) and generate "phone photo" style augmentations.
 */
import sharp from "sharp";

import type { Embedder } from "@/lib/embeddings/embedder";

export const toRawImage = async (embedder: Embedder, input: Buffer) => {
  const { data, info } = await sharp(input)
    .rotate() // respect EXIF orientation from phone photos
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  return new embedder.RawImage(
    new Uint8ClampedArray(data.buffer, data.byteOffset, data.length),
    info.width,
    info.height,
    4
  );
};

/** Centre square crop, the shape the scanner's guide box produces. */
export const centerSquare = async (input: Buffer, fraction = 1) => {
  const img = sharp(input).rotate();
  const { width = 0, height = 0 } = await img.metadata();
  const side = Math.round(Math.min(width, height) * fraction);
  return img
    .extract({
      left: Math.round((width - side) / 2),
      top: Math.round((height - side) / 2),
      width: side,
      height: side,
    })
    .toBuffer();
};

/**
 * Cheap augmentations that imitate the gap between a clean digital scan and
 * a phone photo of a sleeve: slight rotation/shear, off-centre framing,
 * exposure shifts, warm indoor light and softness. Each variant becomes an
 * extra vector for the album ("augment" source).
 */
export const augmentCover = async (input: Buffer): Promise<Buffer[]> => {
  const base = sharp(input).resize(512, 512, { fit: "cover" });
  const bg = { r: 30, g: 30, b: 30, alpha: 1 };

  const variants = await Promise.all([
    // tilted, a bit dark, framed slightly tight
    base
      .clone()
      .rotate(5, { background: bg })
      .resize(512, 512, { fit: "cover" })
      .modulate({ brightness: 0.82 })
      .toBuffer(),
    // warm tungsten light, washed out, soft focus
    base
      .clone()
      .modulate({ brightness: 1.12, saturation: 0.78 })
      .tint({ r: 255, g: 228, b: 196 })
      .blur(1.2)
      .toBuffer(),
    // perspective-ish shear with glare-like gamma lift
    base
      .clone()
      .affine([1, 0.07, 0.05, 1], { background: bg })
      .resize(512, 512, { fit: "cover" })
      .gamma(1.6)
      .toBuffer(),
  ]);
  return variants;
};

/**
 * Close-up views: the centre of the cover, as the camera sees it when the
 * sleeve is held so close that it overflows the frame. Stored as extra
 * vectors (source "closeup") so partial-cover scans match a partial-cover
 * catalog view instead of being compared against the whole cover.
 */
export const CLOSEUP_FRACTIONS = [0.75, 0.55];

export const closeUpViews = async (input: Buffer): Promise<Buffer[]> => {
  const base = await sharp(input).resize(800, 800, { fit: "cover" }).toBuffer();
  return Promise.all(
    CLOSEUP_FRACTIONS.map((f) => {
      const side = Math.round(800 * f);
      const offset = Math.round((800 - side) / 2);
      return sharp(base)
        .extract({ left: offset, top: offset, width: side, height: side })
        .resize(512, 512)
        .toBuffer();
    })
  );
};
