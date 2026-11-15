// ** React/Next.js Imports
import Head from "next/head";
import Link from "next/link";
import React from "react";

// ** Custom Components, Hooks, Utils, etc.
import { LEGAL } from "@/config/legal";

// ** Icon Imports
import { IoArrowBack } from "react-icons/io5";

const Section = ({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) => (
  <section className='flex flex-col gap-2'>
    <h2 className='text-lg font-semibold'>{title}</h2>
    <div className='flex flex-col gap-2 text-black/75'>{children}</div>
  </section>
);

/** What we collect, why, who handles it and how to get it removed. */
const Privacy = () => (
  <>
    <Head>
      <title>Privacy · algoRhythm</title>
      <meta
        name='description'
        content='What algoRhythm collects, why, and how to get it changed or deleted.'
      />
    </Head>
    <main className='min-h-dvh bg-[#f4f0e8] pb-16 text-[#111]'>
      <article className='mx-auto flex max-w-2xl flex-col gap-8 px-4 pt-14 sm:px-6'>
        <nav>
          <Link
            href='/'
            className='flex w-fit items-center gap-1.5 text-sm text-black/70 hover:text-black'
          >
            <IoArrowBack /> algoRhythm
          </Link>
        </nav>
        <header className='flex flex-col gap-3'>
          <h1 className='font-eightbitdragon text-3xl sm:text-4xl'>Privacy</h1>
          <p className='text-black/70'>
            algoRhythm is made by {LEGAL.company}. We collect as little as we
            can. This page says what, why, and how to have it removed. Last
            updated {LEGAL.policyUpdated}.
          </p>
        </header>

        <Section title='The waitlist'>
          <p>
            When you join, we store your email address, when you signed up, and
            which version of the sign-up wording you saw (so we can show what
            you agreed to).
          </p>
          <p>
            We use it to email you about early access, launches and algoRhythm
            events, because you asked us to. We don&apos;t sell it or share it
            for anyone else&apos;s marketing.
          </p>
          <p>
            Every email has an unsubscribe link, or you can email us. We keep
            your address until you unsubscribe or ask us to delete it, or until
            we close the list. We delete it within 30 days of you asking.
          </p>
        </Section>

        <Section title='Scanning records'>
          <p>
            The photo of a sleeve is processed on your phone and never uploaded.
            We store a numeric fingerprint of the cover and which album it
            matched, to improve recognition. It isn&apos;t linked to your email
            or name.
          </p>
          <p>
            Records you scan appear in the public library without any name. Your
            browser keeps a random key so you can remove your own finds; we
            store only a scrambled version of it.
          </p>
        </Section>

        <Section title='Who handles it for us'>
          <ul className='list-disc pl-5'>
            <li>Vercel: hosting, and visit counts without cookies.</li>
            <li>MongoDB Atlas: our database.</li>
            <li>Twilio SendGrid: sending our emails.</li>
          </ul>
          <p>
            They process data only on our instructions, under data processing
            agreements. Some of it may be handled outside the UK, under the
            safeguards UK law requires (such as standard contractual clauses).
          </p>
        </Section>

        <Section title='Your rights'>
          <p>
            You can ask for a copy of your data, to correct it, to delete it, or
            to stop us using it, and you can withdraw consent at any time. Email{" "}
            <a
              href={`mailto:${LEGAL.contactEmail}`}
              className='underline underline-offset-2'
            >
              {LEGAL.contactEmail}
            </a>
            . If you&apos;re unhappy with our answer, you can complain to the{" "}
            <a
              href='https://ico.org.uk/make-a-complaint/'
              className='underline underline-offset-2'
              target='_blank'
              rel='noreferrer'
            >
              Information Commissioner&apos;s Office
            </a>
            .
          </p>
        </Section>

        <Section title='Children'>
          <p>
            algoRhythm isn&apos;t aimed at children under 13, and we don&apos;t
            knowingly collect their details. If you think a child has joined the
            waitlist, email us and we&apos;ll delete it.
          </p>
        </Section>
      </article>
    </main>
  </>
);

export default Privacy;
