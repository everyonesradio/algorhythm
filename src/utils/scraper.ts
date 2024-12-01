import * as cheerio from "cheerio";
import puppeteer, { Browser, Page, CookieParam } from "puppeteer";

let browser: Browser | null = null;

async function launchBrowser(): Promise<Browser> {
  if (!browser) {
    browser = await puppeteer.launch({
      headless: true,
      args: ["--no-sandbox"],
    });
  }
  return browser;
}

export async function getLinkWithPuppeteer(
  url: string,
  linkQuerySelector: string,
  cookies: CookieParam[] = []
) {
  const browser = await launchBrowser();
  const page: Page = await browser.newPage();

  await page.setUserAgent(
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:124.0) Gecko/20100101 Firefox/124.0"
  );

  await page.setCookie(...cookies);
  await page.setRequestInterception(true);

  page.on("request", (request) => {
    if (request.resourceType() === "image") {
      request.abort();
    } else {
      request.continue();
    }
  });

  await page.setViewport({ width: 768, height: 600 });
  await page.goto(url, { waitUntil: "networkidle0" });

  const href = await page.evaluate(
    // eslint-disable-next-line
    // @ts-ignore
    (selector) => document.querySelector(selector)?.href,
    linkQuerySelector
  );

  page.close();

  return href;
}

export function getCheerioDoc(html: string) {
  return cheerio.load(html);
}

export function metaTagContent(
  doc: cheerio.CheerioAPI,
  type: string,
  attr: string
) {
  return doc(`meta[${attr}='${type}']`).attr("content");
}
