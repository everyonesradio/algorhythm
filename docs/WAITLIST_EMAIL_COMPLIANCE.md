# Waitlist email — compliance & security

What the early-access waitlist on the landing page needs before we collect
more emails and before we send the first one: the disclosures and consent the
law expects, the privacy policy, protection for the signup endpoint, and
deliverability once we start sending.

Status: **research, not legal advice.** Written on 2026-11-15; updated the
same day when the email provider changed from Loops to **Twilio SendGrid**
and the owner chose a single opt-in with a welcome email (no double opt-in).
Get a lawyer to check the privacy policy and the consent line before launch,
especially for the EU.

**How the sources were checked.** Direct page fetches to ico.org.uk,
legislation.gov.uk, eur-lex.europa.eu and ftc.gov were blocked by this
session's network settings, and in the SendGrid update so were
www.twilio.com and support.sendgrid.com, so no site was fetched directly.
Every claim below comes from search excerpts of the owning primary page (ICO,
EDPB/EUR-Lex, FTC, CPPA, CRTC/ISED, Google, Yahoo, RFC Editor, OWASP,
Cloudflare, Vercel, Twilio SendGrid docs and support; the SendGrid
unsubscribe pages also through Twilio's own documentation search tool), and
the URL is that page. None of the pages was read end to end. Claims marked **(unverified)**
come from memory, reasoning or non-primary sources and had no primary
excerpt. Re-check those, and the exact wording, on the live pages.

**Assumptions.** Everyone's Radio is established in the UK and has no office
in the EU. Most users are in the UK (pop-ups in Bristol and London), but the
form is open worldwide, so EU, US and Canadian addresses will come in. The
product is free, and nobody has bought anything when they sign up.

Labels used below:

- **Law**: a legal requirement in the named jurisdiction.
- **Provider**: required by Google, Yahoo or SendGrid to deliver mail, not by law.
- **Best practice**: recommended, not required.

**What we send.** The list is for algoRhythm project updates, launches and
events. Every email to it, including the one-time welcome email sent at
signup, is **direct marketing**: it needs consent under PECR, goes out with
an unsubscribe group, and carries a postal address in the footer.

## What to do

**Built in code** = being built now in this change. **Owner** = needs a
person in the SendGrid dashboard, DNS or Vercel.

### Before collecting more emails

1. **Consent line and privacy link at the form:** "We'll email you about
   early access, launches and algoRhythm events. Unsubscribe anytime.
   Privacy policy", kept out of the error slot so it always shows.
   (Law: UK/EU GDPR Art. 13, PECR reg. 22, CASL.) **Built in code.**
   `src/components/waitlist/index.tsx`
2. **Privacy policy page** at `/privacy`, linked from the form and footer.
   Checklist in section 2. (Law: UK/EU GDPR Art. 13.) **Built in code.**
   `src/pages/privacy.tsx`; the policy text itself still needs a lawyer.
3. **Consent evidence on each row:** `consentVersion`, `source`, signup
   time, `welcomeSentAt`. (Law: Art. 7(1); ICO consent-records guidance.)
   **Built in code.** `prisma/schema.prisma`,
   `src/server/api/routers/waitlist.ts`. Add `unsubscribedAt` when
   unsubscribes are synced back (item 18).
4. **Unique index on `email`** (`@unique`), catching the duplicate-key error
   so the response stays identical. De-duplicate existing rows before the
   index is built. (Best practice.) **Built in code.**
5. **Identical response for new and existing emails**, including timing.
   (Best practice, OWASP.) **Built in code.**
6. **Honeypot field.** (Best practice.) **Built in code.**
7. **One welcome email per address, ever.** Send only when the row is
   newly created (`welcomeSentAt` unset); a repeat signup sends nothing.
   This is the main list-bombing control now that there is no double
   opt-in (section 3). (Best practice.) **Built in code.**
8. **Deploy the schema.** **Owner:** run `npm run waitlist:dedupe` (dry
   run), then `npm run waitlist:dedupe -- --yes`, then `npx prisma db push`
   to build the unique index and add the new fields.
8a. **Fill in the contact details.** **Owner:** a real inbox in
   `src/config/legal.ts` (`contactEmail`, shown on `/privacy`), and the
   postal address in the template footer (`POSTAL_ADDRESS` in
   `emails/waitlist-welcome.html` and `.txt`).
8b. **Per-IP rate limit.** **Owner:** add a Vercel Firewall rate-limit rule
   matched to the `waitlist` tRPC path (section 3). (Best practice.)

### Before the first send

9. **Welcome email** at signup through the SendGrid v3 Mail Send API with a
   dynamic template, `asm.group_id` set, click and open tracking off per
   message (section 4). It is marketing: unsubscribe link and postal
   address in the footer. **Built in code.** The unsubscribe group env var
   (`SENDGRID_UNSUBSCRIBE_GROUP_ID`) is optional in code, but **must be set
   in production**: without it the `{{{unsubscribe}}}` link doesn't render
   and the email has no working opt-out.
10. **Verify the sender and authenticate the domain.** **Owner, SendGrid +
    DNS:** run Domain Authentication with automated security on a sending
    subdomain (add the CNAMEs SendGrid shows), add a DMARC TXT record at
    `p=none`, and use a From address on that domain as `SENDGRID_FROM_EMAIL`.
    Skip link branding while click tracking is off. (Provider: Google,
    Yahoo, SendGrid.)
11. **Restricted API key.** **Owner, SendGrid:** create a key with only
    *Mail Send* access, store it as `SENDGRID_API_KEY` in Vercel. IP Access
    Management doesn't suit Vercel's changing egress IPs; skip it.
    (Best practice.)
12. **Unsubscribe group.** **Owner, SendGrid:** create one (for example
    "algoRhythm updates"), put its ID in `SENDGRID_UNSUBSCRIBE_GROUP_ID`,
    and use the same group on every later send (launches, events).
    (Provider: Google, Yahoo. Law: CAN-SPAM, CASL, PECR.)
13. **Dynamic template.** **Owner, SendGrid:** create a dynamic template,
    paste the Handlebars HTML from `emails/waitlist-welcome.html` (with `{{{unsubscribe}}}` and
    the postal address in the footer), set the subject in the template
    settings (suggested: "You're on the algoRhythm waitlist"), use
    `emails/waitlist-welcome.txt` as the plain-text version, and put its ID in
    `SENDGRID_WAITLIST_TEMPLATE_ID`. Turn click tracking off in Settings >
    Tracking. (Provider; Law.)
14. **Check the one-click headers on a test send.** **Owner:** send yourself
    a signup to Gmail, "Show original", look for `List-Unsubscribe` and
    `List-Unsubscribe-Post`. SendGrid only documents adding them
    automatically with subscription tracking on; `asm` alone may not
    (section 4). (Provider: Google, Yahoo.)
15. **Spam rate under 0.1%, never 0.3%.** Set up Google Postmaster Tools.
    (Provider: Google.) **Owner.**
16. **ICO data protection fee.** (Law: UK. Tier 1 is £52.) **Owner**, about
    five minutes on the ICO site.
17. **Sign off on the Twilio DPA** and note SendGrid's US storage in the
    policy (section 2). **Owner.**

### Nice to have

18. **Sync unsubscribes back** from SendGrid (signed Event Webhook
    `group_unsubscribe` / `unsubscribe` events) into `unsubscribedAt`.
    Until then, SendGrid's suppression list is the source of truth: never
    send to this list except through SendGrid with the group set.
19. **Cloudflare Turnstile** (verified on the server) if bots get past the
    honeypot and rate limit. `src/components/waitlist/index.tsx`,
    `src/server/api/routers/waitlist.ts`
20. **Revisit double opt-in** if bounces, spam complaints or junk signups
    show up (section 3).
21. **Retention rule.** For example, delete the whole waitlist 12 months
    after launch unless people move onto the product list. Keep a
    suppression list. (Best practice.)
22. **A short age line in the privacy policy.** **Built in code**
    (`src/pages/privacy.tsx`). Do a quick UK Children's Code check before
    launching the full app.
23. **Move DMARC to `p=quarantine`, then `p=reject`**, once reports are clean.

## 1. Legal disclosures and consent at signup

### UK GDPR, DPA 2018 & PECR (primary jurisdiction)

- **A waitlist email is direct marketing.** PECR defines direct marketing as
  advertising or marketing material aimed at particular individuals, whatever
  the organisation
  ([ICO: identify direct marketing](https://ico.org.uk/for-organisations/direct-marketing-and-privacy-and-electronic-communications/direct-marketing-guidance/identify-direct-marketing/)).
  Service messages (administrative or customer-service messages) are not
  direct marketing, but a neutral tone alone doesn't make a message a service
  message, and any promotional element makes it marketing (same page).
  "Early access is open, come and scan", "we're launching" and event
  invites promote the product, so treat every waitlist email as direct
  marketing. That includes the welcome email: "you're on the list" plus
  anything about algoRhythm is promotional, so it needs the same consent,
  unsubscribe link and footer as later sends.
- **PECR reg. 22 needs consent or the soft opt-in.** Email marketing to
  individuals is allowed only with consent, or where every soft opt-in
  condition is met
  ([ICO: electronic mail marketing](https://ico.org.uk/for-organisations/direct-marketing-and-privacy-and-electronic-communications/guide-to-pecr/electronic-and-telephone-marketing/electronic-mail-marketing/)).
  The regulation's own text on legislation.gov.uk could not be fetched.
- **The soft opt-in probably doesn't fit.** It needs details collected
  directly "in the course of the sale or negotiations for the sale", only
  similar products marketed, and an opt-out offered at collection and in
  every message. The ICO counts signing up to a free trial, asking for a quote
  or asking for more details about what you offer as negotiation, but not
  general browsing or unrelated enquiries
  ([ICO: how do we comply with the PECR email rules](https://ico.org.uk/for-organisations/direct-marketing-and-privacy-and-electronic-communications/guidance-on-direct-marketing-using-electronic-mail/how-do-we-comply-with-the-pecr-electronic-mail-marketing-rules/)).
  An early-access signup for a free product sits close to "free trial", so
  it's arguable. But we offer no opt-out at collection today, and nothing has
  been sold. **Recommendation: rely on consent.** It costs one line of copy.
- **Lawful basis under UK GDPR: consent.** Where PECR requires consent, the
  ICO expects consent as the UK GDPR basis too
  ([ICO: choosing your lawful basis for direct marketing](https://ico.org.uk/for-organisations/direct-marketing-and-privacy-and-electronic-communications/sending-direct-marketing-choosing-your-lawful-basis/)).
  Consent has to be a clear affirmative act, specific and informed
  ([ICO: consent](https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/lawful-basis/a-guide-to-lawful-basis/consent/)).
  Typing an email into a form that exists only to receive early-access
  emails, under a line that says so, is a clear affirmative act. A separate
  unticked checkbox is needed only if we add a second purpose, such as a
  general newsletter or partner offers **(unverified interpretation)**.
- **Privacy information at collection (Art. 13).** When collecting from the
  person (for example, a form), we must tell them, at that point: who we are
  and how to contact us; the purpose and lawful basis; recipients; transfers
  outside the UK; the retention period; their rights, including withdrawing
  consent and complaining to the ICO; and whether automated decisions are
  made. A website notice is fine if we make people aware of it and it's easy
  to reach. Layered or just-in-time notices are encouraged
  ([ICO: right to be informed](https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/individual-rights/the-right-to-be-informed/),
  [checklists](https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/individual-rights/the-right-to-be-informed/checklists/)).
  So: a short line at the form plus a link to the full policy.
- **Records of consent (Art. 7(1)).** Keep who consented, when, how and what
  they were told. For online consent, store the submitted data with a
  timestamp linked to the version of the form, keep a master copy of each
  consent wording and privacy notice version, and record whether and when
  consent was withdrawn
  ([ICO: how should we obtain, record and manage consent](https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/lawful-basis/consent/how-should-we-obtain-record-and-manage-consent/)).
  `Waitlist { id, email, timestamp? }` covers who and roughly when, but not
  what they were told or how. Add `consentVersion`, `source`,
  `welcomeSentAt` and later `unsubscribedAt`, and keep old consent strings
  in the repo. Without double opt-in there's no proof the inbox owner
  typed the address; see section 3.
- **Data protection fee.** Most controllers that process personal data
  electronically pay the ICO a fee. Tier 1 (turnover up to £632,000 or up to
  10 staff) is £52. There is an exemption for processing *purely* to market
  your own goods and services
  ([ICO: data protection fee](https://ico.org.uk/for-organisations/data-protection-fee/),
  [guide](https://ico.org.uk/for-organisations/data-protection-fee/data-protection-fee/)).
  The wider app (scan events, analytics) probably goes beyond that exemption.
  Run the ICO self-assessment.
- **UK representative:** not needed if Everyone's Radio is UK-established
  (assumption above).

### EU GDPR

- **The same core rules apply** where EU GDPR applies: Art. 6(1)(a) consent,
  Art. 7(1) records, Art. 13 notice. The EUR-Lex text could not be fetched
  directly. The ICO points above mirror the same articles of the UK GDPR,
  which kept the EU wording.
- **Does it apply at all?** Art. 3(2) reaches non-EU controllers that offer
  goods or services, paid or free, to people in the EU. The EDPB looks for
  intent to target the EU, not just a website that can be reached from it
  ([EDPB Guidelines 3/2018 on territorial scope](https://edpb.europa.eu/sites/default/files/files/file1/edpb_guidelines_3_2018_territorial_scope_after_public_consultation_en_1.pdf)).
  A UK-focused waitlist that EU visitors happen to find is borderline. EU
  pop-ups, EU marketing or EU-language pages would tip it.
- **EU representative (Art. 27).** If Art. 3(2) applies, a representative in
  the EU is required unless the processing is occasional, involves no
  large-scale special-category data, *and* is unlikely to result in a risk to
  people's rights. All three conditions must hold
  ([EUR-Lex Art. 27](https://eur-lex.europa.eu/eli/reg/2016/679/art_27/oj);
  [EDPB 3/2018](https://www.edpb.europa.eu/sites/default/files/consultation/edpb_guidelines_3_2018_territorial_scope_en.pdf)).
  An email list is low risk, but a running waitlist is hard to call
  "occasional". **Recommendation:** don't target the EU yet. Get advice before
  EU pop-ups or EU marketing. Commercial representative services exist for
  small firms.
- **Double opt-in is not named as a requirement** in the GDPR text. Several
  EU regulators and courts treat it as the normal way to prove email consent
  **(unverified; no primary source fetched)**. The owner has chosen not to
  use it for now (section 3); revisit before targeting the EU.

### US: CAN-SPAM

- **Applies when we send, not at signup.** CAN-SPAM regulates commercial
  email messages. It has no signup-consent requirement for email.
- **Every commercial email needs:** honest headers and subject lines; a
  valid physical postal address (a PO box or private mailbox works); a clear,
  conspicuous way to opt out; opt-outs honoured within **10 business days**,
  with no fee, no data asked beyond the email address, and no steps beyond a
  reply or a single page; the opt-out working for at least 30 days after
  sending; and responsibility stays with us even when a vendor sends
  ([FTC: CAN-SPAM compliance guide](https://www.ftc.gov/business-guidance/resources/can-spam-act-compliance-guide-business);
  the address rule is confirmed in the
  [FTC's 2005 rule notice](https://www.ftc.gov/sites/default/files/documents/federal_register_notices/definitions-and-implementation-under-can-spam-act-16-cfr-part-316/050512canspamact.pdf)).
- **Action:** put a postal address in every marketing email's footer
  (SendGrid also says promotional email needs it, below). SendGrid's
  unsubscribe groups handle the opt-out mechanics.

### California: CCPA/CPRA

- **Applies only** to a for-profit business that does business in California
  and meets one of these: annual gross revenue over $25M (inflation-adjusted
  to $26,625,000 for 2025); buys, sells or shares personal information of
  100,000 or more consumers or households a year; or makes 50% or more of
  revenue from selling or sharing personal information
  ([CPPA: does my business need to comply](https://cppa.ca.gov/pdf/business_comply.pdf),
  [threshold adjustment](https://cppa.ca.gov/regulations/cpi_adjustment.html),
  [OAG CCPA page](https://oag.ca.gov/privacy/ccpa)).
- **Verdict:** very unlikely to apply. We don't sell or share the list, and
  revenue is nowhere near the threshold. Re-check if ad or partner tracking is
  ever added. A GDPR-grade policy covers what California users would expect.

### Canada: CASL

- **Express consent before sending.** The consent request must state the
  purpose, identify who is asking (with contact information, including a
  mailing address), and say the person can withdraw consent at any time
  ([CRTC: in-store WiFi advisory](https://crtc.gc.ca/eng/internet/wifi.htm),
  [CRTC Bulletin 2012-548](https://crtc.gc.ca/eng/archive/2012/2012-548.htm)).
  A PO box is accepted
  ([CRTC FAQ](https://crtc.gc.ca/eng/com500/faq500.htm)).
- **Every message** needs the sender's name, a mailing address, contact
  details valid for 60 days, and an unsubscribe mechanism. Express consent
  doesn't expire, but it can be withdrawn
  ([ISED: getting consent to send email](https://ised-isde.canada.ca/site/canada-anti-spam-legislation/en/getting-consent-send-email),
  [CRTC FAQ](https://crtc.gc.ca/eng/com500/faq500.htm)).
- **Effect on the form:** CASL is the strictest on wording. The line has to
  name the sender ("Everyone's Radio"), say we'll email them, say they can
  unsubscribe, and link to a page with our mailing address and contact
  details. Whether a linked address satisfies the "in the request" rule is
  **(unverified)**. Putting the address in the privacy policy that the line
  links to is the common approach.

### Children: COPPA, the UK Children's Code, GDPR Art. 8

- **COPPA** covers sites directed at children under 13, and general-audience
  sites with *actual knowledge* that they collect from under-13s. It doesn't
  require asking visitors' age. Asking for a date of birth creates actual
  knowledge if someone answers under 13
  ([FTC: COPPA FAQ](https://www.ftc.gov/business-guidance/resources/complying-coppa-frequently-asked-questions)).
  A vinyl app isn't child-directed. **Don't add an age question** to the
  waitlist; it would create knowledge without reducing risk.
- **UK Children's Code (AADC)** applies to online services *likely to be
  accessed* by under-18s, meaning more probable than not, not just services
  aimed at them. Streaming services and games are among its examples
  ([ICO: services covered by the code](https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/childrens-information/childrens-code-guidance-and-resources/age-appropriate-design-a-code-of-practice-for-online-services/services-covered-by-this-code/)).
  The waitlist alone barely touches this. Assess the full app (scans,
  library, notes) before launch.
- **Art. 8:** where consent is the basis and the service is offered directly
  to children, UK users under 13 need parental consent
  ([ICO: children and the UK GDPR](https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/childrens-information/children-and-the-uk-gdpr/)).
  EU member states set the age between 13 and 16 **(unverified; EUR-Lex not
  fetched)**.
- **Recommendation:** no age gate on the form. Add one line to the privacy
  policy ("algoRhythm isn't intended for children under 13. If you think a
  child has signed up, email us and we'll delete it"), and delete on notice.

### "No spam, ever." and recommended microcopy

- No regulator bans the phrase. The problem is what it leaves out: it doesn't
  say *what* we will send or *who* "we" are, and there is no privacy link.
  That information is what makes consent informed under PECR and GDPR and
  valid under CASL (sources above). It's also a promise we'd be judged
  against if a later email looks like marketing. "Spam" means different
  things to a recipient and a regulator.
- **Recommended line under the field**, kept separate from the error message:

  > We'll email you about early access, launches and algoRhythm events.
  > Unsubscribe anytime. [Privacy policy](/privacy)

  Keep "Free while we're in early access." as a separate selling line if
  wanted. Store the exact string as `consentVersion` (for example,
  `waitlist-v1`).
- **Sender name for CASL.** The line names algoRhythm, not Everyone's
  Radio. The privacy policy it links to must name Everyone's Radio as the
  sender with its mailing address; whether a linked page satisfies CASL is
  **(unverified)** (above).
- **Success state** stays as is: "You're on the list. We'll be in touch."
  The welcome email follows.
- **At pop-ups** (if emails are collected on paper or a tablet): use the same
  sentence, and `source: "popup-bristol"` and similar.

## 2. Privacy policy contents

The data flow today: email plus timestamp → tRPC on Vercel → MongoDB Atlas.
Vercel Web Analytics runs on every page. Twilio SendGrid gets the email
address to send the welcome email and later updates.

Points worth stating about the processors:

- **Vercel Web Analytics** uses no third-party cookies. It identifies
  visitors with a hash of the request that resets daily, records page views
  without tying them to an individual or IP address, and drops session data
  after 24 hours
  ([Vercel: analytics privacy](https://vercel.com/docs/analytics/privacy-policy)).
  Vercel's platform does process visitors' IP addresses for hosting
  ([Vercel privacy notice](https://vercel.com/legal/privacy-notice)), so name
  Vercel as hosting provider and processor.
- **MongoDB Atlas**: name it and its region (check the cluster region in the
  dashboard).
- **Twilio SendGrid** is a processor under Twilio's Data Protection Addendum,
  which covers SendGrid services by default with no action needed
  ([Twilio DPA](https://www.twilio.com/en-us/legal/data-protection-addendum),
  [Twilio: revised DPA for new SCCs](https://support.twilio.com/hc/en-us/articles/4405290603803-Revised-Data-Protection-Addendum-for-New-EU-Standard-Contractual-Clauses)).
  SendGrid stores data in the US by default; EU residency needs an EU
  regional subuser, which can't use Marketing features
  ([SendGrid: EU data residency FAQ](https://www.twilio.com/docs/sendgrid/data-residency/faq),
  [announcement](https://www.twilio.com/en-us/blog/products/data-residency-for-email-eu)).
  So the UK→US transfer must be in the policy. Safeguards: Twilio Inc. is
  certified to the EU-U.S. DPF and the UK Extension, and the DPA includes
  the 2021 EU SCCs and the ICO's UK Addendum (IDTA) for transfers without
  adequacy; SendGrid is not covered by Twilio's BCRs
  ([Twilio privacy notice](https://www.twilio.com/en-us/legal/privacy),
  [Twilio 2022 terms update](https://www.twilio.com/en-us/legal/online-terms-updates/2022),
  [Twilio TIA](https://help.twilio.com/articles/4407117654555-Transfer-Impact-Assessment-Twilio-s-Onward-Data-Transfers)).
  Policy wording: "Twilio SendGrid (USA) sends our emails. Transfers rely on
  the UK Extension to the EU-U.S. Data Privacy Framework and, where needed,
  the UK International Data Transfer Addendum." Which mechanism Twilio
  relies on first for UK data is **(unverified)**; check the current DPA.
  ([ICO checklist](https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/individual-rights/the-right-to-be-informed/checklists/)).

Minimal checklist (from the ICO Art. 13 checklist above):

- [ ] Who we are: Everyone's Radio, legal name, address, a contact email
- [ ] What we collect: email address, signup time, consent wording version,
      signup source, when the welcome email was sent, unsubscribe status
- [ ] Why, and on what basis: to email you about early access, project
      updates, launches and algoRhythm events, starting with a welcome email
      (consent); anonymous site analytics
- [ ] Who processes it: Vercel (hosting, analytics), MongoDB Atlas
      (database), Twilio SendGrid (email delivery)
- [ ] International transfers, if any, and the safeguard
- [ ] How long we keep it (for example, the list until 12 months after
      launch or until you unsubscribe; a suppression
      record after unsubscribing so we never email you again)
- [ ] Your rights: access, correction, erasure, objection, withdrawing
      consent at any time (unsubscribe link or email us), and complaining to
      the ICO
- [ ] No automated decision-making, no selling or sharing of the list
- [ ] Children line (see above)
- [ ] Mailing address, which CAN-SPAM and CASL also need
- [ ] Version and date, kept with the consent version

Rights requests: one mailbox (for example, privacy@), answered within one
month, the UK GDPR deadline **(unverified; ICO page not fetched)**. Deleting
means removing the row from `Waitlist` and any SendGrid record of the
address, while keeping a suppression entry.

## 3. Security protections for the signup endpoint

### Bot and abuse protection

- **Rate limiting first.** A Vercel Firewall rate-limit rule matched to the
  path (key: IP by default; JA4 or a header also available) takes effect
  without a redeploy. For limits in code, create the rule with a rate-limit ID
  and call `checkRateLimit` from `@vercel/firewall`, returning 429 when
  limited. Don't use in-memory counters. Counters are per region, and plan
  limits differ
  ([Vercel: add rate limiting](https://vercel.com/kb/guide/add-rate-limiting-vercel),
  [Vercel CLI firewall](https://vercel.com/docs/cli/firewall)). tRPC batches
  calls to `/api/trpc/...`, so match the `waitlist.add` path.
- **Vercel BotID** detects automated traffic but deliberately does no rate
  limiting. Vercel recommends using it together with rate limits
  ([Vercel: protect your app from bots](https://vercel.com/kb/guide/how-to-protect-your-ai-app-from-bots)).
- **Cloudflare Turnstile** works without Cloudflare DNS. The server-side
  `siteverify` check is mandatory, because the widget alone doesn't stop
  direct POSTs. Tokens last 300 seconds and are single use (reuse detection is
  eventually consistent). On `timeout-or-duplicate`, reset the widget
  ([Turnstile: validate the token](https://developers.cloudflare.com/turnstile/get-started/server-side-validation/)).
  hCaptcha docs were not checked.
- **Honeypot:** a hidden field that real users leave empty. If it's filled,
  return the normal success response and save nothing. Free and invisible,
  but it only stops naive bots **(best practice; no primary source fetched)**.

### Email enumeration

- OWASP: respond generically, in both HTTP and HTML, and make response times
  consistent so the existence of a record can't be inferred
  ([OWASP Authentication cheat sheet](https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html),
  [Forgot Password cheat sheet](https://cheatsheetseries.owasp.org/cheatsheets/Forgot_Password_Cheat_Sheet.html)).
  No sheet covers registration directly, but the same principle applies.
- **Current behaviour is good:** the same message either way. The remaining
  leak is timing: new emails do one extra write. With a unique index and
  "create, catch duplicate", both paths do one write attempt, which narrows
  the gap. Never send a "you're already on the list" email in response to
  a repeat submission: it leaks nothing to the submitter but lets anyone
  spam an inbox.

### No double opt-in: accepted risk

The owner chose single opt-in: signing up adds the person to the list at
once and triggers one welcome email. Double opt-in would hold them as
pending until they click a link.

- **What we give up.** Double opt-in stops list-bombing (a bot signing up a
  victim to many lists) and stops someone subscribing an address that isn't
  theirs, because only the inbox owner can confirm
  ([SendGrid: double opt-in](https://sendgrid.com/en-us/blog/double-opt-in-email)).
  Without it: (1) a typo or a stranger's address gets marketing it never
  asked for, which raises bounces and spam reports
  ([Google sender FAQ](https://support.google.com/a/answer/14229414?hl=en)
  on the spam-rate limits); (2) our consent record proves the address was
  typed into our form, not that its owner typed it, which is weaker
  evidence under Art. 7(1)
  ([ICO: consent records](https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/lawful-basis/consent/how-should-we-obtain-record-and-manage-consent/)).
  Not a legal requirement in the UK sources checked.
- **Mitigations in place:** the honeypot; the Vercel Firewall per-IP rate
  limit; **one welcome email per address, ever**, so repeat submissions
  can't be used to flood an inbox; and the unsubscribe link in the welcome
  email, so a wrongly added person can leave in one click and SendGrid
  suppresses them for every later send.
- **Watch for:** hard bounces or spam reports on welcome emails in the
  SendGrid activity and Postmaster Tools. If they appear, add double opt-in
  or Turnstile.

### Unique index

- Add `@unique` to `Waitlist.email`. On MongoDB, Prisma builds this as a
  unique index on `db push` **(unverified; Prisma docs not fetched)**. Building
  it fails if duplicates already exist, so de-duplicate first. Then use
  create-and-catch-`P2002`, or `upsert`, instead of findFirst-then-create.

### Normalisation caveats

- Keep the current trim plus lowercase. The local part is technically case
  sensitive, but in practice no major provider treats it that way
  **(unverified)**.
- **Don't strip dots or `+tags` in stored data.** Gmail ignores dots in
  consumer addresses, but dots do matter on Google Workspace (company)
  domains
  ([Gmail Help: dots don't matter](https://support.google.com/mail/answer/7436150?hl=en)).
  Plus-addressing rules differ by provider. Rewriting addresses can send mail
  to the wrong person, and the person loses their filter tag. If abuse shows
  up, store a separate `emailCanonical` (Gmail rules for `gmail.com` and
  `googlemail.com` only) for de-duplication or abuse checks, and keep
  emailing the address as typed.
- OWASP's email validation advice is to keep syntax checks loose and confirm
  ownership by sending a link
  ([OWASP Email Validation cheat sheet](https://cheatsheetseries.owasp.org/cheatsheets/Email_Validation_and_Verification_Cheat_Sheet.html)).
  That is double opt-in, which we've chosen not to do (above).

### Minimal data, and IP addresses

- An IP address is an online identifier and is personal data whenever it can
  single someone out, alone or combined with other data. Pseudonymised data
  is still personal data
  ([ICO: what are identifiers](https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/personal-information-what-is-it/what-is-personal-data/what-are-identifiers-and-related-factors/)).
- **Don't store IP addresses on `Waitlist`.** Let the Vercel Firewall rate
  limit on IP at the edge. If IPs are ever logged for abuse, say so in the
  policy and delete them within days. The consent record (timestamp, wording
  version, source) is the evidence we keep; IPs wouldn't prove who typed
  the address either.

## 4. Email sending and deliverability

### Authentication: SPF, DKIM, DMARC

- **Google (from 1 February 2024):** every sender needs SPF *or* DKIM.
  Bulk senders (about 5,000 or more messages a day to personal Gmail
  accounts, counted across the primary domain; once you're classified as a
  bulk sender, it's permanent) need SPF *and* DKIM, plus DMARC (`p=none` is
  allowed), with the From domain aligned to SPF or DKIM. DKIM keys must be at
  least 1024 bits. Since November 2025, Google has stepped up enforcement,
  including temporary and permanent rejections
  ([Gmail sender guidelines](https://support.google.com/mail/answer/81126?hl=en),
  [FAQ](https://support.google.com/a/answer/14229414?hl=en),
  [Google announcement](https://blog.google/products-and-platforms/products/gmail/gmail-security-authentication-spam-protection/)).
  (Provider.)
- **Yahoo:** bulk senders need SPF and DKIM and a valid DMARC policy of at
  least `p=none` that passes, with From-domain alignment. Yahoo publishes no
  volume threshold
  ([Yahoo sender best practices](https://senders.yahooinc.com/best-practices/),
  [FAQ](https://senders.yahooinc.com/faqs/)). (Provider.)
- We'll be far below 5,000 a day at first. Set up all three anyway: it's
  cheap, and SendGrid provides the SPF and DKIM records.
- RFC 7208 (SPF), RFC 6376 (DKIM) and RFC 7489 (DMARC) were not opened. The
  provider requirements above are what's enforced in practice.

### One-click unsubscribe and spam rate

- **RFC 8058:** the message carries `List-Unsubscribe` (an HTTPS URL) and
  `List-Unsubscribe-Post: List-Unsubscribe=One-Click`. Both headers must be
  covered by a valid DKIM signature. The POST carries no cookies, and the
  sender must not answer with a redirect
  ([RFC 8058](https://www.rfc-editor.org/rfc/rfc8058.html)).
- **Google:** List-Unsubscribe headers on all commercial and promotional
  messages per RFC 8058, plus a visible unsubscribe link. Not needed on
  transactional mail. Keep the user-reported spam rate below 0.1%, and never
  let it reach 0.3%. Above 0.3%, a sender can't get mitigation help, and the
  rate has to stay under 0.3% for seven days to recover
  ([Gmail sender FAQ](https://support.google.com/mail/answer/14229414?hl=en)).
  The one-click deadline of 1 June 2024 is **(unverified)**.
- **Yahoo:** a body link alone isn't enough. It needs a List-Unsubscribe
  header, preferably RFC 8058, on marketing mail only. Honour requests within
  2 days. Its FAQ gives June 2024 for one-click enforcement
  ([Yahoo best practices](https://senders.yahooinc.com/best-practices/),
  [FAQ](https://senders.yahooinc.com/faqs/)). (Provider.)

### SendGrid setup

**Domain authentication.** With automated security (the default), SendGrid
gives CNAME records, including two DKIM `_domainkey` CNAMEs it rotates, and
manages SPF and DKIM behind them. A DNS host that rejects underscores in
CNAMEs can't use automated security. Link branding is a separate, optional
set of CNAMEs used for click and open tracking links. DMARC is a TXT record
at `_dmarc` that we add ourselves, starting at `p=none`
([SendGrid: domain authentication](https://www.twilio.com/docs/sendgrid/ui/account-and-settings/how-to-set-up-domain-authentication),
[API: authenticate a domain](https://www.twilio.com/docs/sendgrid/api-reference/domain-authentication/authenticate-a-domain),
[SendGrid: DMARC](https://www.twilio.com/docs/sendgrid/ui/sending-email/dmarc)).
(Provider.)

**Sender identity.** Only verified senders can send. Single Sender
Verification is for testing and has no SPF or DKIM; after domain
authentication, any address on that domain is verified automatically
([SendGrid: single sender](https://www.twilio.com/docs/sendgrid/ui/sending-email/sender-verification),
[Sender Identity](https://www.twilio.com/docs/sendgrid/for-developers/sending-email/sender-identity)).
SendGrid also says every promotional email needs a physical mailing address
for CAN-SPAM and CASL
([SendGrid: Senders API](https://www.twilio.com/docs/sendgrid/api-reference/senders)).
(Provider; Law.)

**API key.** Create a Restricted Access key with only *Mail Send* (the
`mail.send` scope)
([SendGrid: API key permissions](https://www.twilio.com/docs/sendgrid/api-reference/api-key-permissions)).
IP Access Management is account-wide and blocks the UI, API and SMTP from
any IP not on the list
([SendGrid: IP Access Management](https://www.twilio.com/docs/sendgrid/ui/account-and-settings/ip-access-management));
Vercel functions have no fixed egress IP, so leave it off unless we add one.
(Best practice.)

**Dynamic template.** Handlebars is supported in the subject, HTML and text
of a dynamic template; values come from `dynamic_template_data` in each
personalization. Set the subject in the template's settings, either fixed
or as `{{{subject}}}` (triple braces so `&` and quotes aren't escaped). A
subject in the template overrides one set in the API request
([SendGrid: send with dynamic templates](https://www.twilio.com/docs/sendgrid/ui/sending-email/how-to-send-an-email-with-dynamic-templates),
[Using Handlebars](https://www.twilio.com/docs/sendgrid/for-developers/sending-email/using-handlebars),
[Support: dynamic subject](https://support.sendgrid.com/hc/en-us/articles/1260802535110-How-to-Create-a-Dynamic-Email-Subject-Line)).
The plain-text version is generated from the HTML by default
(`generate_plain_content: true`); paste our own text instead if the
generated one reads badly
([API: create template version](https://www.twilio.com/docs/sendgrid/api-reference/transactional-templates-versions/create-a-new-transactional-template-version)).
The unsubscribe link goes in the footer as `{{{unsubscribe}}}` (the group
link; `{{{unsubscribe_preferences}}}` is the preferences page). It only
renders when the request carries `asm.group_id`
([Support: unsubscribe methods](https://support.sendgrid.com/hc/en-us/articles/1260806604209-Unsubscribe-Methods),
[Support: activate unsubscribe links](https://support.sendgrid.com/hc/en-us/articles/9521401569691-Activate-Global-Group-Unsubscribe-Links)).
Those pages name the `{{unsubscribe}}` and `{{unsubscribe_preferences}}`
substitutions; the triple-brace form for dynamic templates is what keeps
the URL unescaped, but the exact tag wasn't readable in the excerpts
**(partly verified; confirm the link renders on a test send)**.

**Tracking: keep click and open tracking off.** Click tracking rewrites
every link to go through SendGrid's servers; open tracking adds a pixel
([SendGrid: SMTP filters](https://www.twilio.com/docs/sendgrid/for-developers/sending-email/smtp-filters),
[Tracking settings](https://www.twilio.com/docs/sendgrid/ui/account-and-settings/tracking)).
That's tracking we'd have to disclose and gain little from at this size,
rewritten links look less trustworthy, and they break with an SSL error if
link branding is half set up
([Support: ERR_CERT_COMMON_NAME_INVALID](https://support.sendgrid.com/hc/en-us/articles/10143238252571-Troubleshooting-ERR-CERT-COMMON-NAME-INVALID-Error-in-Links)).
So the code sends `tracking_settings: { click_tracking: { enable: false,
enable_text: false }, open_tracking: { enable: false } }` per message
([Mail Send API](https://www.twilio.com/docs/sendgrid/api-reference/mail-send/mail-send)).
Also turn click tracking off in Settings > Tracking. Whether the per-message
flag overrides an account-level "on" wasn't confirmed: check a test
message's links. (Best practice.)

**Unsubscribes and one-click.**

- **What SendGrid adds automatically:** with *Subscription Tracking* on,
  SendGrid inserts an unsubscribe link and both `List-Unsubscribe` and
  `List-Unsubscribe-Post: List-Unsubscribe=One-Click`. A click puts the
  address on the **Global** unsubscribe list, which blocks all mail to it.
  Without subscription tracking, a Mail Send API sender can set both headers
  itself in the `headers` object (both `mailto:` and `https:` forms). Inbox
  providers decide whether to show the button, and the header doesn't
  replace a visible link in the body
  ([SendGrid: List-Unsubscribe](https://www.twilio.com/docs/sendgrid/ui/sending-email/list-unsubscribe),
  [Subscription tracking](https://www.twilio.com/docs/sendgrid/ui/sending-email/subscription-tracking),
  [Support: adding the headers](https://support.sendgrid.com/hc/en-us/articles/20631133325467-How-to-Add-List-Unsubscribe-and-List-Unsubscribe-Post-Headers-to-Comply-with-MailBox-Provider-Requirements)).
- **Unsubscribe groups (ASM):** send with `asm.group_id`; the group
  unsubscribe tags in the body only fill in when a group ID is passed, and
  a group unsubscribe stops only that group
  ([SendGrid: unsubscribe groups](https://www.twilio.com/docs/sendgrid/ui/sending-email/create-and-manage-unsubscribe-groups),
  [Suppression groups](https://www.twilio.com/docs/sendgrid/for-developers/sending-email/suppressions),
  [Support: ASM tags](https://support.sendgrid.com/hc/en-us/articles/1260802535250-How-to-Use-ASM-Tags-to-Add-Group-Unsubscribes-to-Emails)).
- **Does `asm` add the one-click headers? Not documented.** SendGrid's
  support article says that for SMTP and Web API sends the headers are added
  automatically **only when subscription tracking is enabled**, and
  otherwise "will need to be enabled yourself"; only Marketing Campaigns
  adds them with group unsubscribes
  ([Support: adding the headers](https://support.sendgrid.com/hc/en-us/articles/20631133325467-How-to-Add-List-Unsubscribe-and-List-Unsubscribe-Post-Headers-to-Comply-with-MailBox-Provider-Requirements)).
  A Twilio FAQ hints a group can be linked in the header
  ([Twilio: Gmail & Yahoo FAQ](https://www.twilio.com/en-us/blog/insights/gmail-yahoo-updates-faq)).
  **Treat `asm` as body link only until a test send shows the headers.**
- **If the test shows no headers**, two options. (a) Turn on
  `subscription_tracking` per message: SendGrid then adds both headers, but
  its one-click is a **global** unsubscribe and it appends its own link
  unless placed with a substitution tag. Simplest, and fine while we have
  one list. (b) Set both headers in `headers` ourselves, pointing the HTTPS
  one at our own endpoint that accepts the RFC 8058 POST (no redirect) and
  adds the address to the group's suppressions via the API. More work,
  needs a second API key scope. Google and Yahoo require one-click for bulk
  senders; we're far below 5,000 a day, so (a) or (b) can follow the first
  sends, but do it before launch volume.
- **Every send to this list** (welcome, launches, events) uses the same
  group, a visible unsubscribe link and the postal address. (Law: CAN-SPAM,
  CASL, PECR. Provider: Google, Yahoo.)

| SendGrid handles | We do |
| --- | --- |
| SPF and DKIM via automated-security CNAMEs, DKIM key rotation | Add the CNAMEs and a DMARC TXT in DNS; move DMARC to quarantine, then reject |
| Suppresses bounces, spam reports and unsubscribes (global and per group) automatically ([SendGrid: suppressions](https://www.twilio.com/docs/sendgrid/ui/sending-email/index-suppressions)) | Mirror unsubscribes into `unsubscribedAt` via the signed Event Webhook ([Event Webhook reference](https://www.twilio.com/docs/sendgrid/for-developers/tracking-events/event)) |
| Group unsubscribe link via `{{{unsubscribe}}}` when `asm.group_id` is set; one-click headers only documented with subscription tracking | Set the group on every send; check headers on a test send; add them (option a or b) if missing |
| Rendering the dynamic template | Keep the Handlebars HTML in the repo; paste it in; keep the template ID in env |
| — | One welcome email per address, honeypot, Vercel rate limit, Postmaster Tools, postal address in every footer |

## 5. How others word it (non-authoritative)

Not done. The pages couldn't be fetched in this session, and quoting them from
memory would break the primary-sources rule. Worth doing by hand: load two or
three consumer waitlists and note whether they name the sender, say what
they'll send, and link a policy.

## Sources

All were accessed on 2026-11-15 through search excerpts. Direct fetches of
ico.org.uk, legislation.gov.uk, eur-lex.europa.eu, ftc.gov, www.twilio.com
and support.sendgrid.com failed (blocked by the network settings).

UK (ICO)
- https://ico.org.uk/for-organisations/direct-marketing-and-privacy-and-electronic-communications/guide-to-pecr/electronic-and-telephone-marketing/electronic-mail-marketing/
- https://ico.org.uk/for-organisations/direct-marketing-and-privacy-and-electronic-communications/guidance-on-direct-marketing-using-electronic-mail/how-do-we-comply-with-the-pecr-electronic-mail-marketing-rules/
- https://ico.org.uk/for-organisations/direct-marketing-and-privacy-and-electronic-communications/direct-marketing-guidance/identify-direct-marketing/
- https://ico.org.uk/for-organisations/direct-marketing-and-privacy-and-electronic-communications/sending-direct-marketing-choosing-your-lawful-basis/
- https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/lawful-basis/a-guide-to-lawful-basis/consent/
- https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/lawful-basis/consent/how-should-we-obtain-record-and-manage-consent/
- https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/individual-rights/the-right-to-be-informed/
- https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/individual-rights/the-right-to-be-informed/checklists/
- https://ico.org.uk/for-organisations/data-protection-fee/
- https://ico.org.uk/for-organisations/data-protection-fee/data-protection-fee/
- https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/childrens-information/childrens-code-guidance-and-resources/age-appropriate-design-a-code-of-practice-for-online-services/services-covered-by-this-code/
- https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/childrens-information/children-and-the-uk-gdpr/
- https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/personal-information-what-is-it/what-is-personal-data/what-are-identifiers-and-related-factors/

EU
- https://eur-lex.europa.eu/eli/reg/2016/679/art_27/oj
- https://edpb.europa.eu/sites/default/files/files/file1/edpb_guidelines_3_2018_territorial_scope_after_public_consultation_en_1.pdf
- https://www.edpb.europa.eu/sites/default/files/consultation/edpb_guidelines_3_2018_territorial_scope_en.pdf

US
- https://www.ftc.gov/business-guidance/resources/can-spam-act-compliance-guide-business
- https://www.ftc.gov/sites/default/files/documents/federal_register_notices/definitions-and-implementation-under-can-spam-act-16-cfr-part-316/050512canspamact.pdf
- https://www.ftc.gov/business-guidance/resources/complying-coppa-frequently-asked-questions
- https://cppa.ca.gov/pdf/business_comply.pdf
- https://cppa.ca.gov/regulations/cpi_adjustment.html
- https://oag.ca.gov/privacy/ccpa

Canada
- https://crtc.gc.ca/eng/com500/faq500.htm
- https://crtc.gc.ca/eng/internet/wifi.htm
- https://crtc.gc.ca/eng/archive/2012/2012-548.htm
- https://ised-isde.canada.ca/site/canada-anti-spam-legislation/en/getting-consent-send-email

Mailbox providers & standards
- https://support.google.com/mail/answer/81126?hl=en
- https://support.google.com/a/answer/14229414?hl=en
- https://support.google.com/mail/answer/7436150?hl=en
- https://blog.google/products-and-platforms/products/gmail/gmail-security-authentication-spam-protection/
- https://senders.yahooinc.com/best-practices/
- https://senders.yahooinc.com/faqs/
- https://www.rfc-editor.org/rfc/rfc8058.html

Security & platform
- https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html
- https://cheatsheetseries.owasp.org/cheatsheets/Forgot_Password_Cheat_Sheet.html
- https://cheatsheetseries.owasp.org/cheatsheets/Email_Validation_and_Verification_Cheat_Sheet.html
- https://developers.cloudflare.com/turnstile/get-started/server-side-validation/
- https://vercel.com/kb/guide/add-rate-limiting-vercel
- https://vercel.com/docs/cli/firewall
- https://vercel.com/kb/guide/how-to-protect-your-ai-app-from-bots
- https://vercel.com/docs/analytics/privacy-policy
- https://vercel.com/legal/privacy-notice

Twilio SendGrid
- https://www.twilio.com/docs/sendgrid/ui/account-and-settings/how-to-set-up-domain-authentication
- https://www.twilio.com/docs/sendgrid/api-reference/domain-authentication/authenticate-a-domain
- https://www.twilio.com/docs/sendgrid/ui/sending-email/dmarc
- https://www.twilio.com/docs/sendgrid/ui/sending-email/sender-verification
- https://www.twilio.com/docs/sendgrid/for-developers/sending-email/sender-identity
- https://www.twilio.com/docs/sendgrid/api-reference/senders
- https://www.twilio.com/docs/sendgrid/api-reference/api-key-permissions
- https://www.twilio.com/docs/sendgrid/ui/account-and-settings/ip-access-management
- https://www.twilio.com/docs/sendgrid/ui/sending-email/how-to-send-an-email-with-dynamic-templates
- https://www.twilio.com/docs/sendgrid/for-developers/sending-email/using-handlebars
- https://support.sendgrid.com/hc/en-us/articles/1260802535110-How-to-Create-a-Dynamic-Email-Subject-Line
- https://www.twilio.com/docs/sendgrid/api-reference/transactional-templates-versions/create-a-new-transactional-template-version
- https://www.twilio.com/docs/sendgrid/api-reference/mail-send/mail-send
- https://www.twilio.com/docs/sendgrid/for-developers/sending-email/smtp-filters
- https://www.twilio.com/docs/sendgrid/ui/account-and-settings/tracking
- https://support.sendgrid.com/hc/en-us/articles/10143238252571-Troubleshooting-ERR-CERT-COMMON-NAME-INVALID-Error-in-Links
- https://www.twilio.com/docs/sendgrid/ui/sending-email/list-unsubscribe
- https://www.twilio.com/docs/sendgrid/ui/sending-email/subscription-tracking
- https://support.sendgrid.com/hc/en-us/articles/20631133325467-How-to-Add-List-Unsubscribe-and-List-Unsubscribe-Post-Headers-to-Comply-with-MailBox-Provider-Requirements
- https://www.twilio.com/docs/sendgrid/ui/sending-email/create-and-manage-unsubscribe-groups
- https://www.twilio.com/docs/sendgrid/for-developers/sending-email/suppressions
- https://support.sendgrid.com/hc/en-us/articles/1260802535250-How-to-Use-ASM-Tags-to-Add-Group-Unsubscribes-to-Emails
- https://support.sendgrid.com/hc/en-us/articles/1260806604209-Unsubscribe-Methods
- https://support.sendgrid.com/hc/en-us/articles/9521401569691-Activate-Global-Group-Unsubscribe-Links
- https://www.twilio.com/docs/sendgrid/ui/sending-email/index-suppressions
- https://www.twilio.com/docs/sendgrid/for-developers/tracking-events/event
- https://www.twilio.com/en-us/blog/insights/gmail-yahoo-updates-faq
- https://sendgrid.com/en-us/blog/double-opt-in-email
- https://www.twilio.com/docs/sendgrid/data-residency/faq
- https://www.twilio.com/en-us/blog/products/data-residency-for-email-eu

Twilio legal
- https://www.twilio.com/en-us/legal/data-protection-addendum
- https://support.twilio.com/hc/en-us/articles/4405290603803-Revised-Data-Protection-Addendum-for-New-EU-Standard-Contractual-Clauses
- https://www.twilio.com/en-us/legal/privacy
- https://www.twilio.com/en-us/legal/online-terms-updates/2022
- https://help.twilio.com/articles/4407117654555-Transfer-Impact-Assessment-Twilio-s-Onward-Data-Transfers

Not reached or not checked: legislation.gov.uk (PECR reg. 22 text), the full
EUR-Lex GDPR text (Arts. 6, 7, 8, 13), RFC 7208, RFC 6376 and RFC 7489,
hCaptcha docs, Prisma docs, the comparison waitlists, the full current
Twilio DPA text, and the exact dynamic-template unsubscribe tag (braces
were stripped from the excerpts). The SendGrid pages were seen only as
search excerpts, partly through Twilio's documentation search tool.
