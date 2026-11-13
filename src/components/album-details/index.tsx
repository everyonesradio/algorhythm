// ** React/Next.js Imports
import React, { useState } from "react";

// ** Custom Components, Hooks, Utils, etc.
import { dugTimes } from "@/components/library-card";
import { useDeviceKey } from "@/hooks/use-device-key";
import { timeAgo } from "@/utils/time-ago";
import { api } from "@/utils/trpc";

/** Tracks shown before "Show all". */
const TRACKS_SHOWN = 6;

const Heading = ({ children }: { children: React.ReactNode }) => (
  <h3 className='text-[11px] font-semibold uppercase tracking-[0.12em] text-gray-500'>
    {children}
  </h3>
);

const Skeleton = () => (
  <div className='flex flex-col gap-2' aria-hidden='true'>
    <div className='h-3 w-2/3 animate-pulse rounded bg-gray-200' />
    <div className='h-3 w-full animate-pulse rounded bg-gray-200' />
    <div className='h-3 w-5/6 animate-pulse rounded bg-gray-200' />
  </div>
);

/**
 * Below the streaming links: recent finds from the library, a short "about"
 * from Wikipedia, the tracklist, and links to reviews elsewhere. Everything
 * is sourced and kept short; sections with nothing to show are left out.
 */
const AlbumDetails: React.FC<{ albumId: string }> = ({ albumId }) => {
  const deviceKey = useDeviceKey();
  const [allTracks, setAllTracks] = useState(false);
  const utils = api.useUtils();

  const details = api.library.details.useQuery(
    { albumId },
    // Its own request: a cold cache means MusicBrainz + Wikipedia calls.
    { staleTime: Infinity, retry: 1, trpc: { context: { skipBatch: true } } }
  );
  const finds = api.library.finds.useQuery(
    { albumId, deviceKey },
    { enabled: !!deviceKey, staleTime: 30_000 }
  );
  const report = api.library.report.useMutation({
    onSuccess: () => void utils.library.finds.invalidate({ albumId }),
  });

  const d = details.data;
  const tracks = d?.tracklist?.tracks ?? [];
  const shownTracks = allTracks ? tracks : tracks.slice(0, TRACKS_SHOWN);
  const about = [
    d?.about.album && { label: "The album", ...d.about.album },
    d?.about.artist && { label: "The artist", ...d.about.artist },
  ].filter(Boolean) as { label: string; text: string; url: string }[];
  const findList = finds.data?.finds ?? [];

  return (
    <div className='flex w-full max-w-sm flex-col gap-6 pt-6 text-left'>
      {findList.length > 0 && (
        <section className='flex flex-col gap-2'>
          <Heading>
            In the library · {dugTimes(finds.data?.count ?? 0).toLowerCase()}
          </Heading>
          <ul className='flex flex-col gap-2'>
            {findList.map((f) => (
              <li key={f.id} className='flex flex-col gap-0.5'>
                {f.note ? (
                  <p className='text-sm'>“{f.note}”</p>
                ) : (
                  <p className='text-sm text-gray-500'>Added without a note</p>
                )}
                <span className='flex items-center gap-2 text-xs text-gray-500'>
                  {timeAgo(f.createdAt)}
                  {!f.mine && f.note && (
                    <button
                      type='button'
                      className='underline-offset-2 hover:underline disabled:no-underline disabled:opacity-60'
                      disabled={f.reported || report.isPending || !deviceKey}
                      onClick={() =>
                        deviceKey && report.mutate({ entryId: f.id, deviceKey })
                      }
                    >
                      {f.reported ? "Reported" : "Report"}
                    </button>
                  )}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {details.isLoading ? (
        <Skeleton />
      ) : (
        <>
          {about.length > 0 && (
            <section className='flex flex-col gap-3'>
              <Heading>About</Heading>
              {about.map((a) => (
                <p key={a.label} className='text-sm leading-relaxed'>
                  {a.text}{" "}
                  <a
                    href={a.url}
                    target='_blank'
                    rel='noreferrer'
                    className='whitespace-nowrap text-gray-500 underline underline-offset-2'
                  >
                    From Wikipedia
                  </a>
                </p>
              ))}
            </section>
          )}

          {tracks.length > 0 && (
            <section className='flex flex-col gap-2'>
              <Heading>Tracklist · {tracks.length} tracks</Heading>
              <ol className='flex flex-col'>
                {shownTracks.map((t, i) => (
                  <li
                    key={`${t.position}-${i}`}
                    className='flex items-baseline gap-3 border-b border-gray-100 py-1.5 text-sm last:border-0'
                  >
                    <span className='w-8 shrink-0 tabular-nums text-gray-400'>
                      {t.position}
                    </span>
                    <span className='min-w-0 flex-1 truncate'>{t.title}</span>
                    {t.length && (
                      <span className='shrink-0 tabular-nums text-gray-400'>
                        {t.length}
                      </span>
                    )}
                  </li>
                ))}
              </ol>
              {tracks.length > TRACKS_SHOWN && (
                <button
                  type='button'
                  className='self-start text-sm text-gray-600 underline underline-offset-2'
                  onClick={() => setAllTracks((v) => !v)}
                >
                  {allTracks ? "Show less" : `Show all ${tracks.length} tracks`}
                </button>
              )}
              {!d?.tracklist?.sides && (
                <p className='text-xs text-gray-400'>
                  Side split varies by pressing, so tracks are listed in order.
                </p>
              )}
            </section>
          )}

          {(d?.more.links.length ?? 0) > 0 && (
            <section className='flex flex-col gap-2'>
              <Heading>Reviews &amp; more</Heading>
              <div className='flex flex-wrap gap-1.5'>
                {d!.more.links.map((l) => {
                  const score = d!.more.scores.find((s) => s.source === l.name);
                  return (
                    <a
                      key={l.url}
                      href={l.url}
                      target='_blank'
                      rel='noreferrer'
                      className='rounded-full border border-gray-300 px-3 py-1 text-sm transition-colors hover:border-black'
                    >
                      {l.name}
                      {score && (
                        <span className='ml-1 tabular-nums text-gray-500'>
                          {score.score}
                        </span>
                      )}
                    </a>
                  );
                })}
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
};

export default AlbumDetails;
