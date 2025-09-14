import { 
  sessions, events, artifacts, llmLogs, coordinateState, users, chatMessages, userGoals, sessionCounter, automationModelConfig,
  type Session, type Event, type Artifact, type LlmLog, type CoordinateState, type User, type ChatMessage, type UserGoal, type SessionCounter, type AutomationModelConfig,
  type InsertSession, type InsertEvent, type InsertArtifact, type InsertLlmLog, type InsertCoordinateState, type InsertUser, type InsertChatMessage, type InsertUserGoal, type InsertAutomationModelConfig
} from "@shared/schema";
import { db } from "./db";
import { eq, desc, and, gte, gt, lt, sql } from "drizzle-orm";

export interface IStorage {
  // User management (existing)
  getUser(id: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  getOrCreateDemoUser(): Promise<User>; // Consistent demo user management
  
  // Subscription management
  updateUserSubscription(id: string, plan: string, active: boolean, expiresAt?: Date): Promise<void>;
  getUserSubscriptionStatus(id: string): Promise<{ plan: string, active: boolean, expiresAt?: Date } | undefined>;

  // Session management
  createSession(session: InsertSession): Promise<Session>;
  getSession(id: string): Promise<Session | undefined>;
  updateSessionActivity(id: string): Promise<void>;
  updateSessionDefaultModel(id: string, model: string): Promise<void>;
  updateSessionContext(id: string, enabled: boolean): Promise<void>;
  closeSession(id: string): Promise<void>;
  getActiveSessions(): Promise<Session[]>;
  cleanupExpiredSessions(): Promise<void>;

  // Event management
  createEvent(event: InsertEvent): Promise<Event>;
  getEventsBySession(sessionId: string, limit?: number): Promise<Event[]>;
  getRecentEvents(limit?: number): Promise<Event[]>;

  // Artifact management
  createArtifact(artifact: InsertArtifact): Promise<Artifact>;
  getArtifacts(): Promise<Artifact[]>;
  getArtifact(id: string): Promise<Artifact | undefined>;
  getArtifactsBySession(sessionId: string): Promise<Artifact[]>;

  // LLM logs
  createLlmLog(log: InsertLlmLog): Promise<LlmLog>;
  getLlmLogsBySession(sessionId: string): Promise<LlmLog[]>;

  // Coordinate state
  upsertCoordinateState(state: InsertCoordinateState): Promise<CoordinateState>;
  getCoordinateState(sessionId: string): Promise<CoordinateState | undefined>;
  clearCoordinateState(sessionId: string): Promise<void>;

  // Chat messages
  createChatMessage(message: InsertChatMessage): Promise<ChatMessage>;
  getChatMessagesBySession(sessionId: string, limit?: number): Promise<ChatMessage[]>;
  getRecentChatMessages(limit?: number): Promise<ChatMessage[]>;
  clearChatMessages(sessionId: string): Promise<void>;

  // User Goals - РЕШАЕТ ПРОБЛЕМУ ПОТЕРИ ЛОГИКИ
  createUserGoal(goal: InsertUserGoal): Promise<UserGoal>;
  getUserGoalBySession(sessionId: string): Promise<UserGoal | undefined>;
  updateUserGoal(id: string, updates: Partial<UserGoal>): Promise<void>;
  updateGoalProgress(sessionId: string, currentStep: number, stepResult?: any): Promise<void>;
  completeUserGoal(sessionId: string): Promise<void>;

  // Automation Model Configuration
  createAutomationModelConfig(config: InsertAutomationModelConfig): Promise<AutomationModelConfig>;
  getAutomationModelConfig(userId?: string): Promise<AutomationModelConfig | undefined>;
  updateAutomationModelConfig(id: string, updates: Partial<AutomationModelConfig>): Promise<void>;
  getOrCreateDefaultAutomationConfig(userId?: string): Promise<AutomationModelConfig>;
  deleteAutomationModelConfig(id: string): Promise<void>;

  // Session counter for numeric IDs
  generateNextSessionId(): Promise<string>;
}

export class DatabaseStorage implements IStorage {
  // User methods (existing)
  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user || undefined;
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.username, username));
    return user || undefined;
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const [user] = await db
      .insert(users)
      .values(insertUser)
      .returning();
    return user;
  }

  // Demo user management for consistent identity
  async getOrCreateDemoUser(): Promise<User> {
    const demoUsername = 'demo-user';
    
    // Use existing user with this username, or create if none exists
    let user = await this.getUserByUsername(demoUsername);
    
    if (!user) {
      // Only create if no user exists with this username
      try {
        user = await this.createUser({
          username: demoUsername,
          password: '$2b$10$demo.hash.placeholder.secure', // Secure placeholder
          plan: 'free'
        });
      } catch (error) {
        // If still fails, try to get any existing user with this username
        user = await this.getUserByUsername(demoUsername);
        if (!user) {
          throw error; // Re-throw if truly can't create or find
        }
      }
    }
    
    return user!;
  }

  // Session methods
  async createSession(session: InsertSession): Promise<Session> {
    const [created] = await db
      .insert(sessions)
      .values(session)
      .returning();
    return created;
  }

  async getSession(id: string): Promise<Session | undefined> {
    const [session] = await db.select().from(sessions).where(eq(sessions.id, id));
    return session || undefined;
  }

  async updateSessionActivity(id: string): Promise<void> {
    await db
      .update(sessions)
      .set({ lastActivity: new Date() })
      .where(eq(sessions.id, id));
  }

  async updateSessionDefaultModel(id: string, model: string): Promise<void> {
    await db
      .update(sessions)
      .set({ defaultModel: model })
      .where(eq(sessions.id, id));
  }

  async updateSessionContext(id: string, enabled: boolean): Promise<void> {
    await db
      .update(sessions)
      .set({ contextEnabled: enabled })
      .where(eq(sessions.id, id));
  }

  // Subscription methods
  async updateUserSubscription(id: string, plan: string, active: boolean, expiresAt?: Date): Promise<void> {
    await db
      .update(users)
      .set({ 
        plan, 
        subscriptionActive: active, 
        subscriptionExpiresAt: expiresAt 
      })
      .where(eq(users.id, id));
  }

  async getUserSubscriptionStatus(id: string): Promise<{ plan: string, active: boolean, expiresAt?: Date } | undefined> {
    const [user] = await db
      .select({
        plan: users.plan,
        active: users.subscriptionActive,
        expiresAt: users.subscriptionExpiresAt
      })
      .from(users)
      .where(eq(users.id, id));
    
    if (!user) return undefined;
    
    return {
      plan: user.plan,
      active: user.active,
      expiresAt: user.expiresAt || undefined
    };
  }

  async updateSession(id: string, updates: Partial<Pick<Session, 'status' | 'expiresAt' | 'lastActivity'>>): Promise<void> {
    await db
      .update(sessions)
      .set(updates)
      .where(eq(sessions.id, id));
  }

  async closeSession(id: string): Promise<void> {
    await db
      .update(sessions)
      .set({ status: "closed" })
      .where(eq(sessions.id, id));
  }

  async deleteSession(id: string): Promise<void> {
    await db
      .delete(sessions)
      .where(eq(sessions.id, id));
  }

  async getActiveSessions(): Promise<Session[]> {
    return await db
      .select()
      .from(sessions)
      .where(and(eq(sessions.status, "active"), gt(sessions.expiresAt, new Date())));
  }

  async cleanupExpiredSessions(): Promise<void> {
    await db
      .update(sessions)
      .set({ status: "expired" })
      .where(and(eq(sessions.status, "active"), lt(sessions.expiresAt, new Date())));
  }

  // Event methods
  async createEvent(event: InsertEvent): Promise<Event> {
    const [created] = await db
      .insert(events)
      .values(event)
      .returning();
    return created;
  }

  async getEventsBySession(sessionId: string, limit = 100): Promise<Event[]> {
    return await db
      .select()
      .from(events)
      .where(eq(events.sessionId, sessionId))
      .orderBy(desc(events.timestamp))
      .limit(limit);
  }

  async getRecentEvents(limit = 50): Promise<Event[]> {
    return await db
      .select()
      .from(events)
      .orderBy(desc(events.timestamp))
      .limit(limit);
  }

  // Artifact methods
  async createArtifact(artifact: InsertArtifact): Promise<Artifact> {
    const [created] = await db
      .insert(artifacts)
      .values(artifact)
      .returning();
    return created;
  }

  async getArtifacts(): Promise<Artifact[]> {
    return await db.select().from(artifacts).orderBy(desc(artifacts.createdAt));
  }

  async getArtifact(id: string): Promise<Artifact | undefined> {
    const [artifact] = await db.select().from(artifacts).where(eq(artifacts.id, id));
    return artifact || undefined;
  }

  async getArtifactsBySession(sessionId: string): Promise<Artifact[]> {
    return await db
      .select()
      .from(artifacts)
      .where(eq(artifacts.sessionId, sessionId))
      .orderBy(desc(artifacts.createdAt));
  }

  // LLM log methods
  async createLlmLog(log: InsertLlmLog): Promise<LlmLog> {
    const [created] = await db
      .insert(llmLogs)
      .values(log)
      .returning();
    return created;
  }

  async getLlmLogsBySession(sessionId: string): Promise<LlmLog[]> {
    return await db
      .select()
      .from(llmLogs)
      .where(eq(llmLogs.sessionId, sessionId))
      .orderBy(desc(llmLogs.timestamp));
  }

  // Coordinate state methods
  async upsertCoordinateState(state: InsertCoordinateState): Promise<CoordinateState> {
    const existing = await this.getCoordinateState(state.sessionId!);
    
    if (existing) {
      const [updated] = await db
        .update(coordinateState)
        .set({ ...state, updatedAt: new Date() })
        .where(eq(coordinateState.sessionId, state.sessionId!))
        .returning();
      return updated;
    } else {
      const [created] = await db
        .insert(coordinateState)
        .values(state)
        .returning();
      return created;
    }
  }

  async getCoordinateState(sessionId: string): Promise<CoordinateState | undefined> {
    const [state] = await db
      .select()
      .from(coordinateState)
      .where(eq(coordinateState.sessionId, sessionId));
    return state || undefined;
  }

  async clearCoordinateState(sessionId: string): Promise<void> {
    await db
      .update(coordinateState)
      .set({ 
        stageA: null, 
        stageB: null, 
        ready: false, 
        updatedAt: new Date() 
      })
      .where(eq(coordinateState.sessionId, sessionId));
  }

  // Chat message methods
  async createChatMessage(message: InsertChatMessage): Promise<ChatMessage> {
    const [created] = await db.insert(chatMessages).values(message).returning();
    return created;
  }

  async getChatMessagesBySession(sessionId: string, limit: number = 50): Promise<ChatMessage[]> {
    return db
      .select()
      .from(chatMessages)
      .where(eq(chatMessages.sessionId, sessionId))
      .orderBy(desc(chatMessages.timestamp))
      .limit(limit);
  }

  async getRecentChatMessages(limit: number = 100): Promise<ChatMessage[]> {
    return db
      .select()
      .from(chatMessages)
      .orderBy(desc(chatMessages.timestamp))
      .limit(limit);
  }

  async clearChatMessages(sessionId: string): Promise<void> {
    await db.delete(chatMessages).where(eq(chatMessages.sessionId, sessionId));
  }

  // User Goals methods - РЕШАЕТ ПРОБЛЕМУ ПОТЕРИ ЛОГИКИ AI
  async createUserGoal(goal: InsertUserGoal): Promise<UserGoal> {
    const [created] = await db.insert(userGoals).values(goal).returning();
    return created;
  }

  async getUserGoalBySession(sessionId: string): Promise<UserGoal | undefined> {
    const [goal] = await db
      .select()
      .from(userGoals)
      .where(and(
        eq(userGoals.sessionId, sessionId),
        eq(userGoals.status, 'active')
      ))
      .orderBy(desc(userGoals.lastUpdated))
      .limit(1);
    return goal || undefined;
  }

  async updateUserGoal(id: string, updates: Partial<UserGoal>): Promise<void> {
    await db
      .update(userGoals)
      .set({ ...updates, lastUpdated: new Date() })
      .where(eq(userGoals.id, id));
  }

  async updateGoalProgress(sessionId: string, currentStep: number, stepResult?: any): Promise<void> {
    const goal = await this.getUserGoalBySession(sessionId);
    if (!goal) return;
    
    const stepResults = (goal.stepResults as any[]) || [];
    stepResults[currentStep] = stepResult;
    
    await this.updateUserGoal(goal.id, {
      currentStep,
      stepResults,
      lastUpdated: new Date()
    });
  }

  async completeUserGoal(sessionId: string): Promise<void> {
    await db
      .update(userGoals)
      .set({ status: 'completed', lastUpdated: new Date() })
      .where(and(
        eq(userGoals.sessionId, sessionId),
        eq(userGoals.status, 'active')
      ));
  }

  // Automation Model Configuration methods
  async createAutomationModelConfig(config: InsertAutomationModelConfig): Promise<AutomationModelConfig> {
    const [created] = await db.insert(automationModelConfig).values(config).returning();
    return created;
  }

  async getAutomationModelConfig(userId?: string): Promise<AutomationModelConfig | undefined> {
    // Get user-specific config first, then fall back to global config
    if (userId) {
      const [userConfig] = await db
        .select()
        .from(automationModelConfig)
        .where(and(
          eq(automationModelConfig.userId, userId),
          eq(automationModelConfig.isActive, true)
        ))
        .orderBy(desc(automationModelConfig.updatedAt))
        .limit(1);
      
      if (userConfig) return userConfig;
    }

    // Fall back to global config
    const [globalConfig] = await db
      .select()
      .from(automationModelConfig)
      .where(and(
        eq(automationModelConfig.isGlobal, true),
        eq(automationModelConfig.isActive, true)
      ))
      .orderBy(desc(automationModelConfig.updatedAt))
      .limit(1);
    
    return globalConfig || undefined;
  }

  async updateAutomationModelConfig(id: string, updates: Partial<AutomationModelConfig>): Promise<void> {
    await db
      .update(automationModelConfig)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(automationModelConfig.id, id));
  }

  async getOrCreateDefaultAutomationConfig(userId?: string): Promise<AutomationModelConfig> {
    // Try to get existing config
    const existing = await this.getAutomationModelConfig(userId);
    if (existing) return existing;

    // Create default global config if none exists
    const defaultConfig: InsertAutomationModelConfig = {
      userId: userId || null,
      planningModel: "openai/gpt-4o-mini",
      executionModel: "openai/gpt-4o-mini", 
      completionModel: "openai/gpt-4o-mini",
      fallbackModel: "openai/gpt-4o-mini",
      isGlobal: !userId, // Global if no user specified
      isActive: true
    };

    return await this.createAutomationModelConfig(defaultConfig);
  }

  async deleteAutomationModelConfig(id: string): Promise<void> {
    await db.delete(automationModelConfig).where(eq(automationModelConfig.id, id));
  }

  // Session counter methods for numeric IDs
  async generateNextSessionId(): Promise<string> {
    try {
      // Use raw SQL for atomic increment with upsert
      const result = await db.execute(sql`
        INSERT INTO session_counter (id, current_value, updated_at)
        VALUES ('counter', 2, NOW())
        ON CONFLICT (id) 
        DO UPDATE SET 
          current_value = session_counter.current_value + 1,
          updated_at = NOW()
        RETURNING current_value
      `);
      
      const currentValue = result.rows[0]?.current_value as number;
      return `sess_${currentValue}`;
    } catch (error) {
      console.error('Error generating session ID:', error);
      // Fallback to timestamp-based ID if something goes wrong
      return `sess_${Date.now().toString().slice(-6)}`;
    }
  }
}

export const storage = new DatabaseStorage();
