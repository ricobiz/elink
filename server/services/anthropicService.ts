import Anthropic from '@anthropic-ai/sdk';

export class AnthropicService {
  private client: Anthropic;
  private apiKey: string;

  constructor() {
    this.apiKey = process.env.ANTHROPIC_API_KEY || '';
    if (!this.apiKey) {
      console.warn('ANTHROPIC_API_KEY not found in environment variables');
    }
    
    this.client = new Anthropic({
      apiKey: this.apiKey,
    });
  }

  async chat(messages: any[], model: string = 'claude-3-haiku-20240307'): Promise<any> {
    try {
      // Convert OpenAI format to Anthropic format
      const systemMessage = messages.find(m => m.role === 'system');
      const userMessages = messages.filter(m => m.role !== 'system');

      const response = await this.client.messages.create({
        model,
        max_tokens: 4000,
        system: systemMessage?.content || '',
        messages: userMessages.map(m => ({
          role: m.role === 'assistant' ? 'assistant' : 'user',
          content: m.content,
        })),
      });

      return {
        success: true,
        data: response.content[0]?.type === 'text' ? response.content[0].text : '',
        usage: response.usage,
        model: response.model,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  async analyzeImage(imageBase64: string, prompt: string = 'Describe this image'): Promise<any> {
    try {
      const response = await this.client.messages.create({
        model: 'claude-3-haiku-20240307',
        max_tokens: 1000,
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: prompt,
              },
              {
                type: 'image',
                source: {
                  type: 'base64',
                  media_type: 'image/jpeg',
                  data: imageBase64,
                },
              },
            ],
          },
        ],
      });

      return {
        success: true,
        data: response.content[0]?.type === 'text' ? response.content[0].text : '',
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }
}

export const anthropicService = new AnthropicService();