import { storage } from "../storage";
import { linkLanguageService } from "./linkLanguage";
import type { Session } from "@shared/schema";
import { db } from "../db";
import { sessions } from "@shared/schema";
import { eq } from "drizzle-orm";

export class SessionManager {
  private cleanupInterval: NodeJS.Timeout;

  constructor() {
    // Cleanup expired sessions every 5 minutes
    this.cleanupInterval = setInterval(() => {
      this.cleanupExpiredSessions();
    }, 5 * 60 * 1000);
  }

  async createSession(sessionId?: string): Promise<Session> {
    const id = sessionId || linkLanguageService.generateSessionId();
    const expiresAt = linkLanguageService.createSessionExpiry();
    
    return await storage.createSession({
      id,
      status: "active",
      expiresAt,
      browserContext: null,
    });
  }

  async getOrCreateSession(sessionId: string): Promise<Session> {
    let session = await storage.getSession(sessionId);
    
    if (!session) {
      // Create completely new session 
      session = await this.createSession(sessionId);
    }
    // If session exists (regardless of status), just return it
    // Avoid any updates to prevent foreign key constraint issues

    return session!;
  }

  async validateSession(sessionId: string): Promise<{ valid: boolean; session?: Session }> {
    if (!sessionId) {
      return { valid: false };
    }

    const session = await storage.getSession(sessionId);
    
    if (!session) {
      return { valid: false };
    }

    if (linkLanguageService.isSessionExpired(session)) {
      await storage.closeSession(sessionId);
      return { valid: false };
    }

    return { valid: true, session };
  }

  async cleanupExpiredSessions(): Promise<void> {
    await storage.cleanupExpiredSessions();
  }

  destroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
  }
}

export const sessionManager = new SessionManager();
