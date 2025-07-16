import puppeteer from 'puppeteer';

async function generateWithDeepAIPage(prompt) {
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const page = await browser.newPage();

  try {
    await page.goto('https://deepai.org/machine-learning-model/text2img', { waitUntil: 'domcontentloaded' });

    await page.waitForSelector('#generate-textarea', { visible: true });
    await page.type('#generate-textarea', prompt);

    await page.click('#modelSubmitButton');

    await page.waitForSelector('#main-image', { visible: true, timeout: 60000 }); 

    const imageUrl = await page.$eval('#main-image', img => img.src);
    if (!imageUrl || !imageUrl.startsWith('https://')) throw new Error('Invalid image URL');

    const imageResponse = await fetch(imageUrl);
    const buffer = Buffer.from(await imageResponse.arrayBuffer());

    return buffer;
  } catch (err) {
    console.error('DeepAI Puppeteer failed:', err);
    throw err;
  } finally {
    await browser.close();
  }
}
