import { chromium, type Page } from "playwright";
import fs from "fs";
import path from "path";
import nodemailer from "nodemailer";
import { parse } from "csv-parse/sync";
import { stringify } from "csv-stringify/sync";
import "dotenv/config";

const URL = process.env.URL || "";

const CSV_PATH = path.resolve("prices.csv");
const DELTA = 10;

type Product = { title: string; price: number | null };

async function loadAllItems(page: Page) {
    let previousCount = 0;

    while (true) {
        const count = await page.$$eval('li[data-itemid]', els => els.length);

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
        userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/109.0.0.0 Safari/537.36",
    });

    const page = await context.newPage();

    await page.goto(URL, { waitUntil: "networkidle" });
    await page.waitForSelector("li[data-itemid]", { timeout: 60000 });

    await loadAllItems(page);

    const products = await page.$$eval("li[data-itemid]", (items) =>
        items.map((item) => {
            const priceStr = item.getAttribute("data-price");

            const title =
                item.querySelector('[id^="itemName_"]')?.textContent?.trim() || "";

            const parsed = priceStr ? parseFloat(priceStr) : NaN;

            const price =
                priceStr && !isNaN(parsed) && isFinite(parsed)
                    ? parsed
                    : null;

            return { title, price };
        })
    );

    await browser.close();
    return products;
}

function loadPrevious(): Record<string, number | null> {
    if (!fs.existsSync(CSV_PATH)) return {};

    const text = fs.readFileSync(CSV_PATH, "utf-8");
    const rows = parse<{
        title: string;
        price: string;
    }>(text, { columns: true });

    const map: Record<string, number | null> = {};

    rows.forEach(r => {
        const n = parseFloat(r.price);
        map[r.title] =
            r.price === "" || !isFinite(n) || isNaN(n) ? null : n;
    });

    return map;
}

function saveCurrent(products: Product[]) {
    const rows = products.map(p => ({
        title: p.title,
        price: p.price === null ? "" : p.price
    }));

    const csv = stringify(rows, { header: true });
    fs.writeFileSync(CSV_PATH, csv);
}

async function sendEmail(changes: Array<{ title: string; before: number; after: number }>) {
    const transporter = nodemailer.createTransport({
        service: "gmail",
        auth: {
            user: process.env.GMAIL_USER,
            pass: process.env.GMAIL_PASS,
        },
    });

    const text = changes
        .map(
            (c) =>
                `${c.title}\nOld: $${c.before.toFixed(2)}\nNew: $${c.after.toFixed(
                    2
                )}\nChange: $${(c.after - c.before).toFixed(2)}\n`
        )
        .join("\n");

    await transporter.sendMail({
        from: process.env.GMAIL_USER,
        to: process.env.TO_GMAIL_USER,
        subject: "Wishlist price alert",
        text,
    });

    console.log("Alert email sent");
}

async function main() {
    const products = await scrape();
    const prev = loadPrevious();

    const changes: Array<{ title: string; before: number; after: number }> = [];

    for (const p of products) {
        const prevPrice = prev[p.title];

        if (prevPrice == null || p.price == null) continue;

        const diff = Math.abs(p.price - prevPrice);

        if (diff >= DELTA) {
            changes.push({ title: p.title, before: prevPrice, after: p.price });
        }
    }

    if (changes.length) {
        await sendEmail(changes);
    } else {
        console.log("No price changes >= $10");
    }

    saveCurrent(products);
}

main().catch(console.error);
