import { chromium } from "playwright";
import fs from "fs";
import path from "path";
import nodemailer from "nodemailer";
import { parse } from "csv-parse/sync";
import { stringify } from "csv-stringify/sync";
import "dotenv/config";

const URL = process.env.URL || "";

const CSV_PATH = path.resolve("prices.csv");
const DELTA = 10;

type Product = { title: string; price: number };

async function scrape(): Promise<Product[]> {
    const browser = await chromium.launch({ headless: true });

    const context = await browser.newContext({
        storageState: "amazon.json",
    });

    const page = await context.newPage();

    await page.goto(URL, { waitUntil: "networkidle" });
    await page.waitForSelector("li[data-itemid]", { timeout: 60000 });

    const products = await page.$$eval("li[data-itemid]", (items) =>
        items.map((item) => {
            const priceStr = item.getAttribute("data-price") || "0";
            const title =
                item.querySelector('[id^="itemName_"]')?.textContent?.trim() || "";

            return { title, price: parseFloat(priceStr) };
        })
    );

    await browser.close();
    return products;
}

function loadPrevious(): Record<string, number> {
    if (!fs.existsSync(CSV_PATH)) return {};

    const text = fs.readFileSync(CSV_PATH, "utf-8");
    const rows = parse(text, { columns: true }) as Array<{
        title: string;
        price: string;
    }>;

    const map: Record<string, number> = {};
    rows.forEach((r) => (map[r.title] = parseFloat(r.price)));
    return map;
}

function saveCurrent(products: Product[]) {
    const csv = stringify(products, { header: true });
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
        to: process.env.GMAIL_USER,
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
        if (prevPrice !== undefined) {
            const diff = Math.abs(p.price - prevPrice);
            if (diff >= DELTA) {
                changes.push({ title: p.title, before: prevPrice, after: p.price });
            }
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
