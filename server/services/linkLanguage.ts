import { randomUUID } from "crypto";

export interface LinkLanguageResponse {
  service: string;
  route: string;
  sid: string;
  status: "ok" | "placeholder" | "error";
  version: string;
  timestamp: string;
  data?: any;
}

export interface ParsedCommand {
  route: string;
  sessionId: string;
  command?: string;
  character?: string;
  coordinates?: { x: number; y: number };
  action?: string;
}

export class LinkLanguageService {
  private version = "1.0.0";

  parseRoute(path: string): ParsedCommand | null {
    // Remove leading slash
    const cleanPath = path.startsWith('/') ? path.slice(1) : path;
    const parts = cleanPath.split('/');

    if (parts[0] !== 'h') {
      return null;
    }

    if (parts.length < 2) {
      return null;
    }

    const command = parts[1];
    let sessionId = '';
    
    // Extract session ID (usually last part)
    if (parts.length > 2) {
      sessionId = parts[parts.length - 1];
    }

    switch (command) {
      case 'health':
        return { route: '/h/health', sessionId: '', command: 'health' };
      
      case 'x':
        return { route: '/h/x', sessionId, command: 'clear' };
      
      case 'g':
        return { route: '/h/g', sessionId, command: 'execute' };
      
      case 'w':
        if (parts.length >= 4) {
          const character = parts[2];
          return { route: '/h/w', sessionId, command: 'write', character };
        }
        break;
      
      case '1':
        return { route: '/h/1', sessionId, command: 'screenshot' };
      
      case 'zone':
        if (parts.length >= 4) {
          const zoneNumber = parseInt(parts[2]);
          if (zoneNumber >= 1 && zoneNumber <= 9) {
            return { route: '/h/zone', sessionId, command: 'zone_screenshot', character: parts[2] };
          }
        }
        break;
      
      case '2':
        return { route: '/h/2', sessionId, command: 'scroll' };
      
      case '3':
        return { route: '/h/3', sessionId, command: 'click' };
      
      case 'encode':
        if (parts.length >= 4) {
          const encodedCmd = parts.slice(3).join('/');
          return { route: '/h/encode', sessionId: parts[2], command: 'encode', character: encodedCmd };
        }
        break;
      
      case 'A':
        if (parts.length >= 4) {
          const x = parseInt(parts[2]);
          return { route: '/h/A', sessionId, command: 'stage_a', coordinates: { x, y: 0 } };
        }
        break;
      
      case 'B':
        if (parts.length >= 4) {
          const y = parseInt(parts[2]);
          return { route: '/h/B', sessionId, command: 'stage_b', coordinates: { x: 0, y } };
        }
        break;
      
      case 'C':
        if (parts.length >= 4 && parts.length === 5) {
          // One-shot C(x,y)
          const x = parseInt(parts[2]);
          const y = parseInt(parts[3]);
          return { route: '/h/C', sessionId, command: 'click_oneshot', coordinates: { x, y } };
        } else if (parts.length >= 3) {
          // Staging C
          return { route: '/h/C', sessionId, command: 'click_staging' };
        }
        break;

      case 'proxy':
        if (parts.length >= 3) {
          const mode = parts[2]; // decodo, direct, status
          const targetSessionId = parts[3] || sessionId;
          return { route: '/h/proxy', sessionId: targetSessionId, command: 'proxy_control', character: mode };
        }
        break;
    }

    return null;
  }

  formatResponse(response: LinkLanguageResponse): string {
    const lines = [
      `SERVICE: ${response.service}`,
      `ROUTE: ${response.route}`,
      `SID: ${response.sid}`,
      `STATUS: ${response.status}`,
      `VERSION: ${response.version}`,
      `TIMESTAMP: ${response.timestamp}`,
    ];

    if (response.data) {
      if (typeof response.data === 'string') {
        lines.push(response.data);
      } else {
        Object.entries(response.data).forEach(([key, value]) => {
          lines.push(`${key.toUpperCase()}: ${value}`);
        });
      }
    }

    return `<pre>${lines.join('\n')}</pre>`;
  }

  createResponse(
    route: string,
    sessionId: string,
    status: "ok" | "placeholder" | "error",
    data?: any
  ): LinkLanguageResponse {
    return {
      service: "EIROS_LINK",
      route,
      sid: sessionId,
      status,
      version: this.version,
      timestamp: new Date().toISOString(),
      data,
    };
  }

  generateSessionId(): string {
    return `sess_${randomUUID().slice(0, 8)}`;
  }

  isSessionExpired(session: { expiresAt: Date }): boolean {
    return new Date() > session.expiresAt;
  }

  createSessionExpiry(ttlMinutes = 120): Date {
    return new Date(Date.now() + ttlMinutes * 60 * 1000);
  }
}

export const linkLanguageService = new LinkLanguageService();
