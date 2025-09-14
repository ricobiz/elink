import { SpeechClient } from '@google-cloud/speech';
import { TextToSpeechClient } from '@google-cloud/text-to-speech';

export class GoogleCloudService {
  private speechClient?: SpeechClient;
  private ttsClient?: TextToSpeechClient;

  constructor() {
    try {
      // Initialize clients if credentials are available
      if (process.env.GOOGLE_CLOUD_PROJECT_ID || process.env.GOOGLE_APPLICATION_CREDENTIALS) {
        this.speechClient = new SpeechClient();
        this.ttsClient = new TextToSpeechClient();
        console.log('✅ Google Cloud services initialized');
      } else {
        console.warn('Google Cloud credentials not found. Speech services will be unavailable.');
      }
    } catch (error) {
      console.warn('Failed to initialize Google Cloud services:', error);
    }
  }

  async speechToText(audioBuffer: Buffer, languageCode: string = 'ru-RU'): Promise<any> {
    if (!this.speechClient) {
      return {
        success: false,
        error: 'Google Cloud Speech client not initialized',
      };
    }

    try {
      const audio = {
        content: audioBuffer.toString('base64'),
      };

      const config = {
        encoding: 'WEBM_OPUS' as const,
        sampleRateHertz: 16000,
        languageCode,
        enableAutomaticPunctuation: true,
      };

      const request = {
        audio,
        config,
      };

      const [response] = await this.speechClient.recognize(request);
      const transcription = response.results
        ?.map(result => result.alternatives?.[0]?.transcript)
        .join('\n');

      return {
        success: true,
        data: transcription || '',
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  async textToSpeech(text: string, languageCode: string = 'ru-RU', voiceName?: string): Promise<any> {
    if (!this.ttsClient) {
      return {
        success: false,
        error: 'Google Cloud Text-to-Speech client not initialized',
      };
    }

    try {
      const request = {
        input: { text },
        voice: {
          languageCode,
          name: voiceName,
          ssmlGender: 'NEUTRAL' as const,
        },
        audioConfig: {
          audioEncoding: 'MP3' as const,
          sampleRateHertz: 24000,
        },
      };

      const [response] = await this.ttsClient.synthesizeSpeech(request);

      return {
        success: true,
        data: response.audioContent,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }
}

export const googleCloudService = new GoogleCloudService();