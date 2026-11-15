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

export const augmentCover = async (input: Buffer): Promise<Buffer[]> => {
  const base = sharp(input).resize(512, 512, { fit: "cover" });
  const bg = { r: 30, g: 30, b: 30, alpha: 1 };

  const variants = await Promise.all([
    base
      .clone()
      .rotate(5, { background: bg })
      .resize(512, 512, { fit: "cover" })
      .modulate({ brightness: 0.82 })
      .toBuffer(),
    base
      .clone()
      .modulate({ brightness: 1.12, saturation: 0.78 })
      .tint({ r: 255, g: 228, b: 196 })
      .blur(1.2)
      .toBuffer(),
    base
      .clone()
      .affine([1, 0.07, 0.05, 1], { background: bg })
      .resize(512, 512, { fit: "cover" })
      .gamma(1.6)
      .toBuffer(),
  ]);
  return variants;
};

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
