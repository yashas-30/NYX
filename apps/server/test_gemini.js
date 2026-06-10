import 'dotenv/config';
import fs from 'fs';
const activeKey = process.env.GEMINI_API_KEY || process.env.LLM_API_KEY;

async function run() {
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
  const gatewayName = process.env.CLOUDFLARE_GATEWAY_NAME;
  let url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:streamGenerateContent?alt=sse&key=${activeKey}`;
  if (accountId && gatewayName) {
    url = `https://gateway.ai.cloudflare.com/v1/${accountId}/${gatewayName}/gemini/models/gemini-3.5-flash:streamGenerateContent?alt=sse&key=${activeKey}`;
  }
  
  console.log("Using URL:", url.split('key=')[0]);

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ role: "model", parts: [{ text: "how many models you have?" }] }]
    })
  });

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  const startTime = Date.now();
  console.log("Stream started");

  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      console.log("Stream ended naturally after", Date.now() - startTime, "ms");
      break;
    }
    const chunk = decoder.decode(value, { stream: true });
    console.log(`[${Date.now() - startTime}ms] CHUNK:`, chunk);
  }
}

run().catch(console.error);
