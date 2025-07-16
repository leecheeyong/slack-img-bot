import dotenv from 'dotenv';
dotenv.config();
import puppeteer from 'puppeteer';
import pkg from '@slack/bolt';
import fetch from 'node-fetch';
import { Readable } from 'stream';
import * as cheerio from 'cheerio';

const { App } = pkg;

const app = new App({
  token: process.env.SLACK_BOT_TOKEN,
  appToken: process.env.SLACK_APP_TOKEN,
  socketMode: true,
});

const apis = [
    'huggingface',
     'deepai'];

function generateMoodboardTitle(prompt) {
  const styles = ['Dreams of', 'Vibes of', 'Aesthetic of', 'Echoes of', 'Moodboard:'];
  const adjectives = ['Soft', 'Cyber', 'Retro', 'Noir', 'Electric', 'Cozy', 'Surreal'];
  const randStyle = styles[Math.floor(Math.random() * styles.length)];
  const randAdj = adjectives[Math.floor(Math.random() * adjectives.length)];
  return `${randStyle} ${randAdj} ${prompt.charAt(0).toUpperCase() + prompt.slice(1)}`;
}

async function searchImages(prompt, limit = 4) {
  const searchUrl = `https://commons.wikimedia.org/w/index.php?search=${encodeURIComponent(
    prompt
  )}&title=Special:MediaSearch&go=Go&type=image`;
  const res = await fetch(searchUrl);
  const html = await res.text();
  const $ = cheerio.load(html);

  const imageUrls = [];
  $('img').each((_, el) => {
    const src = $(el).attr('src');
    if (src && src.includes('/thumb/') && src.match(/\.(jpg|jpeg|png)$/)) {
      const fullUrl = src
        .replace(/\/thumb/, '')
        .replace(/\/[^/]*$/, '')
        .replace(/^\/\//, 'https://');
      if (!imageUrls.includes(fullUrl)) {
        imageUrls.push(fullUrl);
      }
    }
  });

  return imageUrls.slice(0, limit);
}

app.message(/^mood (.+)/i, async ({ message, say, client }) => {
  if (message.channel_type !== 'im' || !message.text) return;
  const prompt = message.text.match(/^mood (.+)/i)[1];

  const title = generateMoodboardTitle(prompt);
  await say(`🎨 *${title}*`);

  try {
    const imageUrls = await searchImages(prompt);

    if (imageUrls.length === 0) {
      await say("❌ Couldn't find relevant images. Try a different prompt!");
      return;
    }

    for (const url of imageUrls) {
      const res = await fetch(url);
      const buffer = await res.buffer();

      await client.files.uploadV2({
        channel_id: message.channel,
        filename: `mood-${Date.now()}.jpg`,
        file: Readable.from(buffer),
        title: prompt,
      });
    }
  } catch (err) {
    console.error('❌ Error:', err);
    await say('⚠️ Oops! Something went wrong while generating your moodboard.');
  }
});

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

    await page.waitForSelector('#generate-textarea', { visible: true });
    await page.type('#generate-textarea', prompt);

    await page.click('#modelSubmitButton');

    await page.waitForFunction(() => {
      const img = document.querySelector('#main-image');
      return img && img.src && img.src.endsWith('.jpg');
    }, { timeout: 60000 });

    const imageUrl = await page.$eval('#main-image', img => img.src);
    console.log('✅ DeepAI image URL:', imageUrl);

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
