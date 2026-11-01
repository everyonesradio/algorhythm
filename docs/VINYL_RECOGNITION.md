# Vinyl recognition: how it works and how it scales

## TL;DR

We do **image retrieval**, not image classification.

Each album cover in the catalog is turned into a vector (an "embedding") by a
pretrained vision model and stored in MongoDB. When someone points their phone
at a record, the browser runs the same model on the camera frame and asks
MongoDB Atlas Vector Search for the nearest stored cover. The nearest cover is
the album. Adding an album means inserting a row, with no retraining.

```
 SEED (offline, scripts/seed-covers.ts)
 MusicBrainz ──► metadata (title, artist, year, genres, tags)
 Cover Art Archive ──► front cover ─┐
 Spotify search ──► id/url + art ───┼─► CLIP embed ─► CoverEmbedding (N per album)
 sharp augmentations ───────────────┘                  Album (metadata)

 SCAN (browser, /scan-vinyl)
 camera ─► guide-square crop ─► Web Worker: CLIP embed (same weights)
        ─► tRPC vinyl.identify(vector) ─► $vectorSearch top-K
        ─► group by album, threshold + margin ─► matched | ambiguous | none
        ─► drawer: 3D cover, metadata, streaming links (existing link service)
        ─► "Right record? Yes" ─► vinyl.confirm ─► user_scan vector (flywheel)
```

## Why the original plan changed

The PRD planned a custom TF.js model trained to output `artist_albumName`
labels. That is a **classifier**, and classifiers break down for this problem:

| | Classifier (`artist_album` labels) | Retrieval (embeddings + vector search) |
|---|---|---|
| Add a new album | Collect ~40 photos, relabel, retrain, redeploy | Insert one row |
| Catalog size | Hundreds of classes before accuracy collapses | Millions (ANN index) |
| Training data | Labelled photos per album, which we don't have | None; one cover image per album is enough |
| Unknown record | Forced to pick a known label (confident and wrong) | Low similarity, "not found" |
| Model output | A string to split and search Spotify with (fragile) | A database id with metadata and links attached |

The COCO-SSD object detector was also removed. COCO has no "album cover"
class, and the guide square on screen does the job of detection for now (see
roadmap).

## What was built

| Piece | Where |
|---|---|
| Model registry (CLIP ViT-B/32 default, DINOv2-small alt) | `src/lib/embeddings/config.ts` |
| Isomorphic embedder (same code in browser + Node) | `src/lib/embeddings/embedder.ts` |
| Browser Web Worker | `src/workers/embed.worker.ts`, `src/hooks/use-cover-embedder.ts` |
| Camera + guide crop + motion gate + upload fallback | `src/pages/scan-vinyl/index.tsx`, `src/utils/frame-crop.ts` |
| tRPC `vinyl.identify / confirm / album / stats` | `src/server/api/routers/vinyl.ts` |
| Vector search (Atlas `$vectorSearch`, or local brute force) | `src/server/services/vinyl/index-search.ts` |
| Ranking: best-per-album, threshold + margin decision | `src/server/services/vinyl/ranking.ts` |
| Schema: `Album`, `CoverEmbedding`, `ScanEvent` | `prisma/schema.prisma` |
| Seeder (MusicBrainz + CAA + Spotify + augmentations) | `scripts/seed-covers.ts` |
| Vector index creation | `scripts/create-vector-index.ts` |
| Accuracy/threshold evaluation on real photos | `scripts/eval-recognition.ts` |

Privacy and cost: camera frames never leave the device. Only a 512-float
vector (~2 KB) is sent per attempt. The server does no ML work at all; it runs
one indexed query.

## Running it

1. **MongoDB Atlas.** `$vectorSearch` needs Atlas; the free M0 tier is fine.
   Put the connection string in `DATABASE_URL`.
   - No Atlas yet? Set `VECTOR_SEARCH_MODE=local` to brute-force in Node
     (fine up to a few thousand covers), or run the
     `mongodb/mongodb-atlas-local` Docker image, which supports
     `$vectorSearch` locally.
2. Push the schema and create the vector index:
   ```bash
   npx prisma db push
   npm run vinyl:index
   ```
3. Seed. Spotify credentials are optional but recommended
   (`SPOTIFY_CLIENT_ID` / `SPOTIFY_CLIENT_SECRET`, server-only):
   ```bash
   npm run vinyl:seed -- --file seeds/albums.example.json --augment
   npm run vinyl:seed -- --artist "Amaarae" --artist "Little Simz" --limit 20
   npm run vinyl:seed -- --tag afrobeats --tag "neo soul" --limit 200 --augment
   ```
   MusicBrainz allows 1 request/second, so expect ~2-3 s per album. 1,000
   albums take about 45 minutes. Re-runs skip albums that are already embedded.
4. `npm run dev` and open `/scan-vinyl` on a phone. The camera needs HTTPS
   on anything except `localhost`; use `ngrok` / `cloudflared` or a Vercel
   preview to test on a device. The first visit downloads the q8 CLIP
   vision weights (about 88 MB) plus the ONNX/WASM runtime; the browser
   caches them afterwards. That is heavy on mobile data. See model proposal 2
   for a much smaller option.
5. **Calibrate.** Photograph 30-50 of your own records, name each file
   after its MusicBrainz release-group id, add a few records that are *not*
   in the index, then:
   ```bash
   npm run vinyl:eval -- --dir ./eval-photos
   ```
   Adjust `DEFAULT_THRESHOLDS` in `ranking.ts` so "wrong auto-matches" is 0.
   The current numbers are educated starting points, not measured values.

## Model proposals

### 1. Start with CLIP ViT-B/32 (default, shipped)
Pretrained, no training needed, 512-d, about 150-400 ms per frame on a mid-range
phone (WASM). Robust to lighting and angle, and it shares a space with text,
which unlocks two extras for free later:
- **Text search:** "the album with the baby in the pool" → text embedding →
  same vector index.
- **Zero-shot visual tags:** compare cover vectors to prompts such as
  "psychedelic artwork" or "minimal typography" to auto-tag covers for the
  genre/discovery side of the product.

### 2. A/B against DINOv2-small (already wired, one flag)
DINOv2 is self-supervised and often better at *instance* retrieval ("this
exact artwork, photographed") than CLIP. It is also about 4x smaller (22M
params, roughly 25 MB at q8 vs about 88 MB), which matters a lot for a
first-time mobile visitor. If it matches CLIP's accuracy on your photos, it
is the better default for mobile. To compare: seed with
`--model dinov2-small`, add a second vector index for 384 dims, and run
`vinyl:eval` with each model. Keep whichever wins top-1 on **your** photos.

### 3. Close the photo ↔ digital gap (the main accuracy lever)
Catalog vectors come from clean scans; queries come from phones (glare,
shrink-wrap, angle, sleeve wear). In order of effort:
1. **Augmented vectors** (shipped, `--augment`): 3 photo-like variants per
   cover stored as extra vectors.
2. **Multiple sources per album** (shipped): Cover Art Archive and Spotify
   artwork are different scans/crops of the same cover.
3. **User-confirmed scans** (shipped): every "Yes, that's it" stores the
   real camera vector (capped at 25 per album). Popular records get more
   accurate as people use the app.
4. **Fine-tune a projection head** (next): a small linear/MLP layer on top
   of frozen CLIP, trained contrastively on (phone photo, catalog cover)
   pairs. The `ScanEvent` confirmations *are* that training set. The output
   stays a vector, so nothing else changes.
5. **Pressing/edition disambiguation:** many releases share near-identical
   art. Group by release group (done), and later let the user pick the
   pressing (Discogs data) when it matters for pricing or collection features.

### 4. Cover localisation (replaces the guide square)
Train a tiny one-class detector ("record sleeve") or use a document-corner
detector to find the four corners, then perspective-warp to a flat square
before embedding. This lifts accuracy at angles and removes the need to aim.
The old `model/model_overview.py` (EfficientDet-Lite0, single
`vinyl_cover` class) is the right tool for *this* job, not for naming albums.

### 5. OCR / VLM fallback for long-tail records
When the result is `none` or stays `ambiguous`, OCR the crop (Tesseract.js
in-browser, or a vision LLM server-side) for artist and title text, then
search MusicBrainz and Spotify by text. If the user confirms, **seed that
album on the fly**, so the catalog grows from real usage.

## Scaling plan

| Stage | Catalog | What to do |
|---|---|---|
| **Now** | 1k-10k albums | Atlas M0/M10, current code. Seed from curated lists, tags and artists. |
| **Growth** | 100k-1M | Use **int8/binary quantization** in the Atlas index (`"quantization": "scalar"`), roughly 4× less RAM. Dedicated Search Nodes. Bulk-seed from the MusicBrainz database dump and CAA instead of the rate-limited API. Batch-embed on a GPU box (thousands/min) instead of a laptop. |
| **Large** | 1M-10M+ | Move to Matryoshka/PCA 256-d vectors, shard by popularity tier (hot index of most-scanned albums first, full index second), cache identify results per vector bucket. |

Product and data loop:
- **Catalog growth from demand:** log `none` results (vector + optional
  OCR text) and enrich the albums people actually try to scan first.
- **Metadata expansion (Genre Resource Platform):** `Album.genres/tags`
  already come from MusicBrainz. Next sources: Discogs (styles, label,
  pressing, credits), Wikidata/Wikipedia (history), Last.fm (similar
  artists). The `extra` JSON field holds these without schema churn. This
  feeds the "what makes it sound the way it does" discovery features
  directly from a scan.
- **Ops:** add a TTL index on `ScanEvent.createdAt` for unconfirmed scans,
  rate-limit `identify` per IP, and track `matched/ambiguous/none` rates and
  confirm/reject rates as the main quality dashboard.

## Licensing notes

- Cover Art Archive images are mostly uploaded by the community. Using them
  to compute vectors and linking to them is standard practice, but **don't
  re-host the images**; link to CAA/Spotify URLs (the code does this).
- Spotify's developer terms restrict using Spotify content to train ML
  models. We embed Spotify artwork with an off-the-shelf model (no training).
  If you fine-tune (proposal 3.4), train only on CAA images and user photos.
- MusicBrainz data is CC0.
