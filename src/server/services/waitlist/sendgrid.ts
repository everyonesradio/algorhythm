import { env } from "@/env";

/**
 * The waitlist welcome email, sent with a SendGrid dynamic template (the
 * HTML lives in `emails/waitlist-welcome.html`). Needs SENDGRID_API_KEY (a
 * Mail Send-only key), SENDGRID_FROM_EMAIL (a verified sender on the
 * authenticated domain) and SENDGRID_WAITLIST_TEMPLATE_ID. With
 * SENDGRID_UNSUBSCRIBE_GROUP_ID set, the email carries that group's
 * unsubscribe link and SendGrid suppresses the address from later sends.
 */
export const sendgridConfigured = () =>
  !!(
    env.SENDGRID_API_KEY &&
    env.SENDGRID_FROM_EMAIL &&
    env.SENDGRID_WAITLIST_TEMPLATE_ID
  );

export const welcomeMessage = (to: string) => {
  const site = env.NEXT_PUBLIC_BASE_URL.replace(/\/$/, "");
  const group = env.SENDGRID_UNSUBSCRIBE_GROUP_ID
    ? Number(env.SENDGRID_UNSUBSCRIBE_GROUP_ID)
    : null;
  return {
    from: { email: env.SENDGRID_FROM_EMAIL, name: "algoRhythm" },
    personalizations: [
      {
        to: [{ email: to }],
        dynamic_template_data: {
          site_url: site,
          demo_url: `${site}/scan-vinyl`,
          library_url: `${site}/library`,
          privacy_url: `${site}/privacy`,
          has_unsubscribe: group !== null,
        },
      },
    ],
    template_id: env.SENDGRID_WAITLIST_TEMPLATE_ID,
    ...(group !== null && { asm: { group_id: group } }),
    // No link rewriting or open pixels: nothing here needs measuring.
    tracking_settings: {
      click_tracking: { enable: false, enable_text: false },
      open_tracking: { enable: false },
    },
    categories: ["waitlist-welcome"],
  };
};

export const sendWaitlistWelcome = async (
  to: string,
  fetchImpl: typeof fetch = fetch
) => {
  if (!sendgridConfigured()) {
    throw new Error("SendGrid isn't configured: no welcome email sent.");
  }
  const res = await fetchImpl("https://api.sendgrid.com/v3/mail/send", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.SENDGRID_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(welcomeMessage(to)),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`SendGrid ${res.status}: ${detail.slice(0, 300)}`);
  }
};
