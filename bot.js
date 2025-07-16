import dotenv from 'dotenv';
dotenv.config();
import puppeteer from 'puppeteer';
import pkg from '@slack/bolt';
import fetch from 'node-fetch';
import { Readable } from 'stream';

const { App } = pkg;

const app = new App({
  token: process.env.SLACK_BOT_TOKEN,
  appToken: process.env.SLACK_APP_TOKEN,
  socketMode: true,
});

const apis = [
   // 'huggingface',
     'deepai'];

async function generateWithHuggingFace(prompt) {
const tokenList = process.env.HF_TOKEN.split(',');
 const token = tokenList[Math.floor(Math.random() * tokenList.length)];
  const response = await fetch('https://api-inference.huggingface.co/models/stabilityai/stable-diffusion-3.5-large', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ inputs: prompt }),
  });

   if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Hugging Face - ${errorText}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

async function generateWithDeepAI(prompt) {
    const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const page = await browser.newPage();

  try {
    await page.goto('https://deepai.org/machine-learning-model/text2img', {
      waitUntil: 'domcontentloaded',
    });

    // Type the prompt into the textarea
    await page.waitForSelector('#generate-textarea', { visible: true });
    await page.type('#generate-textarea', prompt);

    // Submit the form
    await page.click('#modelSubmitButton');

    // Wait for the image to load and have a proper .jpg src
    await page.waitForFunction(() => {
      const img = document.querySelector('#main-image');
      return img && img.src && img.src.endsWith('.jpg');
    }, { timeout: 60000 });

    // Extract the image URL
    const imageUrl = await page.$eval('#main-image', img => img.src);
    console.log('✅ DeepAI image URL:', imageUrl);

    // Download the image as a buffer
    const response = await fetch(imageUrl);
    const buffer = Buffer.from(await response.arrayBuffer());

    return buffer;

  } catch (err) {
    console.error('❌ DeepAI Puppeteer failed:', err.message);
    throw err;
  } finally {
    await browser.close();
  }
}

async function smartGenerate(prompt) {
  const selectedApi = apis[Math.floor(Math.random() * apis.length)];
  console.log(`🎯 Using API: ${selectedApi}`);

  if (selectedApi === 'huggingface') {
    return await generateWithHuggingFace(prompt);
  } else if (selectedApi === 'deepai') {
    return await generateWithDeepAI(prompt);
  } else {
    throw new Error('No valid API selected');
  }
}

app.message(/^generate (.+)/i, async ({ message, say, context }) => {
  const prompt = message.text.match(/^generate (.+)/i)[1];
  console.log(`📝 Received prompt: ${prompt}`);
   try {
    await say(`<@${message.user}> generating image for: *${prompt}*...`);
    const imageBuffer = await smartGenerate(prompt);

    await app.client.files.uploadV2({
      token: context.botToken,
      channel_id: message.channel,
      filename: 'image.png',
      file: Readable.from(imageBuffer),
    });
  } catch (error) {
    console.error('❌ Error generating image:', error.message);
    await say(`Failed to generate image: ${error.message}`);
  }
});

(async () => {
  await app.start();
  console.log('⚡️ Slack bot is running in Socket Mode');
})();
