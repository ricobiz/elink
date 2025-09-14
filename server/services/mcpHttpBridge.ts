import express from 'express';
import { playwrightService } from './playwrightService.js';

interface MCPRequest {
  method: string;
  params?: any;
}

interface MCPResponse {
  success: boolean;
  data?: any;
  error?: string;
  duration?: number;
}

export class MCPHttpBridge {
  public app: express.Express;

  constructor() {
    this.app = express();
    this.app.use(express.json());
    this.setupRoutes();
  }

  private setupRoutes() {
    this.app.post('/execute', async (req, res) => {
      try {
        const { sessionId, action } = req.body;
        const result = await this.executeAction(action, sessionId);
        res.json(result);
      } catch (error) {
        res.status(500).json({
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    });

    this.app.get('/health', (req, res) => {
      res.json({
        status: 'ok',
        playwright: 'ready',
        timestamp: new Date().toISOString(),
        sessions: playwrightService.getActiveSessions()
      });
    });
  }

  private async executeAction(action: any, sessionId?: string): Promise<MCPResponse> {
    const startTime = Date.now();
    const sid = sessionId || 'default';

    console.log(`🎬 Выполняем действие: ${action.type} для сессии ${sid}`);
    
    try {
      let result: any;

      switch (action.type) {
        case 'screenshot':
          const screenshotPath = await playwrightService.screenshot(sid, action.params?.fullPage || false);
          result = {
            content: [{
              type: 'text',
              text: `Скриншот сохранен: ${screenshotPath}`
            }, {
              type: 'resource',
              resource: {
                uri: screenshotPath,
                mimeType: 'image/png',
                name: `screenshot-${sid}`
              }
            }]
          };
          break;

        case 'navigate':
          const navResult = await playwrightService.navigate(sid, action.params?.url || 'about:blank');
          result = {
            content: [{
              type: 'text',
              text: navResult
            }]
          };
          break;

        case 'get_title':
          const titleResult = await playwrightService.getTitle(sid);
          result = {
            content: [{
              type: 'text',
              text: titleResult
            }]
          };
          break;

        case 'get_text':
          const textResult = await playwrightService.getVisibleText(sid);
          result = {
            content: [{
              type: 'text',
              text: textResult.slice(0, 2000) + (textResult.length > 2000 ? '...' : '')
            }]
          };
          break;

        case 'close':
          await playwrightService.closeSession(sid);
          result = {
            content: [{
              type: 'text',
              text: `Сессия ${sid} закрыта`
            }]
          };
          break;

        default:
          throw new Error(`Неподдерживаемый тип действия: ${action.type}`);
      }

      return {
        success: true,
        data: result,
        duration: Date.now() - startTime
      };

    } catch (error) {
      console.error(`❌ Ошибка выполнения ${action.type}:`, error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Неизвестная ошибка',
        duration: Date.now() - startTime
      };
    }
  }

  async start(port: number = 3001): Promise<void> {
    return new Promise((resolve, reject) => {
      const server = this.app.listen(port, () => {
        console.log(`🎭 Playwright HTTP Bridge listening on port ${port}`);
        resolve();
      });
      
      server.on('error', (error) => {
        reject(error);
      });
    });
  }

  // Интеграция в основное приложение
  public getRoutes() {
    return this.app;
  }
}

export const mcpHttpBridge = new MCPHttpBridge();