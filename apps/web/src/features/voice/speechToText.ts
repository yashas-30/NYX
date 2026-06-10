// Helper class to manage browser native SpeechRecognition / webkitSpeechRecognition API
export interface SpeechToTextHelperOptions {
  onResult: (text: string, isFinal: boolean) => void;
  onEnd: () => void;
  onError: (error: string) => void;
  lang?: string;
}

export class SpeechToTextHelper {
  private recognition: any = null;
  private isListening: boolean = false;
  private options: SpeechToTextHelperOptions;

  private finalTranscript: string = '';

  constructor(options: SpeechToTextHelperOptions) {
    this.options = options;
    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (!SpeechRecognition) {
      return;
    }

    const rec = new SpeechRecognition();
    rec.continuous = true;
    rec.interimResults = true;
    rec.lang = options.lang || 'en-US';

    rec.onstart = () => {
      this.isListening = true;
    };

    rec.onresult = (event: any) => {
      let interimTranscript = '';

      for (let i = event.resultIndex; i < event.results.length; ++i) {
        const transcript = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          this.finalTranscript += transcript;
        } else {
          interimTranscript += transcript;
        }
      }

      const resultText = this.finalTranscript + interimTranscript;
      if (resultText) {
        this.options.onResult(resultText, !interimTranscript);
      }
    };

    rec.onerror = (event: any) => {
      if (event.error === 'no-speech') {
        // Ignore silent intervals to keep session active
        return;
      }
      console.error('Speech recognition error:', event.error);
      let errorMsg = 'Speech recognition error';
      if (event.error === 'not-allowed') {
        errorMsg = 'Microphone permission was denied';
      } else if (event.error === 'network') {
        errorMsg = 'Network error during speech recognition';
      } else if (event.error === 'aborted') {
        errorMsg = 'Speech recognition aborted';
      }
      this.options.onError(errorMsg);
    };

    rec.onend = () => {
      // If we are still supposed to be listening (i.e. stop was not called), auto-restart!
      if (this.isListening) {
        try {
          this.recognition.start();
          return;
        } catch (err) {
          console.error('Failed to auto-restart speech recognition:', err);
        }
      }
      this.isListening = false;
      this.options.onEnd();
    };

    this.recognition = rec;
  }

  public start() {
    if (!this.recognition) {
      this.options.onError('Speech recognition is not supported in this browser.');
      return;
    }
    if (!this.isListening) {
      try {
        this.recognition.start();
      } catch (err) {
        console.error('Failed to start speech recognition:', err);
        this.options.onError('Failed to start speech recognition');
      }
    }
  }

  public stop() {
    if (this.recognition && this.isListening) {
      try {
        this.recognition.stop();
        this.isListening = false;
      } catch (err) {
        console.error('Failed to stop speech recognition:', err);
      }
    }
  }

  public isSupported(): boolean {
    return !!this.recognition;
  }

  public active(): boolean {
    return this.isListening;
  }
}
