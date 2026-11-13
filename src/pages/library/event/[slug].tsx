// ** React/Next.js Imports
import type { GetServerSideProps } from "next";
import Head from "next/head";
import Link from "next/link";
import { useRouter } from "next/router";
import React, {
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";

// ** Third-Party Imports
import { Loader2 } from "lucide-react";

// ** Custom Components, Hooks, Utils, etc.
import prisma from "@lib/prisma";
import { joinEvent, useJoinedEvent } from "@/hooks/use-joined-event";
import { albumPath } from "@/utils/album-path";
import { timeAgo } from "@/utils/time-ago";
import { api } from "@/utils/trpc";

// ** Icon Imports
import { IoArrowBack, IoCameraOutline } from "react-icons/io5";

type Props = {
  slug: string;
  name: string;
  venue: string | null;
  city: string | null;
  description: string | null;
  startsAt: string;
  endsAt: string;
  url: string;
};

const noop = () => () => {};

const NAMED_BY = {
  app: { label: "Named by the app", tone: "bg-black text-white" },
  suggestions: { label: "From suggestions", tone: "bg-black/10 text-black" },
  hand: { label: "Taught by the room", tone: "bg-emerald-600 text-white" },
} as const;

/** Event times, in the viewer's time zone (fixed to UTC on the server). */
const when = (startsAt: string, endsAt: string, timeZone?: string) => {
  const s = new Date(startsAt);
  const e = new Date(endsAt);
  const day = s.toLocaleDateString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone,
  });
  const time = (d: Date) =>
    d.toLocaleTimeString("en-GB", {
      hour: "2-digit",
      minute: "2-digit",
      timeZone,
    });
  return `${day}, ${time(s)}–${time(e)}${timeZone === "UTC" ? " UTC" : ""}`;
};

const Stat = ({
  value,
  label,
  note,
}: {
  value: string;
  label: string;
  note?: string;
}) => (
  <div className='flex min-w-0 flex-col gap-1 border-t border-black/15 pt-3'>
    <span className='font-eightbitdragon text-3xl tabular-nums sm:text-4xl'>
      {value}
    </span>
    <span className='text-sm font-medium'>{label}</span>
    {note && <span className='text-xs text-black/55'>{note}</span>}
  </div>
);

/**
 * A pop-up's page: what was found that night and the Stump the Algorithm
 * scoreboard. Updates itself while the event is on, so it can go up on the
 * shop's screen. Opening it from the QR at the venue (?join=CODE) credits
 * this phone's finds to the event.
 */
const EventPage = (props: Props) => {
  const router = useRouter();
  const joined = useJoinedEvent();
  const [joinMessage, setJoinMessage] = useState<string | null>(null);
  const tried = useRef(false);
  // Server and first client render agree on UTC; then switch to local time.
  const hydrated = useSyncExternalStore(
    noop,
    () => true,
    () => false
  );
  const timeZone = hydrated ? undefined : "UTC";

  const board = api.events.board.useQuery(
    { slug: props.slug },
    {
      // Live: refresh the scoreboard every 15 seconds.
      refetchInterval: (q) =>
        q.state.data?.event.status === "live" ? 15_000 : false,
      staleTime: 10_000,
    }
  );
  const join = api.events.join.useMutation();

  // Opened from the QR: join, then drop the code from the address bar.
  const code = typeof router.query.join === "string" ? router.query.join : null;
  useEffect(() => {
    if (!code || tried.current) return;
    tried.current = true;
    join.mutate(
      { slug: props.slug, code },
      {
        onSuccess: (e) => {
          joinEvent({
            slug: e.slug,
            name: e.name,
            code,
            endsAt: new Date(e.endsAt).toISOString(),
          });
          setJoinMessage(null);
        },
        onError: (err) => setJoinMessage(err.message),
        onSettled: () =>
          void router.replace(`/library/event/${props.slug}`, undefined, {
            shallow: true,
          }),
      }
    );
  }, [code, join, props.slug, router]);

  const data = board.data;
  const status = data?.event.status;
  const score = data?.score;
  const finds = data?.finds ?? [];
  const here = joined?.slug === props.slug;
  const place = [props.venue, props.city].filter(Boolean).join(", ");
  const title = `${props.name} · algoRhythm`;
  const description = `${place ? `${place}. ` : ""}${when(props.startsAt, props.endsAt, "UTC")}. Every record found at this Stump the Algorithm pop-up, and the scoreboard.`;

  return (
    <>
      <Head>
        <title>{title}</title>
        <meta name='description' content={description} />
        <link rel='canonical' href={props.url} />
        <meta property='og:title' content={props.name} />
        <meta property='og:description' content={description} />
        <meta property='og:url' content={props.url} />
      </Head>
      <main className='min-h-dvh bg-[#f4f0e8] pb-16 text-[#111]'>
        <div className='mx-auto flex max-w-5xl flex-col gap-8 px-4 pt-14 sm:px-6'>
          <nav>
            <Link
              href='/library'
              className='flex w-fit items-center gap-1.5 text-sm text-black/70 hover:text-black'
            >
              <IoArrowBack /> The Library
            </Link>
          </nav>

          {(here || join.isPending || joinMessage) && (
            <div
              role='status'
              className={`flex flex-wrap items-center justify-between gap-3 rounded-2xl p-4 ${
                joinMessage ? "bg-black/5" : "bg-emerald-600 text-white"
              }`}
            >
              <p className='text-sm'>
                {join.isPending
                  ? "Joining…"
                  : joinMessage
                    ? `Couldn't join: ${joinMessage}`
                    : "You're at this pop-up. Records you add tonight count here."}
              </p>
              {here && !joinMessage && (
                <Link
                  href='/scan-vinyl'
                  className='flex items-center gap-2 rounded-full bg-white px-4 py-2 text-sm font-medium text-black'
                >
                  <IoCameraOutline className='text-lg' /> Scan a record
                </Link>
              )}
            </div>
          )}

          <header className='flex flex-col gap-3'>
            <span className='flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-black/55'>
              Pop-up ·
              {status === "live" ? (
                <span className='flex items-center gap-1.5 text-emerald-700'>
                  <span className='h-2 w-2 animate-pulse rounded-full bg-emerald-600 motion-reduce:animate-none' />
                  Live now
                </span>
              ) : status === "upcoming" ? (
                "Upcoming"
              ) : status === "ended" ? (
                "Ended"
              ) : null}
            </span>
            <h1 className='font-eightbitdragon text-3xl leading-tight sm:text-5xl'>
              {props.name}
            </h1>
            <p className='text-black/70'>
              {place && `${place} · `}
              {when(props.startsAt, props.endsAt, timeZone)}
            </p>
            {props.description && (
              <p className='max-w-2xl text-black/70'>{props.description}</p>
            )}
          </header>

          <section aria-labelledby='score' className='flex flex-col gap-4'>
            <h2
              id='score'
              className='text-[11px] font-semibold uppercase tracking-[0.18em] text-black/55'
            >
              Stump the Algorithm · scoreboard
            </h2>
            {score ? (
              <div className='grid grid-cols-2 gap-4 sm:grid-cols-4'>
                <Stat value={String(score.added)} label='Records added' />
                <Stat value={String(score.app)} label='Named by the app' />
                <Stat
                  value={String(score.suggestions)}
                  label='From suggestions'
                />
                <Stat
                  value={String(score.hand)}
                  label='Taught by the room'
                  note={
                    score.stumpRate !== null
                      ? `Stump rate ${Math.round(score.stumpRate * 100)}%`
                      : undefined
                  }
                />
              </div>
            ) : (
              <div className='flex py-6'>
                <Loader2 className='h-6 w-6 animate-spin' />
              </div>
            )}
            <p className='max-w-2xl text-xs text-black/55'>
              How it&apos;s counted: every record added to the library at the
              pop-up counts once. The app either named it from the sleeve,
              someone picked it from the app&apos;s suggestions, or the app
              didn&apos;t know it and the room taught it. The stump rate is the
              share the room had to teach.
            </p>
          </section>

          <section aria-labelledby='finds' className='flex flex-col gap-4'>
            <h2
              id='finds'
              className='text-[11px] font-semibold uppercase tracking-[0.18em] text-black/55'
            >
              What was found{finds.length ? ` · ${finds.length}` : ""}
            </h2>
            {board.isLoading ? null : finds.length === 0 ? (
              <p className='text-black/60'>
                {status === "upcoming"
                  ? "Nothing yet: the pop-up hasn't started."
                  : status === "live"
                    ? "No records yet. Bring one to the table and try to stump it."
                    : "No records were added at this pop-up."}
              </p>
            ) : (
              <ol className='flex flex-col'>
                {finds.map((f, i) => {
                  const named =
                    NAMED_BY[(f.namedBy ?? "app") as keyof typeof NAMED_BY] ??
                    NAMED_BY.app;
                  const cover = f.coverUrl ?? f.album.coverUrl;
                  return (
                    <li
                      key={f.id}
                      className='border-b border-black/10 last:border-0'
                    >
                      <Link
                        href={albumPath(f.album)}
                        className='flex items-center gap-4 py-3 outline-none transition-colors hover:bg-black/[0.03] focus-visible:ring-2 focus-visible:ring-black'
                      >
                        <span className='w-6 shrink-0 text-right text-sm tabular-nums text-black/40'>
                          {i + 1}
                        </span>
                        <div className='h-14 w-14 shrink-0 overflow-hidden rounded-[3px] bg-[#d9d3c7] shadow-sm'>
                          {cover && (
                            // eslint-disable-next-line @next/next/no-img-element -- covers come from several CDNs
                            <img
                              src={cover}
                              alt=''
                              loading='lazy'
                              className='h-full w-full object-cover'
                            />
                          )}
                        </div>
                        <div className='flex min-w-0 flex-1 flex-col gap-0.5'>
                          <span className='truncate font-semibold'>
                            {f.album.title}
                          </span>
                          <span className='truncate text-sm text-black/60'>
                            {f.album.artist}
                            {f.album.releaseYear
                              ? ` · ${f.album.releaseYear}`
                              : ""}
                          </span>
                          {f.note && (
                            <span className='line-clamp-2 text-sm italic text-black/70'>
                              “{f.note}”
                            </span>
                          )}
                        </div>
                        <div className='flex shrink-0 flex-col items-end gap-1'>
                          <span
                            className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${named.tone}`}
                          >
                            {named.label}
                          </span>
                          <span className='text-xs text-black/45'>
                            {timeAgo(f.createdAt)}
                          </span>
                        </div>
                      </Link>
                    </li>
                  );
                })}
              </ol>
            )}
          </section>
        </div>
      </main>
    </>
  );
};

export const getServerSideProps: GetServerSideProps<Props> = async ({
  params,
  req,
  res,
}) => {
  const slug = String(params?.slug ?? "");
  if (!/^[a-z0-9-]{1,60}$/.test(slug)) return { notFound: true };
  const event = await prisma.event.findUnique({
    where: { slug },
    select: {
      slug: true,
      name: true,
      venue: true,
      city: true,
      description: true,
      startsAt: true,
      endsAt: true,
    },
  });
  if (!event) return { notFound: true };
  const proto =
    (req.headers["x-forwarded-proto"] as string | undefined)?.split(",")[0] ??
    "http";
  res.setHeader(
    "Cache-Control",
    "public, s-maxage=60, stale-while-revalidate=300"
  );
  return {
    props: {
      ...event,
      startsAt: event.startsAt.toISOString(),
      endsAt: event.endsAt.toISOString(),
      url: `${proto}://${req.headers.host}/library/event/${slug}`,
    },
  };
};

export default EventPage;
