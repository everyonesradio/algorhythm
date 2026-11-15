# Waitlist email — compliance & security

What the early-access waitlist on the landing page needs before we collect
more emails and before we send the first one: the disclosures and consent the
law expects, the privacy policy, protection for the signup endpoint, and
deliverability once we start sending.

Status: **research, not legal advice.** Written on 2026-11-15. Nothing in the
code has changed. Get a lawyer to check the privacy policy and the consent
line before launch, especially for the EU.

**How the sources were checked.** Direct page fetches to ico.org.uk,
legislation.gov.uk, eur-lex.europa.eu and ftc.gov were blocked by this
session's network settings, so no other site was fetched directly. Every claim
below comes from search excerpts of the owning primary page (ICO, EDPB/EUR-Lex,
FTC, CPPA, CRTC/ISED, Google, Yahoo, RFC Editor, OWASP, Cloudflare, Vercel,
Loops), and the URL is that page. None of the pages was read end to end. Claims
marked **(unverified)** come from memory or reasoning and had no primary
excerpt. Re-check those, and the exact wording, on the live pages.

**Assumptions.** Everyone's Radio is established in the UK and has no office
in the EU. Most users are in the UK (pop-ups in Bristol and London), but the
form is open worldwide, so EU, US and Canadian addresses will come in. The
product is free, and nobody has bought anything when they sign up.

Labels used below:

- **Law**: a legal requirement in the named jurisdiction.
- **Provider**: required by Google, Yahoo or Loops to deliver mail, not by law.
- **Best practice**: recommended, not required.

## What to do

### Before collecting more emails

1. **Say what we'll send and link a privacy policy at the form.** Replace
   "No spam, ever." with a consent line. Keep it out of the error slot, which
   currently replaces the helper text, so it shows even when there's an
   error. (Law: UK/EU GDPR Art. 13, PECR reg. 22, CASL.)
   `src/components/waitlist/index.tsx`
2. **Publish a privacy policy page** and link it from the form and the footer.
   The checklist is in section 2. (Law: UK/EU GDPR Art. 13.) New
   `src/pages/privacy.tsx`; link from `src/pages/index.tsx`.
3. **Record consent evidence on each row:** when the person signed up, which
   version of the consent wording they saw, where (landing page or pop-up),
   and later the confirmed and unsubscribed timestamps. (Law: Art. 7(1); ICO
   consent-records guidance.) `prisma/schema.prisma` (`Waitlist`),
   `src/server/api/routers/waitlist.ts`
4. **Rate-limit the mutation.** Use a Vercel Firewall rate-limit rule on the
   tRPC path, or `@vercel/firewall` `checkRateLimit` in the procedure. The
   endpoint is public and unthrottled today. (Best practice.)
   `src/server/api/routers/waitlist.ts`, Vercel dashboard
5. **Add a unique index on `email`** (`@unique`), and catch the duplicate-key
   error so the response stays identical. findFirst-then-create races under
   concurrent requests. Remove any existing duplicates before the index is
   built. (Best practice.) `prisma/schema.prisma`,
   `src/server/api/routers/waitlist.ts`
6. **Keep the identical response for new and existing emails.** It already
   behaves this way. Make sure response time doesn't leak the difference
   either. (Best practice, OWASP.) `src/server/api/routers/waitlist.ts`

### Before the first send

7. **Double opt-in.** Send a confirmation email and mark the person subscribed
   only after they click the link. Loops runs double opt-in only on its *form*
   endpoint, not on its contacts API, so this decides how we integrate.
   (Best practice. Strongest protection against list-bombing and against
   someone signing up an address that isn't theirs.)
   `src/server/api/routers/waitlist.ts`
8. **Authenticate the sending domain.** Set up SPF, DKIM and DMARC (start at
   `p=none`) on a sending subdomain using the records Loops provides.
   (Provider: Google and Yahoo. Loops supplies the records; we add them in DNS.)
   DNS for the Everyone's Radio domain
9. **One-click unsubscribe** (`List-Unsubscribe` + `List-Unsubscribe-Post`,
   RFC 8058), plus a visible unsubscribe link and a postal address in every
   marketing email. (Provider: Google and Yahoo. Law: CAN-SPAM, CASL, PECR.)
   Check that Loops adds the headers; see section 4. Loops templates.
10. **Keep the user-reported spam rate under 0.1%, and never let it reach
    0.3%.** Set up Google Postmaster Tools. (Provider: Google.)
11. **Check whether we owe the ICO data protection fee.** (Law: UK. Tier 1 is
    £52.) Takes about five minutes on the ICO site.

### Nice to have

12. **Cloudflare Turnstile** (verified on the server) or a honeypot field if
    bots get past rate limiting. `src/components/waitlist/index.tsx`,
    `src/server/api/routers/waitlist.ts`
13. **Retention rule.** For example, delete unconfirmed signups after 30 days
    and the whole waitlist 12 months after launch, unless people move onto the
    product list. Keep a suppression list of people who unsubscribed.
    (Best practice.) Cron or script, `prisma/schema.prisma`
14. **A short age line in the privacy policy** ("algoRhythm isn't intended
    for children under 13"). Do a quick UK Children's Code check before
    launching the full app. `src/pages/privacy.tsx`
15. **Move DMARC to `p=quarantine`, then `p=reject`**, once reports are clean.

## 1. Legal disclosures and consent at signup

### UK GDPR, DPA 2018 & PECR (primary jurisdiction)

- **A waitlist email is direct marketing.** PECR defines direct marketing as
  advertising or marketing material aimed at particular individuals, whatever
  the organisation
  ([ICO: identify direct marketing](https://ico.org.uk/for-organisations/direct-marketing-and-privacy-and-electronic-communications/direct-marketing-guidance/identify-direct-marketing/)).
  Service messages (administrative or customer-service messages) are not
  direct marketing, but a neutral tone alone doesn't make a message a service
  message, and any promotional element makes it marketing (same page).
  "Early access is open, come and scan" and "we're launching" promote the
  product, so treat every waitlist email as direct marketing. A pure
  double-opt-in confirmation email, with no promotion, is a service message
  **(unverified interpretation)**.
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
  what they were told or how. Add `consentVersion`, `source`, `confirmedAt`
  and `unsubscribedAt`, and keep old consent strings in the repo.
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
  **(unverified; no primary source fetched)**. It's on the list anyway, for
  security.

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
- **Action:** put a postal address in the Loops footer. Loops handles the
  opt-out mechanics.

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

  > We'll email you about early access and launch news from Everyone's Radio.
  > Unsubscribe anytime. [Privacy policy](/privacy)

  Keep "Free while we're in early access." as a separate selling line if
  wanted. Store the exact string as `consentVersion` (for example,
  `waitlist-v1`).
- **Success state** after double opt-in: "Check your inbox to confirm your
  spot." After the person confirms: "You're on the list. We'll email you when
  early access opens."
- **At pop-ups** (if emails are collected on paper or a tablet): use the same
  sentence, and `source: "popup-bristol"` and similar.

## 2. Privacy policy contents

The data flow today: email plus timestamp → tRPC on Vercel → MongoDB Atlas.
Vercel Web Analytics runs on every page. A future email provider (Loops) will
get the email address.

Points worth stating about the processors:

- **Vercel Web Analytics** uses no third-party cookies. It identifies
  visitors with a hash of the request that resets daily, records page views
  without tying them to an individual or IP address, and drops session data
  after 24 hours
  ([Vercel: analytics privacy](https://vercel.com/docs/analytics/privacy-policy)).
  Vercel's platform does process visitors' IP addresses for hosting
  ([Vercel privacy notice](https://vercel.com/legal/privacy-notice)), so name
  Vercel as hosting provider and processor.
- **MongoDB Atlas** and **Loops**: name them, and say which region the data
  is stored in. The Atlas cluster region and Loops' storage location need
  checking in the dashboards. If either is outside the UK, the policy has to
  mention the transfer and its safeguard
  ([ICO checklist](https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/individual-rights/the-right-to-be-informed/checklists/)).

Minimal checklist (from the ICO Art. 13 checklist above):

- [ ] Who we are: Everyone's Radio, legal name, address, a contact email
- [ ] What we collect: email address, signup time, consent wording version,
      signup source, confirmation and unsubscribe status
- [ ] Why, and on what basis: to email you about early access and launch
      (consent); anonymous site analytics
- [ ] Who processes it: Vercel (hosting, analytics), MongoDB Atlas
      (database), Loops (email, once added)
- [ ] International transfers, if any, and the safeguard
- [ ] How long we keep it (for example, unconfirmed signups 30 days; the list
      until 12 months after launch or until you unsubscribe; a suppression
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
means removing the row from `Waitlist` and the contact from Loops, while
keeping a suppression entry.

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
- Loops' guidance also lists captcha or bot protection and blocking
  disposable addresses as ways to keep a list clean
  ([Loops: maintaining a clean list](https://loops.so/docs/deliverability/maintaining-a-clean-list)).

### Email enumeration

- OWASP: respond generically, in both HTTP and HTML, and make response times
  consistent so the existence of a record can't be inferred
  ([OWASP Authentication cheat sheet](https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html),
  [Forgot Password cheat sheet](https://cheatsheetseries.owasp.org/cheatsheets/Forgot_Password_Cheat_Sheet.html)).
  No sheet covers registration directly, but the same principle applies.
- **Current behaviour is good:** the same message either way. The remaining
  leak is timing: new emails do one extra write. With a unique index and
  "create, catch duplicate", both paths do one write attempt, which narrows
  the gap. With double opt-in, never send a "you're already on the list"
  email to the address in response to a form submission without a rate limit.

### Double opt-in

- Stops list-bombing (a bot signing up a victim to many lists) and stops
  someone subscribing an address that isn't theirs. Only the inbox owner can
  confirm. Loops calls it a deliverability and list-quality improvement
  ([Loops: double opt-in](https://loops.so/docs/contacts/double-opt-in)).
- **Loops specifics:** double opt-in is enabled on *form endpoints only*. The
  contacts API (create and update) is not gated yet. Pending contacts show as
  "Pending", don't fire `contact.created` until confirmed, and expose
  `optInStatus` on Find contact. It applies to marketing sends only, not
  transactional email (same page). So either post to the Loops form endpoint
  from the server, or send our own confirmation as a Loops transactional
  email and only add confirmed people to the audience.
- Not a legal requirement in the UK sources checked. It is best practice, and
  it gives the strongest consent evidence.

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
  That is double opt-in again.

### Minimal data, and IP addresses

- An IP address is an online identifier and is personal data whenever it can
  single someone out, alone or combined with other data. Pseudonymised data
  is still personal data
  ([ICO: what are identifiers](https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/personal-information-what-is-it/what-is-personal-data/what-are-identifiers-and-related-factors/)).
- **Don't store IP addresses on `Waitlist`.** Let the Vercel Firewall rate
  limit on IP at the edge. If IPs are ever logged for abuse, say so in the
  policy and delete them within days. The consent record (timestamp, wording
  version, source, confirmation click) is enough evidence without them.

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
  cheap, and Loops provides the records.
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

### Loops vs us

| Loops handles | We do |
| --- | --- |
| Generates SPF, DKIM, MX and a default DMARC record (relaxed alignment); SPF lives on `envelope.<sending domain>`, so it doesn't clash with ours; DKIM signing ([Loops: sending domain](https://loops.so/docs/sending-domain), [DMARC & DKIM](https://loops.so/docs/deliverability/dmarc-dkim-setup)) | Add the records to our DNS on a sending subdomain (for example, `mail.`), click Verify, and move DMARC from `p=none` to quarantine to reject over time |
| Bounces, unsubscribes and spam complaints are processed and suppressed automatically ([Loops: double opt-in / list docs](https://loops.so/docs/contacts/double-opt-in)) | Keep our database in sync: mark `unsubscribedAt` (Loops webhooks are signed; verify them) |
| Marketing emails get a preference-centre and unsubscribe link automatically | A postal address in the footer (CAN-SPAM, CASL); honest subject lines |
| Double opt-in, **form endpoint only** | Choose the integration path so double opt-in actually runs (section 3) |
| — | Postmaster Tools, watching the spam rate |

Whether Loops adds `List-Unsubscribe-Post` to marketing sends automatically
wasn't confirmed by a first-party Loops page. Its glossary explains the
headers
([Loops: one-click unsubscribe](https://loops.so/glossary/one-click-unsubscribe)),
but doesn't say Loops sets them. **Check this before the first send:** send a
test campaign to a Gmail account, use "Show original", and look for both
headers and a DKIM `h=` tag that covers them.

## 5. How others word it (non-authoritative)

Not done. The pages couldn't be fetched in this session, and quoting them from
memory would break the primary-sources rule. Worth doing by hand: load two or
three consumer waitlists and note whether they name the sender, say what
they'll send, and link a policy.

## Sources

All were accessed on 2026-11-15 through search excerpts. Direct fetches of
ico.org.uk, legislation.gov.uk, eur-lex.europa.eu and ftc.gov failed (blocked
by the network settings).

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

Loops
- https://loops.so/docs/sending-domain
- https://loops.so/docs/deliverability/dmarc-dkim-setup
- https://loops.so/docs/contacts/double-opt-in
- https://loops.so/docs/deliverability/maintaining-a-clean-list
- https://loops.so/glossary/one-click-unsubscribe

Not reached or not checked: legislation.gov.uk (PECR reg. 22 text), the full
EUR-Lex GDPR text (Arts. 6, 7, 8, 13), RFC 7208, RFC 6376 and RFC 7489,
hCaptcha docs, Prisma docs, and the comparison waitlists.
