import Database from '@replit/database';

export interface SessionMemory {
  sessionId: string;
  context: string[];
  model: string;
  lastActivity: number;
  userPreferences: Record<string, any>;
  conversationSummary?: string;
  totalMessages: number;
}

export class ReplDBService {
  private db: Database;
  private isConnected = false;

  constructor() {
    this.db = new Database();
  }

  async connect(): Promise<void> {
    try {
      // Test connection with a simple ping
      await this.db.set('ping', Date.now());
      await this.db.get('ping');
      this.isConnected = true;
      console.log('✅ ReplDB подключена и готова к работе');
    } catch (error) {
      console.error('❌ Ошибка подключения к ReplDB:', error);
      throw error;
    }
  }

  async disconnect(): Promise<void> {
    // ReplDB doesn't require explicit disconnect
    this.isConnected = false;
    console.log('🔌 ReplDB отключена');
  }

  async isConnectedToReplDB(): Promise<boolean> {
    return this.isConnected;
  }

  // Сохранить память сессии
  async setSessionMemory(sessionId: string, memory: SessionMemory): Promise<void> {
    if (!this.isConnected) {
      throw new Error('ReplDB не подключена');
    }

    const key = `session:${sessionId}:memory`;

    try {
      // ReplDB automatically handles serialization/deserialization
      await this.db.set(key, memory);
      console.log(`💾 Память сессии ${sessionId} сохранена в ReplDB`);
    } catch (error) {
      console.error('❌ Ошибка сохранения памяти сессии:', error);
      throw error;
    }
  }

  // Получить память сессии
  async getSessionMemory(sessionId: string): Promise<SessionMemory | null> {
    if (!this.isConnected) {
      throw new Error('ReplDB не подключена');
    }

    const key = `session:${sessionId}:memory`;

    try {
      const result = await this.db.get(key);
      if (!result || typeof result !== 'object') {
        console.log(`🔍 Память для сессии ${sessionId} не найдена в ReplDB`);
        return null;
      }
      const memory = result as unknown as SessionMemory;
      if (!memory) {
        console.log(`🔍 Память для сессии ${sessionId} не найдена в ReplDB`);
        return null;
      }

      console.log(`📖 Память сессии ${sessionId} загружена из ReplDB`);
      return memory;
    } catch (error) {
      console.error('❌ Ошибка получения памяти сессии:', error);
      return null;
    }
  }

  // Добавить сообщение в контекст сессии
  async addToContext(sessionId: string, message: string, role: 'user' | 'assistant'): Promise<void> {
    const memory = await this.getSessionMemory(sessionId) || {
      sessionId,
      context: [],
      model: 'openai/gpt-4o-mini',
      lastActivity: Date.now(),
      userPreferences: {},
      totalMessages: 0
    };

    // Добавляем новое сообщение в контекст
    const contextEntry = `${role}: ${message}`;
    memory.context.push(contextEntry);
    memory.lastActivity = Date.now();
    memory.totalMessages += 1;

    // Ограничиваем контекст максимум 20 сообщениями
    if (memory.context.length > 20) {
      memory.context = memory.context.slice(-20);
    }

    await this.setSessionMemory(sessionId, memory);
    console.log(`📝 Сообщение добавлено в контекст сессии ${sessionId}`);
  }

  // Получить контекст сессии
  async getContext(sessionId: string): Promise<string[]> {
    const memory = await this.getSessionMemory(sessionId);
    return memory?.context || [];
  }

  // Обновить модель сессии
  async updateSessionModel(sessionId: string, model: string): Promise<void> {
    const memory = await this.getSessionMemory(sessionId) || {
      sessionId,
      context: [],
      model,
      lastActivity: Date.now(),
      userPreferences: {},
      totalMessages: 0
    };

    memory.model = model;
    memory.lastActivity = Date.now();

    await this.setSessionMemory(sessionId, memory);
    console.log(`🤖 Модель сессии ${sessionId} обновлена на ${model}`);
  }

  // Очистить память сессии
  async clearSessionMemory(sessionId: string): Promise<void> {
    if (!this.isConnected) {
      throw new Error('ReplDB не подключена');
    }

    const key = `session:${sessionId}:memory`;

    try {
      await this.db.delete(key);
      console.log(`🗑️ Память сессии ${sessionId} очищена`);
    } catch (error) {
      console.error('❌ Ошибка очистки памяти сессии:', error);
      throw error;
    }
  }

  // Получить все активные сессии
  async getActiveSessions(): Promise<string[]> {
    if (!this.isConnected) {
      throw new Error('ReplDB не подключена');
    }

    try {
      const keysResult = await this.db.list('session:');
      const keys = Array.isArray(keysResult) ? keysResult : [];
      return keys
        .filter((key: string) => key.includes(':memory'))
        .map((key: string) => key.replace('session:', '').replace(':memory', ''));
    } catch (error) {
      console.error('❌ Ошибка получения активных сессий:', error);
      return [];
    }
  }

  // Health check for monitoring
  async healthCheck(): Promise<{ status: 'healthy' | 'disconnected' | 'degraded', details: any }> {
    try {
      const testKey = 'health_check';
      const testValue = Date.now();
      
      // Test write
      await this.db.set(testKey, testValue);
      
      // Test read
      const result = await this.db.get(testKey);
      
      // Cleanup
      await this.db.delete(testKey);
      
      if (Number(result) === testValue || String(result) === String(testValue)) {
        return {
          status: 'healthy',
          details: {
            message: 'ReplDB working correctly',
            isConnected: this.isConnected,
            testResult: 'PASS'
          }
        };
      } else {
        return {
          status: 'degraded',
          details: {
            message: 'ReplDB read/write test failed',
            isConnected: this.isConnected,
            testResult: 'FAIL'
          }
        };
      }
    } catch (error) {
      return {
        status: 'disconnected',
        details: {
          message: 'ReplDB health check failed',
          error: error instanceof Error ? error.message : String(error),
          isConnected: this.isConnected
        }
      };
    }
  }

  // Cleanup old sessions (TTL equivalent)
  async cleanupOldSessions(maxAgeHours = 24): Promise<void> {
    if (!this.isConnected) {
      throw new Error('ReplDB не подключена');
    }

    try {
      const cutoffTime = Date.now() - (maxAgeHours * 60 * 60 * 1000);
      const sessions = await this.getActiveSessions();
      
      let cleaned = 0;
      for (const sessionId of sessions) {
        const memory = await this.getSessionMemory(sessionId);
        if (memory && memory.lastActivity < cutoffTime) {
          await this.clearSessionMemory(sessionId);
          cleaned++;
        }
      }
      
      console.log(`🧹 Очищено ${cleaned} старых сессий`);
    } catch (error) {
      console.error('❌ Ошибка очистки старых сессий:', error);
    }
  }
}

export const repldbService = new ReplDBService();