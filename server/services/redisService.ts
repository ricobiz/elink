import { createClient, RedisClientType } from 'redis';

export interface SessionMemory {
  sessionId: string;
  context: string[];
  model: string;
  lastActivity: number;
  userPreferences: Record<string, any>;
  conversationSummary?: string;
  totalMessages: number;
}

export class RedisService {
  private client: RedisClientType | null = null;
  private isConnected = false;

  async connect(): Promise<void> {
    if (!process.env.REDIS_URL) {
      throw new Error('❌ REDIS_URL не найден в переменных окружения');
    }

    try {
      // Use Redis URL from environment variable only - no hardcoded credentials
      let redisUrl = process.env.REDIS_URL;
      let requireTLS = false;
      let username = '';
      let password = '';

      // Handle different Redis URL formats with proper authentication parsing
      if (redisUrl.startsWith('https://')) {
        // Parse Upstash format: https://default:TOKEN@host:port
        const urlPattern = /^https:\/\/([^:]*):([^@]*)@([^:]*):?(\d*)\/?$/;
        const match = redisUrl.match(urlPattern);
        
        if (match) {
          username = match[1] || 'default';
          password = match[2];
          const host = match[3];
          const port = match[4] || '6379';
          
          redisUrl = `rediss://${host}:${port}`;
          requireTLS = true;
          console.log(`🔄 Converting Upstash HTTPS URL to rediss:// format with auth`);
          console.log(`🔑 Username: ${username}, Host: ${host}:${port}`);
        } else {
          // Fallback: simple conversion for URLs without auth
          redisUrl = redisUrl.replace('https://', 'rediss://');
          requireTLS = true;
          console.log('🔄 Converting Upstash HTTPS URL to rediss:// format (no auth parsed)');
        }
      } else if (redisUrl.startsWith('redis://')) {
        // Parse redis:// format with embedded auth: redis://user:pass@host:port
        const urlPattern = /^redis:\/\/([^:]*):([^@]*)@([^:]*):(\d+)\/?$/;
        const match = redisUrl.match(urlPattern);
        
        if (match) {
          username = match[1] || 'default';
          password = match[2];
          const host = match[3];
          const port = match[4] || '6379';
          
          // For Upstash, we need TLS even with redis:// URLs
          redisUrl = `rediss://${host}:${port}`;
          requireTLS = true;
          console.log(`🔄 Converting redis:// URL to rediss:// format with auth`);
          console.log(`🔑 Username: ${username}, Host: ${host}:${port}`);
        } else {
          // No auth embedded, keep as is
          requireTLS = false;
          console.log('🔄 Using redis:// URL as-is (no auth parsed)');
        }
      } else if (redisUrl.startsWith('http://')) {
        redisUrl = redisUrl.replace('http://', 'redis://');
        requireTLS = false;
      } else if (redisUrl.startsWith('rediss://')) {
        requireTLS = true;
      }

      const clientOptions: any = {
        url: redisUrl,
        socket: requireTLS ? {
          tls: true,
          // TLS certificate validation enabled for security
        } : undefined
      };

      // Add authentication if parsed from URL
      if (username && password) {
        clientOptions.username = username;
        clientOptions.password = password;
        console.log('🔐 Redis authentication configured');
      }

      this.client = createClient(clientOptions);

      this.client.on('error', (err) => {
        console.error('❌ Redis Client Error:', err);
        this.isConnected = false;
      });

      this.client.on('connect', () => {
        console.log('🔄 Подключение к Redis...');
      });

      this.client.on('ready', () => {
        console.log('✅ Redis подключен и готов к работе');
        this.isConnected = true;
      });

      await this.client.connect();
    } catch (error) {
      console.error('❌ Ошибка подключения к Redis:', error);
      throw error;
    }
  }

  async disconnect(): Promise<void> {
    if (this.client) {
      await this.client.disconnect();
      this.isConnected = false;
      console.log('🔌 Redis отключен');
    }
  }

  async isConnectedToRedis(): Promise<boolean> {
    return this.isConnected && this.client?.isReady === true;
  }

  // Сохранить память сессии
  async setSessionMemory(sessionId: string, memory: SessionMemory): Promise<void> {
    if (!this.client || !this.isConnected) {
      throw new Error('Redis не подключен');
    }

    const key = `session:${sessionId}:memory`;
    const ttl = 2 * 60 * 60; // 2 часа TTL

    try {
      await this.client.setEx(key, ttl, JSON.stringify(memory));
      console.log(`💾 Память сессии ${sessionId} сохранена в Redis`);
    } catch (error) {
      console.error('❌ Ошибка сохранения памяти сессии:', error);
      throw error;
    }
  }

  // Получить память сессии
  async getSessionMemory(sessionId: string): Promise<SessionMemory | null> {
    if (!this.client || !this.isConnected) {
      throw new Error('Redis не подключен');
    }

    const key = `session:${sessionId}:memory`;

    try {
      const data = await this.client.get(key);
      if (!data) {
        console.log(`🔍 Память для сессии ${sessionId} не найдена в Redis`);
        return null;
      }

      const memory = JSON.parse(data) as SessionMemory;
      console.log(`📖 Память сессии ${sessionId} загружена из Redis`);
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
      model: 'openai/gpt-4-turbo',
      lastActivity: Date.now(),
      userPreferences: {},
      totalMessages: 0
    };

    // Добавляем новое сообщение в контекст
    memory.context.push(`${role}: ${message}`);
    memory.lastActivity = Date.now();
    memory.totalMessages++;

    // Обрезаем контекст если слишком длинный (максимум 20 сообщений)
    if (memory.context.length > 20) {
      memory.context = memory.context.slice(-20);
    }

    await this.setSessionMemory(sessionId, memory);
  }

  // Получить контекст для LLM
  async getContextForLLM(sessionId: string): Promise<string> {
    const memory = await this.getSessionMemory(sessionId);
    if (!memory || memory.context.length === 0) {
      return 'Новая сессия - контекст пуст.';
    }

    return memory.context.join('\n');
  }

  // Обновить модель для сессии
  async setSessionModel(sessionId: string, model: string): Promise<void> {
    let memory = await this.getSessionMemory(sessionId);
    
    if (!memory) {
      memory = {
        sessionId,
        context: [],
        model,
        lastActivity: Date.now(),
        userPreferences: {},
        totalMessages: 0
      };
    } else {
      memory.model = model;
      memory.lastActivity = Date.now();
    }

    await this.setSessionMemory(sessionId, memory);
    console.log(`🤖 Модель для сессии ${sessionId} изменена на: ${model}`);
  }

  // Получить статистику всех сессий
  async getAllSessions(): Promise<string[]> {
    if (!this.client || !this.isConnected) {
      return [];
    }

    try {
      const keys = await this.client.keys('session:*:memory');
      return keys.map(key => key.split(':')[1]); // Извлекаем session ID
    } catch (error) {
      console.error('❌ Ошибка получения списка сессий:', error);
      return [];
    }
  }

  // Очистить память сессии
  async clearSessionMemory(sessionId: string): Promise<void> {
    if (!this.client || !this.isConnected) {
      return;
    }

    const key = `session:${sessionId}:memory`;
    try {
      await this.client.del(key);
      console.log(`🗑️ Память сессии ${sessionId} очищена`);
    } catch (error) {
      console.error('❌ Ошибка очистки памяти сессии:', error);
    }
  }

  // Проверить здоровье Redis
  async healthCheck(): Promise<{ status: string; details?: string }> {
    try {
      if (!this.client || !this.isConnected) {
        return { status: 'disconnected', details: 'Redis client not connected' };
      }

      const result = await this.client.ping();
      if (result === 'PONG') {
        const info = await this.client.info('replication');
        return { status: 'healthy', details: `Connected to Redis. ${info.split('\n')[0]}` };
      } else {
        return { status: 'unhealthy', details: 'Ping failed' };
      }
    } catch (error) {
      return { status: 'error', details: `Redis error: ${error instanceof Error ? error.message : String(error)}` };
    }
  }
}

// Singleton instance
export const redisService = new RedisService();