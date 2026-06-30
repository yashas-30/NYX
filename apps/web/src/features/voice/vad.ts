import { MicVAD } from "@ricky0123/vad-web";
import { invoke } from '@tauri-apps/api/core';

export async function initVoiceMode(
  onSpeechStart: () => void,
  onSpeechEnd: (text: string) => void,
  onMisfire: () => void,
  onError: (error: string) => void
) {
  try {
    const myvad = await MicVAD.new({
      onSpeechStart: () => {
        onSpeechStart();
      },
      onSpeechEnd: async (audio) => {
        try {
          onSpeechStart(); // Transition state back to processing
          const text = await transcribeAudio(audio);
          onSpeechEnd(text);
        } catch (err: any) {
          onError(err.message || "Failed to transcribe audio");
        }
      },
      onVADMisfire: () => {
        onMisfire();
      }
    });
    return myvad;
  } catch (error: any) {
    console.error("Failed to initialize VAD:", error);
    onError(error.message || "Failed to initialize microphone");
    return null;
  }
}

export async function transcribeAudio(audio: Float32Array): Promise<string> {
  // Convert Float32Array PCM (16kHz mono) to WAV
  const wavBlob = pcmToWav(audio, 16000);
  const file = new File([wavBlob], "audio.wav", { type: "audio/wav" });

  const formData = new FormData();
  formData.append("file", file);

  const response: any = await invoke('voice_stt', { payload: formData });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Transcription failed: ${response.statusText} - ${errText}`);
  }

  const result = await response.json();
  return result.text || "";
}

function pcmToWav(pcm: Float32Array, sampleRate: number): Blob {
  const buffer = new ArrayBuffer(44 + pcm.length * 2);
  const view = new DataView(buffer);

  // RIFF identifier
  writeString(view, 0, "RIFF");
  // file length
  view.setUint32(4, 36 + pcm.length * 2, true);
  // WAVE identifier
  writeString(view, 8, "WAVE");
  // format chunk identifier
  writeString(view, 12, "fmt ");
  // format chunk length
  view.setUint32(16, 16, true);
  // sample format (raw PCM)
  view.setUint16(20, 1, true);
  // channel count (1 channel)
  view.setUint16(22, 1, true);
  // sample rate
  view.setUint32(24, sampleRate, true);
  // byte rate
  view.setUint32(28, sampleRate * 2, true);
  // block align
  view.setUint16(32, 2, true);
  // bits per sample (16 bits)
  view.setUint16(34, 16, true);
  // data chunk identifier
  writeString(view, 36, "data");
  // data chunk length
  view.setUint32(40, pcm.length * 2, true);

  // write PCM audio samples
  let offset = 44;
  for (let i = 0; i < pcm.length; i++, offset += 2) {
    const s = Math.max(-1, Math.min(1, pcm[i]));
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }

  return new Blob([view], { type: "audio/wav" });
}

function writeString(view: DataView, offset: number, string: string) {
  for (let i = 0; i < string.length; i++) {
    view.setUint8(offset + i, string.charCodeAt(i));
  }
}
