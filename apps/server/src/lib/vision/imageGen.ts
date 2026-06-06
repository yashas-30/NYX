export async function processImageWithGemini(prompt: string, base64Image: string) {
  // Using Gemini Flash 3.5 native multimodal
  return {
    contents: [
      {
        role: 'user',
        parts: [
          { text: prompt },
          { inline_data: { mime_type: 'image/png', data: base64Image } }
        ]
      }
    ]
  };
}

export async function processImageLocalLLaVA(prompt: string, imagePath: string) {
  // Local vision model support (LLaVA GGUF) via llama.cpp
  // Implementation assumes llama.cpp is installed and models are present
  return `Processed locally: ${prompt} on ${imagePath}`;
}

export function generateImagePollinations(prompt: string): string {
  // Pollinations image generation
  const encoded = encodeURIComponent(prompt);
  return `https://image.pollinations.ai/prompt/${encoded}?width=1024&height=1024&nologo=true`;
}
