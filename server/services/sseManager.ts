import { Response } from "express";
import type { Event } from "@shared/schema";

export interface SSEClient {
  id: string;
  response: Response;
  sessionId?: string;
}

export class SSEManager {
  private clients: Map<string, SSEClient> = new Map();

  addClient(id: string, response: Response, sessionId?: string): void {
    // Set enhanced SSE headers for better stability
    response.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Cache-Control',
      'X-Accel-Buffering': 'no', // Disable nginx buffering
      'Access-Control-Allow-Credentials': 'true',
    });

    // Send initial connection event
    response.write(`data: ${JSON.stringify({ type: 'connected', clientId: id })}\n\n`);

    // Store client
    this.clients.set(id, { id, response, sessionId });

    // Handle client disconnect
    response.on('close', () => {
      this.clients.delete(id);
    });
  }

  removeClient(id: string): void {
    const client = this.clients.get(id);
    if (client) {
      try {
        client.response.end();
      } catch (error) {
        // Client already disconnected
      }
      this.clients.delete(id);
    }
  }

  // DEPRECATED: Use broadcastToSession() instead to prevent cross-session leaks
  // Only use this for truly global events (health checks, system status)
  broadcastEvent(event: Event): void {
    const message = `data: ${JSON.stringify({ type: 'event', event })}\n\n`;
    
    this.clients.forEach((client, clientId) => {
      try {
        client.response.write(message);
      } catch (error) {
        // Client disconnected, remove it
        this.clients.delete(clientId);
      }
    });
  }

  // Session-scoped event broadcasting (preferred method)
  broadcastEventToSession(sessionId: string, event: Event): void {
    const message = `data: ${JSON.stringify({ type: 'event', event })}\n\n`;
    
    this.clients.forEach((client, clientId) => {
      if (client.sessionId === sessionId) {
        try {
          client.response.write(message);
        } catch (error) {
          this.clients.delete(clientId);
        }
      }
    });
  }

  broadcastToSession(sessionId: string, data: any): void {
    const message = `data: ${JSON.stringify(data)}\n\n`;
    
    this.clients.forEach((client, clientId) => {
      if (client.sessionId === sessionId) {
        try {
          client.response.write(message);
        } catch (error) {
          this.clients.delete(clientId);
        }
      }
    });
  }

  getClientCount(): number {
    return this.clients.size;
  }

  getActiveSessionIds(): string[] {
    const sessionIds = new Set<string>();
    this.clients.forEach(client => {
      if (client.sessionId) {
        sessionIds.add(client.sessionId);
      }
    });
    return Array.from(sessionIds);
  }

  // КРИТИЧЕСКОЕ ИСПРАВЛЕНИЕ: Добавляем недостающий метод sendToSession
  async sendToSession(sessionId: string, data: any): Promise<boolean> {
    try {
      this.broadcastToSession(sessionId, data);
      return true;
    } catch (error) {
      console.error('Error sending to session:', error);
      return false;
    }
  }

  // Heartbeat для поддержания соединений
  sendHeartbeat(): void {
    const heartbeatMessage = `data: ${JSON.stringify({ type: 'heartbeat', timestamp: Date.now() })}\n\n`;
    
    const deadClients: string[] = [];
    this.clients.forEach((client, clientId) => {
      try {
        client.response.write(heartbeatMessage);
      } catch (error) {
        deadClients.push(clientId);
      }
    });

    // Remove dead clients
    deadClients.forEach(clientId => {
      console.log(`🔌 SSE client ${clientId} disconnected, removing...`);
      this.clients.delete(clientId);
    });
  }

  // Запуск периодического heartbeat для стабильности
  private heartbeatInterval?: NodeJS.Timeout;
  
  startHeartbeat(intervalMs: number = 30000): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
    }
    
    this.heartbeatInterval = setInterval(() => {
      if (this.clients.size > 0) {
        console.log(`💓 SSE Heartbeat: ${this.clients.size} clients connected`);
        this.sendHeartbeat();
      }
    }, intervalMs);
    
    console.log(`💓 SSE Heartbeat started with ${intervalMs}ms interval`);
  }

  stopHeartbeat(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = undefined;
      console.log('💓 SSE Heartbeat stopped');
    }
  }
}

export const sseManager = new SSEManager();
