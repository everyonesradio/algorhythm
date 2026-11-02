// ** React/Next.js Imports
import React, { useEffect, useRef, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";

// ** Third-Party Imports
import {
  AnimatePresence,
  motion,
  useDragControls,
  type PanInfo,
} from "motion/react";

/**
 * Bottom sheet built on Motion (replaces MUI Drawer).
 *
 * - Rises with a soft, low-bounce spring; backdrop fades.
 * - Drag the grabber down (or flick) to dismiss; Escape and backdrop click
 *   also close. Content scrolls normally because only the grabber starts a
 *   drag (so the 3D canvas and lists keep their own gestures).
 * - Honours `<MotionConfig reducedMotion="user">` from _app: transforms are
 *   skipped, opacity still fades.
 * - Keep the sheet's data mounted until `onExitComplete` so the exit
 *   animation has something to render.
 */

const SPRING = { type: "spring", bounce: 0.12, duration: 0.4 } as const;
const EXIT = { duration: 0.22, ease: [0.32, 0.72, 0, 1] } as const;
/** Drag distance (px) or flick velocity (px/s) that dismisses the sheet. */
const DISMISS_OFFSET = 110;
const DISMISS_VELOCITY = 550;

const subscribe = () => () => undefined;
/** True on the client, false during SSR, without a setState-in-effect. */
const useIsClient = () =>
  useSyncExternalStore(
    subscribe,
    () => true,
    () => false
  );

type Props = {
  open: boolean;
  onClose: () => void;
  onExitComplete?: () => void;
  /** Accessible name announced by screen readers, e.g. "Album result". */
  label: string;
  children: React.ReactNode;
};

const Sheet: React.FC<Props> = ({
  open,
  onClose,
  onExitComplete,
  label,
  children,
}) => {
  const isClient = useIsClient();
  const dragControls = useDragControls();
  const panelRef = useRef<HTMLDivElement | null>(null);

  // Escape to close, scroll lock, and focus in/out while open.
  useEffect(() => {
    if (!open) return;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const { overflow } = document.body.style;
    document.body.style.overflow = "hidden";
    panelRef.current?.focus({ preventScroll: true });

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
      previouslyFocused?.focus?.({ preventScroll: true });
    };
  }, [open, onClose]);

  const onDragEnd = (_: unknown, info: PanInfo) => {
    if (info.offset.y > DISMISS_OFFSET || info.velocity.y > DISMISS_VELOCITY) {
      onClose();
    }
  };

  if (!isClient) return null;

  return createPortal(
    <AnimatePresence onExitComplete={onExitComplete}>
      {open && (
        <div
          key='sheet'
          className='fixed inset-0 z-50 flex items-end justify-center'
        >
          <motion.div
            key='backdrop'
            aria-hidden
            className='absolute inset-0 bg-black/40'
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, transition: EXIT }}
            transition={{ duration: 0.2 }}
            onClick={onClose}
          />
          <motion.div
            key='panel'
            ref={panelRef}
            role='dialog'
            aria-modal='true'
            aria-label={label}
            tabIndex={-1}
            className='relative flex max-h-[92dvh] w-full max-w-2xl flex-col rounded-t-2xl bg-white text-black shadow-2xl outline-none'
            initial={{ y: "100%", opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: "100%", opacity: 0, transition: EXIT }}
            transition={SPRING}
            drag='y'
            dragListener={false}
            dragControls={dragControls}
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={{ top: 0, bottom: 0.7 }}
            onDragEnd={onDragEnd}
          >
            {/* Grabber: the only place a drag starts. */}
            <div
              className='flex cursor-grab touch-none justify-center py-3 active:cursor-grabbing'
              onPointerDown={(e) => dragControls.start(e)}
            >
              <span className='h-1.5 w-10 rounded-full bg-gray-300' />
            </div>
            <div className='overflow-y-auto px-4 pb-6 sm:px-8'>{children}</div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body
  );
};

export default Sheet;
