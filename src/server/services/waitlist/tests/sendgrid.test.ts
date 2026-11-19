import { beforeEach, describe, expect, it, vi } from "vitest";

const env: Record<string, string | undefined> = {};
vi.mock("@/env", () => ({ env }));

const { sendWaitlistWelcome, welcomeMessage, sendgridConfigured } =
  await import("@/server/services/waitlist/sendgrid");

beforeEach(() => {
  Object.assign(env, {
    NEXT_PUBLIC_BASE_URL: "https://algorhythm.example/",
    SENDGRID_API_KEY: "SG.key",
    SENDGRID_FROM_EMAIL: "hello@algorhythm.example",
    SENDGRID_WAITLIST_TEMPLATE_ID: "d-123",
    SENDGRID_UNSUBSCRIBE_GROUP_ID: "42",
  });
});

describe("welcomeMessage", () => {
  it("uses the template, the unsubscribe group and no tracking", () => {
    const m = welcomeMessage("digger@example.com");
    expect(m.template_id).toBe("d-123");
    expect(m.asm).toEqual({ group_id: 42 });
    expect(m.personalizations[0].to).toEqual([{ email: "digger@example.com" }]);
    expect(m.personalizations[0].dynamic_template_data).toEqual({
      site_url: "https://algorhythm.example",
      demo_url: "https://algorhythm.example/scan-vinyl",
      library_url: "https://algorhythm.example/library",
      privacy_url: "https://algorhythm.example/privacy",
      has_unsubscribe: true,
    });
    expect(m.tracking_settings.click_tracking.enable).toBe(false);
    expect(m.tracking_settings.open_tracking.enable).toBe(false);
  });

  it("leaves the unsubscribe link out without a group", () => {
    env.SENDGRID_UNSUBSCRIBE_GROUP_ID = undefined;
    const m = welcomeMessage("digger@example.com");
    expect(m).not.toHaveProperty("asm");
    expect(m.personalizations[0].dynamic_template_data.has_unsubscribe).toBe(
      false
    );
  });
});

describe("sendWaitlistWelcome", () => {
  it("posts to SendGrid with the key", async () => {
    const fetchImpl = vi.fn(async () => new Response(null, { status: 202 }));
    await sendWaitlistWelcome("digger@example.com", fetchImpl as any);
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ];
    expect(url).toBe("https://api.sendgrid.com/v3/mail/send");
    expect((init.headers as Record<string, string>).Authorization).toBe(
      "Bearer SG.key"
    );
  });

  it("throws on a SendGrid error so the send is retried later", async () => {
    const fetchImpl = vi.fn(
      async () => new Response("bad from", { status: 403 })
    );
    await expect(
      sendWaitlistWelcome("digger@example.com", fetchImpl as any)
    ).rejects.toThrow("SendGrid 403: bad from");
  });

  it("refuses to send without config", async () => {
    env.SENDGRID_API_KEY = undefined;
    expect(sendgridConfigured()).toBe(false);
    await expect(sendWaitlistWelcome("x@example.com")).rejects.toThrow(
      /isn't configured/
    );
  });
});
