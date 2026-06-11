import { GoogleGenAI } from '@google/genai';

const ai = new GoogleGenAI({ apiKey: "DUMMY_KEY_JUST_TO_INITIALIZE" });

async function run() {
  try {
    const response = await ai.models.list();
    console.log(response);
  } catch (err) {
    console.error("Error:", err);
  }
}

run();
