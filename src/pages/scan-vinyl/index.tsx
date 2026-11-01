// ** React/Next.js Imports
import React, { useCallback, useEffect, useRef, useState } from "react";

// ** Third-Party Imports
import { Loader2 } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";

// ** Custom Components, Hooks, Utils, etc.
import CandidateSheet from "@/components/candidate-sheet";
import DigitalAlbum from "@/components/digital-album";
import { useCamera } from "@/hooks/use-camera";
import { useCoverEmbedder } from "@/hooks/use-cover-embedder";
import type { VinylMatch } from "@/types/api";
import {
  centerSquareCrop,
  computeGuideCrop,
  cropToImageData,
  frameDifference,
} from "@/utils/frame-crop";
import { api } from "@/utils/trpc";

// ** Icon Imports
import { IoImageOutline } from "react-icons/io5";

const DEFAULT_HINT = "Line up the cover inside the square";
/** Guide square size, as a fraction of the shorter screen side. */
const GUIDE_FRACTION = 0.72;
/** Delay between recognition attempts while scanning. */
const SCAN_INTERVAL_MS = 450;
/** Mean pixel change (0-255) above which the frame is "moving". */
const MOTION_THRESHOLD = 14;
/** Consecutive "matched" frames on the same album before we show it. */
const CONFIRM_FRAMES = 2;
/** Ambiguous frames in a row before we offer the candidate picker. */
const AMBIGUOUS_FRAMES = 6;

/** Soft, low-bounce spring used for the guide square lock-on. */
const LOCK_SPRING = { type: "spring", bounce: 0.2, duration: 0.3 } as const;

type Result = {
  scanId: string | null;
  match: VinylMatch;
  others: VinylMatch[];
};

const VinylScan = () => {
  const { videoRef, state: cameraState } = useCamera();
  const embedder = useCoverEmbedder();
  const identify = api.vinyl.identify.useMutation();
  const confirm = api.vinyl.confirm.useMutation();

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const prevFrame = useRef<ImageData | null>(null);
  const streak = useRef<{ albumId: string; count: number } | null>(null);
  const ambiguousStreak = useRef(0);
  const fileInput = useRef<HTMLInputElement | null>(null);

  const [hint, setHint] = useState(DEFAULT_HINT);
  /** A match is being confirmed across frames: the guide square "locks on". */
  const [locking, setLocking] = useState(false);
  // Sheet data stays mounted until its exit animation finishes, so each
  // sheet has a separate open flag. Scanning resumes once the data clears.
  const [result, setResult] = useState<Result | null>(null);
  const [resultOpen, setResultOpen] = useState(false);
  const [candidates, setCandidates] = useState<{
    scanId: string | null;
    matches: VinylMatch[];
  } | null>(null);
  const [candidatesOpen, setCandidatesOpen] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [busyUpload, setBusyUpload] = useState(false);

  const paused = !!result || !!candidates || busyUpload;
  // The scan loop reads this ref, so it sees pause changes without restarting.
  const pausedRef = useRef(paused);
  useEffect(() => {
    pausedRef.current = paused;
  }, [paused]);

  const showResult = useCallback(
    (scanId: string | null, matches: VinylMatch[], pick = 0) => {
      setConfirmed(false);
      setLocking(false);
      setCandidatesOpen(false);
      setResult({
        scanId,
        match: matches[pick],
        others: matches.filter((_, i) => i !== pick),
      });
      setResultOpen(true);
    },
    []
  );

  const showCandidates = useCallback(
    (scanId: string | null, matches: VinylMatch[]) => {
      setLocking(false);
      setCandidates({ scanId, matches });
      setCandidatesOpen(true);
    },
    []
  );

  /** Embed an ImageData and ask the server who it is. */
  const recognise = useCallback(
    async (image: ImageData) => {
      if (!embedder.model) return null;
      const vector = await embedder.embed(image);
      return identify.mutateAsync({ model: embedder.model, vector });
    },
    // identify.mutateAsync is stable across renders
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [embedder.embed, embedder.model]
  );

  // ---- live scanning loop -------------------------------------------------
  useEffect(() => {
    if (embedder.status !== "ready" || cameraState !== "live") return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;

    const tick = async () => {
      if (stopped) return;
      const video = videoRef.current;
      const canvas = canvasRef.current;
      try {
        if (!pausedRef.current && video && canvas && video.readyState >= 2) {
          const crop = computeGuideCrop(
            video.videoWidth,
            video.videoHeight,
            video.clientWidth,
            video.clientHeight,
            GUIDE_FRACTION
          );
          const frame = cropToImageData(video, crop, canvas);
          const moving =
            frame && prevFrame.current
              ? frameDifference(frame, prevFrame.current) > MOTION_THRESHOLD
              : false;
          prevFrame.current = frame;

          if (frame && moving) {
            setHint("Hold steady…");
          } else if (frame) {
            const res = await recognise(frame);
            if (res && !pausedRef.current && !stopped) handleLive(res);
          }
        }
      } catch (err) {
        console.error("[scan]", err);
      }
      timer = setTimeout(() => void tick(), SCAN_INTERVAL_MS);
    };

    const handleLive = (res: {
      status: string;
      scanId: string | null;
      matches: VinylMatch[];
    }) => {
      if (res.status === "matched" && res.matches[0]) {
        ambiguousStreak.current = 0;
        const id = res.matches[0].album.id;
        streak.current =
          streak.current?.albumId === id
            ? { albumId: id, count: streak.current.count + 1 }
            : { albumId: id, count: 1 };
        setLocking(true);
        setHint(`Found ${res.matches[0].album.title}…`);
        if (streak.current.count >= CONFIRM_FRAMES) {
          streak.current = null;
          showResult(res.scanId, res.matches);
        }
      } else if (res.status === "ambiguous") {
        streak.current = null;
        ambiguousStreak.current += 1;
        setLocking(false);
        setHint("Getting closer… fill the square with the cover");
        if (ambiguousStreak.current >= AMBIGUOUS_FRAMES) {
          ambiguousStreak.current = 0;
          showCandidates(res.scanId, res.matches);
        }
      } else {
        streak.current = null;
        ambiguousStreak.current = 0;
        setLocking(false);
        setHint(DEFAULT_HINT);
      }
    };

    timer = setTimeout(() => void tick(), SCAN_INTERVAL_MS);
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [
    embedder.status,
    cameraState,
    recognise,
    showResult,
    showCandidates,
    videoRef,
  ]);

  // ---- photo upload fallback ---------------------------------------------
  const onUpload = async (file: File) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    setBusyUpload(true);
    try {
      const bitmap = await createImageBitmap(file);
      const frame = cropToImageData(
        bitmap,
        centerSquareCrop(bitmap.width, bitmap.height, 0.95),
        canvas
      );
      bitmap.close();
      const res = frame ? await recognise(frame) : null;
      if (!res || res.status === "none" || res.matches.length === 0) {
        setHint("No match for that photo. Try a straight-on shot of the cover.");
      } else if (res.status === "matched") {
        showResult(res.scanId, res.matches);
      } else {
        showCandidates(res.scanId, res.matches);
      }
    } catch (err) {
      console.error("[upload]", err);
      setHint("Couldn't read that image.");
    } finally {
      setBusyUpload(false);
    }
  };

  // ---- confirmation (feeds real-world photos back into the index) --------
  const confirmAlbum = (scanId: string | null, albumId: string) => {
    setConfirmed(true);
    if (scanId) confirm.mutate({ scanId, albumId });
  };

  // Clear sheet data only after the close animation (unless it reopened).
  const onResultExit = () => {
    if (resultOpen) return;
    setResult(null);
    prevFrame.current = null;
    setHint(DEFAULT_HINT);
  };
  const onCandidatesExit = () => {
    if (!candidatesOpen) setCandidates(null);
  };

  const statusKey =
    embedder.status === "loading"
      ? "loading"
      : embedder.status === "error"
        ? "error"
        : busyUpload
          ? "busy"
          : hint;

  return (
    <div className='relative h-[100dvh] w-full overflow-hidden bg-black text-white'>
      <video
        ref={videoRef}
        playsInline
        muted
        autoPlay
        className='absolute inset-0 h-full w-full object-cover'
      />
      <canvas ref={canvasRef} className='hidden' />

      {/* Guide square with dimmed surroundings. Locks on while a match is
          being confirmed across frames. */}
      <div className='pointer-events-none absolute inset-0 flex items-center justify-center'>
        <motion.div
          className='rounded-xl border-2 shadow-[0_0_0_9999px_rgba(0,0,0,0.45)]'
          style={{
            width: `${GUIDE_FRACTION * 100}vmin`,
            height: `${GUIDE_FRACTION * 100}vmin`,
          }}
          initial={false}
          animate={{
            scale: locking ? 1.03 : 1,
            borderColor: locking
              ? "rgba(110, 231, 183, 1)"
              : "rgba(255, 255, 255, 0.9)",
          }}
          transition={LOCK_SPRING}
        />
      </div>

      {/* Status */}
      <div className='absolute left-0 right-0 top-0 flex flex-col items-center gap-1 p-4 pt-6 text-center'>
        <span className='font-eightbitdragon text-xl'>algoRhythm</span>
        {cameraState === "denied" && (
          <span className='text-sm text-red-300'>
            Camera access was blocked. Allow it in your browser settings, or
            upload a photo below.
          </span>
        )}
        {cameraState === "unavailable" && (
          <span className='text-sm text-red-300'>
            No camera found. Upload a photo of the cover instead.
          </span>
        )}
      </div>

      <div className='absolute bottom-0 left-0 right-0 flex flex-col items-center gap-3 p-6 pb-10'>
        <div className='flex h-9 items-center' aria-live='polite'>
          <AnimatePresence mode='wait' initial={false}>
            <motion.div
              key={statusKey}
              className={`flex items-center gap-2 rounded-full px-4 py-2 text-sm ${
                statusKey === "error" ? "bg-red-900/80" : "bg-black/60"
              }`}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.16 }}
            >
              {statusKey === "loading" ? (
                <>
                  <Loader2 className='h-4 w-4 animate-spin' />
                  Loading recognition model {Math.round(embedder.progress)}%
                </>
              ) : statusKey === "error" ? (
                <>Couldn&apos;t load the model: {embedder.error}</>
              ) : statusKey === "busy" ? (
                "Checking your photo…"
              ) : (
                hint
              )}
            </motion.div>
          </AnimatePresence>
        </div>

        <button
          className='flex items-center gap-2 rounded-full bg-white px-4 py-2 text-sm font-medium text-black transition-[transform,opacity] duration-[120ms] active:scale-[0.97] disabled:opacity-50'
          disabled={embedder.status !== "ready" || busyUpload}
          onClick={() => fileInput.current?.click()}
        >
          <IoImageOutline size={18} />
          Upload a photo
        </button>
        <input
          ref={fileInput}
          type='file'
          accept='image/*'
          className='hidden'
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (file) void onUpload(file);
          }}
        />
      </div>

      {candidates && (
        <CandidateSheet
          open={candidatesOpen}
          matches={candidates.matches}
          onPick={(i) => {
            const picked = candidates.matches[i];
            showResult(candidates.scanId, candidates.matches, i);
            confirmAlbum(candidates.scanId, picked.album.id);
          }}
          onDismiss={() => setCandidatesOpen(false)}
          onExitComplete={onCandidatesExit}
        />
      )}

      {result && (
        <DigitalAlbum
          open={resultOpen}
          onClose={() => setResultOpen(false)}
          onExitComplete={onResultExit}
          album={result.match.album}
          confirmed={confirmed}
          onConfirm={() => confirmAlbum(result.scanId, result.match.album.id)}
          onReject={
            result.others.length
              ? () => {
                  setResultOpen(false);
                  showCandidates(result.scanId, result.others);
                }
              : undefined
          }
        />
      )}
    </div>
  );
};

export default VinylScan;
