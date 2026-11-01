// ** React/Next.js Imports
import Link from "next/link";
import React, { useState } from "react";

// ** Third-Party Imports
import { ArrowRight, Check, Loader2 } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";

// ** Custom Components, Hooks, Utils, etc.
import { api } from "@/utils/trpc";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

const swap = {
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -6 },
  transition: { type: "spring", bounce: 0.12, duration: 0.35 },
} as const;

/**
 * Early-access signup. Errors and success render inline (no toasts) so the
 * result stays where the user is looking, and success hands them straight to
 * the demo instead of auto-redirecting.
 */
const Waitlist = () => {
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const join = api.waitlist.add.useMutation();

  const onSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const value = email.trim();
    if (!EMAIL_RE.test(value)) {
      setError("That email doesn't look quite right.");
      return;
    }
    setError(null);
    join.mutate(
      { email: value },
      {
        onError: () =>
          setError("We couldn't save your spot. Give it another try."),
      }
    );
  };

  return (
    <div className='w-full max-w-md'>
      <AnimatePresence mode='wait' initial={false}>
        {join.isSuccess ? (
          <motion.div
            key='done'
            {...swap}
            className='flex flex-col gap-4 rounded-2xl border-2 border-black bg-white p-5 text-left'
            role='status'
          >
            <div className='flex items-center gap-3'>
              <span className='flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-black text-white'>
                <Check className='h-4 w-4' strokeWidth={3} />
              </span>
              <p className='font-semibold'>
                You&apos;re on the list. We&apos;ll be in touch.
              </p>
            </div>
            <p className='text-sm text-black/70'>
              While you wait, the demo is open. Grab a record off the shelf.
            </p>
            <Link
              href='/scan-vinyl'
              className='flex h-12 items-center justify-center gap-2 rounded-full bg-black px-5 font-semibold text-white transition-transform duration-[120ms] active:scale-[0.97]'
            >
              Scan your first record
              <ArrowRight className='h-4 w-4' />
            </Link>
          </motion.div>
        ) : (
          <motion.form
            key='form'
            {...swap}
            onSubmit={onSubmit}
            noValidate
            className='flex flex-col gap-2'
          >
            <div className='flex flex-col gap-2 sm:flex-row'>
              <label className='sr-only' htmlFor='waitlist-email'>
                Email address
              </label>
              <input
                id='waitlist-email'
                name='email'
                type='email'
                inputMode='email'
                autoComplete='email'
                placeholder='you@example.com'
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  if (error) setError(null);
                }}
                aria-invalid={!!error}
                aria-describedby='waitlist-msg'
                disabled={join.isPending}
                // 16px text on mobile stops iOS zooming in on focus.
                className='h-12 w-full rounded-full border-2 border-black bg-white px-5 text-base placeholder:text-black/40 focus:outline-none focus-visible:ring-4 focus-visible:ring-black/15 disabled:opacity-60 aria-[invalid=true]:border-red-600'
              />
              <button
                type='submit'
                disabled={join.isPending}
                className='flex h-12 shrink-0 items-center justify-center gap-2 rounded-full bg-black px-6 font-semibold text-white transition-transform duration-[120ms] active:scale-[0.97] disabled:opacity-80'
              >
                {join.isPending ? (
                  <>
                    <Loader2 className='h-4 w-4 animate-spin' />
                    Saving your spot…
                  </>
                ) : (
                  "Get early access"
                )}
              </button>
            </div>
            <p
              id='waitlist-msg'
              aria-live='polite'
              className={`min-h-5 px-5 text-sm ${error ? "text-red-700" : "text-black/60"}`}
            >
              {error ?? "Free while we're in early access. No spam, ever."}
            </p>
          </motion.form>
        )}
      </AnimatePresence>
    </div>
  );
};

export default Waitlist;
