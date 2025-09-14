import { apiRequest } from "./queryClient";

export interface Session {
  id: string;
  status: string;
  createdAt: string;
  expiresAt: string;
  lastActivity: string;
}

export interface Event {
  id: string;
  sessionId: string | null;
  route: string;
  method: string;
  status: number;
  payload: any;
  responseText: string | null;
  timestamp: string;
  duration: number | null;
  correlationId: string | null;
}

export interface LinkLanguageAPI {
  // Session management
  createSession(): Promise<Session>;
  getActiveSessions(): Promise<Session[]>;
  
  // Command execution
  executeCommand(command: string): Promise<{ result: string; status: number }>;
  
  // Event and log access
  getRecentEvents(limit?: number): Promise<Event[]>;
  getSessionEvents(sessionId: string): Promise<Event[]>;
  
  // Health and status
  getHealth(): Promise<any>;
}

export class EirosLinkAPI implements LinkLanguageAPI {
  async createSession(): Promise<Session> {
    const response = await apiRequest('POST', '/api/sessions');
    return response.json();
  }

  async getActiveSessions(): Promise<Session[]> {
    const response = await apiRequest('GET', '/api/sessions/active');
    return response.json();
  }

  async executeCommand(command: string): Promise<{ result: string; status: number }> {
    const response = await apiRequest('POST', '/api/execute', { command });
    return response.json();
  }

  async getRecentEvents(limit = 50): Promise<Event[]> {
    const response = await apiRequest('GET', `/api/events/recent?limit=${limit}`);
    return response.json();
  }

  async getSessionEvents(sessionId: string): Promise<Event[]> {
    const response = await apiRequest('GET', `/board_json/${sessionId}`);
    const data = await response.json();
    return data.events || [];
  }

  async getHealth(): Promise<any> {
    const response = await apiRequest('GET', '/h/health');
    return response.text();
  }

  // Coordinate actions
  async stageA(sessionId: string, x: number): Promise<string> {
    const response = await apiRequest('GET', `/h/A/${x}/${sessionId}`);
    return response.text();
  }

  async stageB(sessionId: string, y: number): Promise<string> {
    const response = await apiRequest('GET', `/h/B/${y}/${sessionId}`);
    return response.text();
  }

  async clickStaging(sessionId: string): Promise<string> {
    const response = await apiRequest('GET', `/h/C/${sessionId}`);
    return response.text();
  }

  async clickOneshot(sessionId: string, x: number, y: number): Promise<string> {
    const response = await apiRequest('GET', `/h/C/${x}/${y}/${sessionId}`);
    return response.text();
  }

  async clearBuffer(sessionId: string): Promise<string> {
    const response = await apiRequest('GET', `/h/x/${sessionId}`);
    return response.text();
  }

  async executeBuffer(sessionId: string): Promise<string> {
    const response = await apiRequest('GET', `/h/g/${sessionId}`);
    return response.text();
  }

  async writeCharacter(sessionId: string, char: string): Promise<string> {
    const response = await apiRequest('GET', `/h/w/${char}/${sessionId}`);
    return response.text();
  }

  async encodeCommand(sessionId: string, command: string): Promise<string> {
    const response = await apiRequest('GET', `/h/encode/${sessionId}/${command}`);
    return response.text();
  }
}

export const api = new EirosLinkAPI();
