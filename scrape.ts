import { chromium, type Page } from "playwright";
import fs from "fs";
import path from "path";
import nodemailer from "nodemailer";
import { parse } from "csv-parse/sync";
import { stringify } from "csv-stringify/sync";
import "dotenv/config";

const URL = process.env.URL || "";
const DELTA = process.env.DELTA ? parseFloat(process.env.DELTA) : 10;
const DATA_PATH = process.env.DATA_PATH || "./";
const CSV_PATH = path.resolve(DATA_PATH, "prices.csv");

type Product = {
    id: string;
    title: string;
    price: number | null;
    link: string;
};

async function loadAllItems(page: Page) {
    let previousCount = 0;

    while (true) {
        const count = await page.$$eval("li[data-itemid]", els => els.length);
        if (count === previousCount) break;

        previousCount = count;

        await page.evaluate(() => {
            window.scrollTo(0, document.body.scrollHeight);
        });

        await page.waitForTimeout(1200);
    }
}

async function scrape(): Promise<Product[]> {
    const browser = await chromium.launch({ headless: true });

    const context = await browser.newContext({
        storageState: "amazon.json",
        userAgent:
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/109.0.0.0 Safari/537.36",
    });

    const page = await context.newPage();

    await page.goto(URL, { waitUntil: "networkidle" });
    await page.waitForSelector("li[data-itemid]", { timeout: 60000 });

    await loadAllItems(page);

    const products = await page.$$eval("li[data-itemid]", (items) =>
        items.map((item) => {
            const id = item.getAttribute("data-itemid") || "";

            const anchor = item.querySelector('[id^="itemName_"]');
            const title = anchor?.textContent?.trim() || "";
            const link = (anchor as HTMLAnchorElement)?.href || "";

            // look for availability text
            const unavailable = item.querySelector(
                ".a-color-price, .a-size-base.a-color-price"
            )?.textContent?.toLowerCase() ?? "";

            // extract visible price
            const priceText =
                item.querySelector(".a-price .a-offscreen")?.textContent?.trim() || "";

            let price: number | null = null;

            if (
                priceText &&
                !unavailable.includes("unavailable") &&
                !unavailable.includes("out of stock")
            ) {
                const numeric = parseFloat(priceText.replace(/[^0-9.]/g, ""));
                if (!isNaN(numeric)) price = numeric;
            }

            return { id, title, price, link };
        })
    );

    await browser.close();
    return products;
}

function loadPrevious(): Record<string, number | null> {
    if (!fs.existsSync(CSV_PATH)) return {};

    const text = fs.readFileSync(CSV_PATH, "utf-8");

    const rows = parse<{
        id: string;
        title: string;
        price: string;
        link: string;
    }>(text, { columns: true });

    const map: Record<string, number | null> = {};

    for (const r of rows) {
        const n = parseFloat(r.price);
        map[r.id] =
            r.price === "" || isNaN(n) || !isFinite(n) ? null : n;
    }

    return map;
}

function saveCurrent(products: Product[]) {
    const rows = products.map((p) => ({
        id: p.id,
        title: p.title,
        price: p.price === null ? "" : p.price,
        link: p.link
    }));

    const csv = stringify(rows, { header: true });
    fs.writeFileSync(CSV_PATH, csv);
}

async function sendEmail(
    changes: Array<{ title: string; link: string; before: number; after: number }>
) {
    const transporter = nodemailer.createTransport({
        host: "smtp.mailgun.org",
        port: 587,
        auth: {
            user: process.env.SENDER_EMAIL,
            pass: process.env.SENDER_PASS
        },
    });

    const text = changes
        .map(
            (c) =>
                `${c.title}\nOld: $${c.before.toFixed(
                    2
                )}\nNew: $${c.after.toFixed(
                    2
                )}\nChange: $${(c.after - c.before).toFixed(2)}\nLink: ${c.link}\n
    `
        )
        .join("\n");

    await transporter.sendMail({
        from: process.env.SENDER_EMAIL,
        to: process.env.RECEIVER_EMAIL,
        subject: "Wishlist price alert",
        text,
    });

    console.log("Alert email sent");
}

async function main() {
    const products = await scrape();
    const prev = loadPrevious();

    const changes: Array<{ title: string; link: string; before: number; after: number }> = [];

    for (const p of products) {
        const hadEntryBefore = Object.prototype.hasOwnProperty.call(prev, p.id);
        const prevPrice = prev[p.id];

        // Back in stock ONLY if it existed before but had no price
        if (hadEntryBefore && prevPrice == null && p.price != null) {
            changes.push({
                title: p.title,
                before: 0,
                after: p.price,
                link: p.link
            });
            continue;
        }

        // Normal delta change
        if (prevPrice != null && p.price != null) {
            const diff = Math.abs(p.price - prevPrice);
            if (diff >= DELTA) {
                changes.push({
                    title: p.title,
                    before: prevPrice,
                    after: p.price,
                    link: p.link
                });
            }
        }
    }

    if (changes.length) {
        await sendEmail(changes);
    } else {
        console.log(`No price changes >= ${DELTA}`);
    }

    saveCurrent(products);
}

main().catch(console.error);
