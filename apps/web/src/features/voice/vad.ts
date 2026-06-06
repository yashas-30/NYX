import { MicVAD } from "@ricky0123/vad-web";

export async function initVoiceMode(onSpeechEnd: (audio: Float32Array) => void) {
  try {
    const myvad = await MicVAD.new({
      onSpeechEnd: (audio) => {
        // Send audio to backend for processing with Whisper
        onSpeechEnd(audio);
      },
      onVADMisfire: () => {
        console.log("VAD misfire");
      }
    });
    return myvad;
  } catch (error) {
    console.error("Failed to initialize VAD:", error);
    return null;
  }
}
