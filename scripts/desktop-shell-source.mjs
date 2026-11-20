import { chromium } from '@playwright/test';

const browser = await chromium.launch({ headless: false, timeout: 30_000 });
const page = await browser.newPage();
await page.goto(process.argv[2]);
process.stdout.write('SOURCE_READY\n');
for (const event of ['SIGINT', 'SIGTERM']) {
  process.once(event, async () => {
    await browser.close();
    process.exit(0);
  });
}
await new Promise(() => {});
