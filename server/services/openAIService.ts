import OpenAI from 'openai';

export class OpenAIService {
  private client: OpenAI;
  private apiKey: string;

  constructor() {
    this.apiKey = process.env.OPENAI_API_KEY || '';
    if (!this.apiKey) {
      console.warn('OPENAI_API_KEY not found in environment variables');
    }
    
    this.client = new OpenAI({
      apiKey: this.apiKey,
    });
  }

  async chat(messages: any[], model: string = 'gpt-4o-mini'): Promise<any> {
    try {
      const completion = await this.client.chat.completions.create({
        messages,
        model,
        max_tokens: 4000,
      });

      return {
        success: true,
        data: completion.choices[0]?.message?.content || '',
        usage: completion.usage,
        model: completion.model,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  async generateImage(prompt: string, size: '256x256' | '512x512' | '1024x1024' = '1024x1024'): Promise<any> {
    try {
      const response = await this.client.images.generate({
        prompt,
        size,
        n: 1,
      });

      return {
        success: true,
        data: response.data[0]?.url,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  async transcribe(audioBuffer: Buffer): Promise<any> {
    try {
      const file = new File([audioBuffer], 'audio.webm', { type: 'audio/webm' });
      const transcription = await this.client.audio.transcriptions.create({
        file,
        model: 'whisper-1',
      });

      return {
        success: true,
        data: transcription.text,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  async synthesizeSpeech(text: string, voice: 'alloy' | 'echo' | 'fable' | 'onyx' | 'nova' | 'shimmer' = 'alloy'): Promise<any> {
    try {
      const response = await this.client.audio.speech.create({
        model: 'tts-1',
        voice,
        input: text,
      });

      return {
        success: true,
        data: Buffer.from(await response.arrayBuffer()),
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }
}

export const openAIService = new OpenAIService();