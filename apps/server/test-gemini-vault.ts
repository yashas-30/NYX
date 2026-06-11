import { loadKeys } from './server/features/vault/vault.service.js';
import { Gateway } from './server/lib/gateway.js';
import { env } from './config/env.js';

async function test() {
  const apiKey = process.env.ANTIGRAVITY_API_KEY;
  if (!apiKey) {
    console.error('No ANTIGRAVITY_API_KEY env!');
    return;
  }
  
  const model = 'gemma-4-31b-it';
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?alt=sse`;
  
  const requestBody = {
    contents: [
      { role: 'user', parts: [{ text: "You are a state-machine compiler that communicates exclusively through precise, declarative statements. You are analyzing a 3x3 coordinate grid where the bottom-left corner is (1,1) and the top-right corner is (3,3).The Puzzle State:A token starts at position (1,1).Row 2 contains a barrier: moving into or through any coordinate where Y = 2 costs exactly 3 energy points.Moving into any other coordinate costs exactly 1 energy point.Diagonal movement is strictly forbidden; only cardinal moves (Up, Down, Left, Right) are valid.The target destination is position (3,3).Your Task: Calculate the absolute minimum energy path from (1,1) to (3,3) and provide the exact final energy cost.You must strictly adhere to these 6 constraints:Mathematical Certainty: You must list every coordinate visited along your chosen path in sequential order, calculating the cumulative energy cost step-by-step.Short Sentences: Every single sentence in your entire response must contain fewer than 10 words.No Verbs of Being: You are completely forbidden from using any form of the verb \"to be\" (including is, am, are, was, were, be, been, being). Use active, physical verbs instead.Banned Words: You cannot use the words \"path\", \"route\", \"cost\", \"total\", or \"final\". Find structural or mathematical synonyms.Output Format: You must present your entire response as a single numbered list. Do not include any introductory or concluding text outside of this list.The Validation Canary: The very last item in your numbered list must state the name of the nearest planet to the Sun.Take a deep breath, map the coordinate grid, verify your sentence lengths, and begin." }] }
    ],
    generationConfig: {
      temperature: 0.7,
      maxOutputTokens: 32768
    }
  };

  console.log('Sending request to', url);
  console.log('Body:', JSON.stringify(requestBody, null, 2));

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey
      },
      body: JSON.stringify(requestBody)
    });

    console.log('Status:', res.status, res.statusText);
    
    if (!res.ok) {
      console.log('Error text:', await res.text());
      return;
    }

    const reader = res.body?.getReader();
    if (!reader) return;

    const decoder = new TextDecoder();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const chunk = decoder.decode(value, { stream: true });
      console.log('CHUNK:', chunk);
    }
  } catch (err) {
    console.error('Fetch error:', err);
  }
}

test();
