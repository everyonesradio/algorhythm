// ** React/Next.js Imports
import { useEffect, useRef, useState } from "react";

// ** Third-Party Imports
import MobileDetect from "mobile-detect";

type CameraState = "starting" | "live" | "denied" | "unavailable";

/**
 * Attaches the device camera to a <video>. Uses the rear camera on phones and
 * asks for a high resolution so the cover crop has plenty of detail.
 */
export const useCamera = () => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [state, setState] = useState<CameraState>("starting");

  useEffect(() => {
    let stream: MediaStream | null = null;
    let cancelled = false;

    const start = async () => {
      if (!navigator.mediaDevices?.getUserMedia) {
        setState("unavailable");
        return;
      }
      const isMobile = !!new MobileDetect(navigator.userAgent).mobile();
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: {
            facingMode: isMobile ? { ideal: "environment" } : "user",
            width: { ideal: 1280 },
            height: { ideal: 1280 },
          },
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        const video = videoRef.current;
        if (video) {
          video.srcObject = stream;
          await video.play().catch(() => undefined);
        }
        setState("live");
      } catch (err) {
        const name = (err as DOMException)?.name;
        setState(
          name === "NotAllowedError" || name === "SecurityError"
            ? "denied"
            : "unavailable"
        );
      }
    };

    void start();
    return () => {
      cancelled = true;
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  return { videoRef, state };
};
