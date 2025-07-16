import pkg from '@slack/bolt';
const { App } = pkg;
import fetch from 'node-fetch';
import dotenv from 'dotenv';
dotenv.config();

const app = new App({
  token: process.env.SLACK_BOT_TOKEN,
  appToken: process.env.SLACK_APP_TOKEN,
  socketMode: true
});

async function generateImage(prompt) {
  const response = await fetch('https://api-inference.huggingface.co/models/stabilityai/stable-diffusion-3.5-large', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.HF_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ inputs: prompt })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Image generation failed: ${errorText}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

app.message(async ({ message, say }) => {
  if (message.subtype === 'bot_message') return;

  const prompt = message.text;
  try {
    await say(`🎨 Generating image for: *${prompt}*...`);
    const imageBuffer = await generateImage(prompt);

    await app.client.files.uploadV2({
      channel_id: message.channel,
      filename: 'image.png',
      title: `Image for: "${prompt}"`,
      initial_comment: `Here is your image for: "${prompt}"`,
      file: imageBuffer // ✅ Must be top-level Buffer
    });

  } catch (err) {
    console.error(err);
    await say(`❌ Failed to generate image: ${err.message}`);
  }
});

(async () => {
  await app.start();
  console.log('⚡️ Slack bot is running in Socket Mode');
})();
