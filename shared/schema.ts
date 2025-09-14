import { sql } from "drizzle-orm";
import { pgTable, text, varchar, timestamp, jsonb, integer, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// User schema moved first since sessions references it
export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
  plan: text("plan").notNull().default("free"), // 'free' | 'pro'
  subscriptionActive: boolean("subscription_active").notNull().default(false),
  subscriptionExpiresAt: timestamp("subscription_expires_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const sessions = pgTable("sessions", {
  id: varchar("id").primaryKey(),
  userId: varchar("user_id").references(() => users.id), // Link session to user
  status: text("status").notNull().default("active"), // active, expired, closed
  defaultModel: text("default_model"), // Model selected for this session
  contextEnabled: boolean("context_enabled").notNull().default(false), // Context saving toggle
  createdAt: timestamp("created_at").defaultNow().notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  lastActivity: timestamp("last_activity").defaultNow().notNull(),
  browserContext: jsonb("browser_context"), // Playwright context data
});

export const events = pgTable("events", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  sessionId: varchar("session_id").references(() => sessions.id),
  route: text("route").notNull(), // e.g., "/h/w/a/sess123"
  method: text("method").notNull().default("GET"),
  status: integer("status").notNull().default(200),
  payload: jsonb("payload"), // Request/response data
  responseText: text("response_text"), // HTML <pre> content
  timestamp: timestamp("timestamp").defaultNow().notNull(),
  duration: integer("duration"), // Response time in ms
  correlationId: varchar("correlation_id"),
});

export const artifacts = pgTable("artifacts", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  sessionId: varchar("session_id").references(() => sessions.id),
  eventId: varchar("event_id").references(() => events.id),
  type: text("type").notNull(), // screenshot, file, etc.
  filePath: text("file_path"),
  metadata: jsonb("metadata"), // size, dimensions, etc.
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const llmLogs = pgTable("llm_logs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  sessionId: varchar("session_id").references(() => sessions.id),
  model: text("model").notNull(),
  prompt: text("prompt").notNull(),
  response: text("response"),
  tokensUsed: integer("tokens_used"),
  cost: integer("cost"), // in cents
  latency: integer("latency"), // in ms
  timestamp: timestamp("timestamp").defaultNow().notNull(),
  status: text("status").notNull(), // success, error, rate_limited
});

export const coordinateState = pgTable("coordinate_state", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  sessionId: varchar("session_id").references(() => sessions.id),
  stageA: jsonb("stage_a"), // {x, y}
  stageB: jsonb("stage_b"), // {x, y}
  mode: text("mode").notNull().default("staging"), // staging, oneshot
  ready: boolean("ready").notNull().default(false),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const sessionCounter = pgTable("session_counter", {
  id: varchar("id").primaryKey().default("counter"),
  currentValue: integer("current_value").notNull().default(0),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const chatMessages = pgTable("chat_messages", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  sessionId: varchar("session_id").references(() => sessions.id),
  type: text("type").notNull(), // user, ai, system
  content: text("content").notNull(),
  model: text("model"), // For AI messages
  metadata: jsonb("metadata"), // Additional data like artifacts, response time
  timestamp: timestamp("timestamp").defaultNow().notNull(),
});

// AI Goal & Plan Tracking - РЕШАЕТ ПРОБЛЕМУ ПОТЕРИ ЛОГИКИ
export const userGoals = pgTable("user_goals", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  sessionId: varchar("session_id").references(() => sessions.id),
  originalGoal: text("original_goal").notNull(), // "Создать аккаунт на Outlook"
  currentPlan: jsonb("current_plan"), // ["navigate to outlook.com", "click create account", "fill form"]
  currentStep: integer("current_step").notNull().default(0), // Текущий шаг (0-based index)
  stepResults: jsonb("step_results"), // Результаты каждого шага для контекста
  status: text("status").notNull().default("active"), // active, completed, failed, paused
  lastUpdated: timestamp("last_updated").defaultNow().notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Insert schemas
export const insertSessionSchema = createInsertSchema(sessions).omit({
  createdAt: true,
  lastActivity: true,
});

export const insertUserGoalSchema = createInsertSchema(userGoals).omit({
  id: true,
  createdAt: true,
  lastUpdated: true,
});

export const insertEventSchema = createInsertSchema(events).omit({
  id: true,
  timestamp: true,
});

export const insertArtifactSchema = createInsertSchema(artifacts).omit({
  id: true,
  createdAt: true,
});

export const insertLlmLogSchema = createInsertSchema(llmLogs).omit({
  id: true,
  timestamp: true,
});

export const insertCoordinateStateSchema = createInsertSchema(coordinateState).omit({
  id: true,
  updatedAt: true,
});

export const insertChatMessageSchema = createInsertSchema(chatMessages).omit({
  id: true,
  timestamp: true,
});

export const insertSessionCounterSchema = createInsertSchema(sessionCounter).omit({
  updatedAt: true,
});

// Types
export type Session = typeof sessions.$inferSelect;
export type Event = typeof events.$inferSelect;
export type Artifact = typeof artifacts.$inferSelect;
export type LlmLog = typeof llmLogs.$inferSelect;
export type SessionCounter = typeof sessionCounter.$inferSelect;
export type CoordinateState = typeof coordinateState.$inferSelect;
export type ChatMessage = typeof chatMessages.$inferSelect;
export type UserGoal = typeof userGoals.$inferSelect;

export type InsertSession = z.infer<typeof insertSessionSchema>;
export type InsertEvent = z.infer<typeof insertEventSchema>;
export type InsertArtifact = z.infer<typeof insertArtifactSchema>;
export type InsertLlmLog = z.infer<typeof insertLlmLogSchema>;
export type InsertCoordinateState = z.infer<typeof insertCoordinateStateSchema>;
export type InsertChatMessage = z.infer<typeof insertChatMessageSchema>;
export type InsertUserGoal = z.infer<typeof insertUserGoalSchema>;

// Automation Model Configuration
export const automationModelConfig = pgTable("automation_model_config", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").references(() => users.id), // Per-user configuration
  planningModel: text("planning_model").notNull().default("openai/gpt-4o-mini"), // Model for creating automation plans
  executionModel: text("execution_model").notNull().default("openai/gpt-4o-mini"), // Model for analyzing execution steps
  completionModel: text("completion_model").notNull().default("openai/gpt-4o-mini"), // Model for checking goal completion
  fallbackModel: text("fallback_model").notNull().default("openai/gpt-4o-mini"), // Fallback model if others fail
  isGlobal: boolean("is_global").notNull().default(false), // Global config for all users vs per-user
  isActive: boolean("is_active").notNull().default(true), // Enable/disable configuration
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Insert schemas for automation model config
export const insertAutomationModelConfigSchema = createInsertSchema(automationModelConfig).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

// User schemas updated with subscription fields
export const insertUserSchema = createInsertSchema(users).pick({
  id: true,
  username: true,
  password: true,
  plan: true,
}).partial({ id: true }); // Make id optional for demo user creation

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;
export type AutomationModelConfig = typeof automationModelConfig.$inferSelect;
export type InsertAutomationModelConfig = z.infer<typeof insertAutomationModelConfigSchema>;

// MCP (Model Control Protocol) types for browser automation
export interface MCPAction {
  type: 'navigate' | 'wait_for' | 'type' | 'click' | 'press' | 'select' | 'eval_js' | 'screenshot' | 'coords_click' | 'scroll' | 'get_url' | 'get_title';
  params?: Record<string, any>;
  reasoning?: string;
  expectedOutcome?: string;
}

export interface MCPResult {
  success: boolean;
  data?: any;
  error?: string;
  timestamp?: string;
  metadata?: any;
}
