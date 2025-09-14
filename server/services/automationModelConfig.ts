import { storage } from '../storage';
import type { AutomationModelConfig, InsertAutomationModelConfig } from '@shared/schema';

export interface ModelConfigOptions {
  userId?: string;
  fallbackToDefaults?: boolean;
}

export interface AutomationModels {
  planningModel: string;
  executionModel: string;
  completionModel: string;
  fallbackModel: string;
}

/**
 * Service for managing automation model configurations
 * Handles per-user and global model settings for different automation tasks
 */
export class AutomationModelConfigService {
  private defaultModels: AutomationModels = {
    planningModel: 'openai/gpt-4o-mini',
    executionModel: 'openai/gpt-4o-mini', 
    completionModel: 'openai/gpt-4o-mini',
    fallbackModel: 'openai/gpt-4o-mini'
  };

  /**
   * Get automation model configuration for a user or global config
   */
  async getModelConfig(options: ModelConfigOptions = {}): Promise<AutomationModelConfig> {
    const { userId, fallbackToDefaults = true } = options;

    try {
      // Try to get existing config from storage
      const config = await storage.getAutomationModelConfig(userId);
      if (config) {
        return config;
      }

      // If no config exists and fallback is enabled, create default config
      if (fallbackToDefaults) {
        return await storage.getOrCreateDefaultAutomationConfig(userId);
      }

      throw new Error('No model configuration found');
    } catch (error) {
      console.error('Error getting model config:', error);
      
      // Ultimate fallback - return in-memory defaults as a valid config object
      return {
        id: 'fallback',
        userId: userId || null,
        ...this.defaultModels,
        isGlobal: !userId,
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date()
      };
    }
  }

  /**
   * Get specific model for a task type
   */
  async getModelForTask(taskType: keyof AutomationModels, options: ModelConfigOptions = {}): Promise<string> {
    try {
      const config = await this.getModelConfig(options);
      return config[taskType] || this.defaultModels[taskType];
    } catch (error) {
      console.error(`Error getting model for task ${taskType}:`, error);
      return this.defaultModels[taskType];
    }
  }

  /**
   * Get planning model for creating automation plans
   */
  async getPlanningModel(options: ModelConfigOptions = {}): Promise<string> {
    return this.getModelForTask('planningModel', options);
  }

  /**
   * Get execution model for analyzing automation steps
   */
  async getExecutionModel(options: ModelConfigOptions = {}): Promise<string> {
    return this.getModelForTask('executionModel', options);
  }

  /**
   * Get completion model for checking goal achievement
   */
  async getCompletionModel(options: ModelConfigOptions = {}): Promise<string> {
    return this.getModelForTask('completionModel', options);
  }

  /**
   * Get fallback model for error recovery
   */
  async getFallbackModel(options: ModelConfigOptions = {}): Promise<string> {
    return this.getModelForTask('fallbackModel', options);
  }

  /**
   * Update model configuration
   */
  async updateModelConfig(
    configId: string, 
    updates: Partial<AutomationModels>
  ): Promise<void> {
    try {
      await storage.updateAutomationModelConfig(configId, {
        ...updates,
        updatedAt: new Date()
      });
    } catch (error) {
      console.error('Error updating model config:', error);
      throw new Error('Failed to update model configuration');
    }
  }

  /**
   * Create new model configuration
   */
  async createModelConfig(config: InsertAutomationModelConfig): Promise<AutomationModelConfig> {
    try {
      return await storage.createAutomationModelConfig(config);
    } catch (error) {
      console.error('Error creating model config:', error);
      throw new Error('Failed to create model configuration');
    }
  }

  /**
   * Get all models for automation tasks
   */
  async getAllModels(options: ModelConfigOptions = {}): Promise<AutomationModels> {
    try {
      const config = await this.getModelConfig(options);
      return {
        planningModel: config.planningModel,
        executionModel: config.executionModel,
        completionModel: config.completionModel,
        fallbackModel: config.fallbackModel
      };
    } catch (error) {
      console.error('Error getting all models:', error);
      return this.defaultModels;
    }
  }

  /**
   * Reset configuration to defaults
   */
  async resetToDefaults(userId?: string): Promise<AutomationModelConfig> {
    try {
      const defaultConfig: InsertAutomationModelConfig = {
        userId: userId || null,
        ...this.defaultModels,
        isGlobal: !userId,
        isActive: true
      };

      return await this.createModelConfig(defaultConfig);
    } catch (error) {
      console.error('Error resetting to defaults:', error);
      throw new Error('Failed to reset model configuration');
    }
  }

  /**
   * Validate model configuration
   */
  validateModelConfig(models: Partial<AutomationModels>): boolean {
    const requiredFields: (keyof AutomationModels)[] = [
      'planningModel', 'executionModel', 'completionModel', 'fallbackModel'
    ];

    for (const field of requiredFields) {
      const value = models[field];
      if (value && typeof value === 'string' && value.length > 0) {
        continue;
      }
      return false;
    }

    return true;
  }

  /**
   * Get model with retry fallback
   * If the primary model fails, try fallback model
   */
  async getModelWithFallback(
    primaryTaskType: keyof AutomationModels,
    options: ModelConfigOptions = {}
  ): Promise<{ model: string; isFallback: boolean }> {
    try {
      const primaryModel = await this.getModelForTask(primaryTaskType, options);
      return { model: primaryModel, isFallback: false };
    } catch (error) {
      console.warn(`Primary model ${primaryTaskType} failed, using fallback:`, error);
      const fallbackModel = await this.getFallbackModel(options);
      return { model: fallbackModel, isFallback: true };
    }
  }
}

// Export singleton instance
export const automationModelConfigService = new AutomationModelConfigService();