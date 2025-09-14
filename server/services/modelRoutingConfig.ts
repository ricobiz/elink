/**
 * Centralized Model Routing Configuration for 3-Tier Architecture
 * 
 * Chat Model: Uses OpenRouter Auto for optimal quality
 * Orchestrator Model: Balanced price/quality for planning
 * Executor Model: Focuses on free/cheap models for technical tasks
 */

export interface ModelRouting {
  primary: string;
  fallbacks: string[];
  description: string;
  maxRetries?: number;
  timeoutMs?: number;
}

export interface TierModelConfig {
  chat: ModelRouting;
  orchestrator: ModelRouting; 
  executor: ModelRouting;
}

export const MODEL_ROUTING_CONFIG: TierModelConfig = {
  /**
   * 🧠 Chat Model Configuration
   * - Uses openrouter/auto for intelligent model selection
   * - High-quality fallbacks for user conversations
   */
  chat: {
    primary: "openrouter/auto",
    fallbacks: [
      "openai/gpt-4o-mini",
      "anthropic/claude-3.5-haiku", 
      "google/gemini-flash-1.5"
    ],
    description: "Auto-routed chat model for optimal user experience",
    maxRetries: 3,
    timeoutMs: 30000
  },

  /**
   * 🔄 Orchestrator Model Configuration  
   * - Balanced price/quality for planning and coordination
   * - Mid-tier models for complex reasoning
   */
  orchestrator: {
    primary: "openai/gpt-4o-mini",
    fallbacks: [
      "anthropic/claude-3.5-haiku",
      "google/gemini-flash-1.5", 
      "meta-llama/llama-3.1-8b-instruct:free"
    ],
    description: "Planning and coordination model with balanced cost/quality",
    maxRetries: 2,
    timeoutMs: 20000
  },

  /**
   * ⚙️ Executor Model Configuration
   * - Prioritizes free/cheap models for technical tasks
   * - Focused on action execution rather than complex reasoning
   */
  executor: {
    primary: "openai/gpt-oss-20b:free",
    fallbacks: [
      "meta-llama/llama-3.1-8b-instruct:free",
      "microsoft/phi-3-mini-128k-instruct:free",
      "openai/gpt-4o-mini"
    ],
    description: "Cost-optimized model for technical execution",
    maxRetries: 2,
    timeoutMs: 15000
  }
};

/**
 * Model pricing tiers for cost optimization
 */
export const MODEL_PRICING = {
  FREE: ["free", ":free"],
  CHEAP: ["gpt-4o-mini", "claude-3.5-haiku", "gemini-flash"],
  MEDIUM: ["gpt-4o", "claude-3.5-sonnet"],
  EXPENSIVE: ["o1-preview", "claude-3-opus"]
};

/**
 * Get all models for a specific tier
 */
export function getTierModels(tier: keyof TierModelConfig): string[] {
  const config = MODEL_ROUTING_CONFIG[tier];
  return [config.primary, ...config.fallbacks];
}

/**
 * Get model routing configuration for a tier
 */
export function getModelRouting(tier: keyof TierModelConfig): ModelRouting {
  return MODEL_ROUTING_CONFIG[tier];
}

/**
 * Check if a model is likely free based on naming patterns
 */
export function isModelFree(modelName: string): boolean {
  return MODEL_PRICING.FREE.some(pattern => 
    modelName.toLowerCase().includes(pattern.toLowerCase())
  );
}

/**
 * Get cost tier of a model
 */
export function getModelCostTier(modelName: string): string {
  const name = modelName.toLowerCase();
  
  if (MODEL_PRICING.FREE.some(pattern => name.includes(pattern.toLowerCase()))) {
    return 'FREE';
  }
  if (MODEL_PRICING.CHEAP.some(pattern => name.includes(pattern.toLowerCase()))) {
    return 'CHEAP';
  }
  if (MODEL_PRICING.MEDIUM.some(pattern => name.includes(pattern.toLowerCase()))) {
    return 'MEDIUM';
  }
  if (MODEL_PRICING.EXPENSIVE.some(pattern => name.includes(pattern.toLowerCase()))) {
    return 'EXPENSIVE';
  }
  
  return 'UNKNOWN';
}

/**
 * Update model routing configuration dynamically
 */
export class ModelRoutingManager {
  private static instance: ModelRoutingManager;
  private config: TierModelConfig;

  private constructor() {
    this.config = { ...MODEL_ROUTING_CONFIG };
  }

  static getInstance(): ModelRoutingManager {
    if (!ModelRoutingManager.instance) {
      ModelRoutingManager.instance = new ModelRoutingManager();
    }
    return ModelRoutingManager.instance;
  }

  /**
   * Update routing for a specific tier
   */
  updateTierRouting(tier: keyof TierModelConfig, routing: Partial<ModelRouting>): void {
    this.config[tier] = { ...this.config[tier], ...routing };
    console.log(`🔄 MODEL ROUTING: Updated ${tier} tier configuration:`, this.config[tier]);
  }

  /**
   * Get current configuration
   */
  getConfig(): TierModelConfig {
    return { ...this.config };
  }

  /**
   * Reset to default configuration
   */
  resetToDefaults(): void {
    this.config = { ...MODEL_ROUTING_CONFIG };
    console.log('🔄 MODEL ROUTING: Reset to default configuration');
  }

  /**
   * Add fallback model to a tier
   */
  addFallback(tier: keyof TierModelConfig, model: string): void {
    if (!this.config[tier].fallbacks.includes(model)) {
      this.config[tier].fallbacks.push(model);
      console.log(`🔄 MODEL ROUTING: Added fallback ${model} to ${tier} tier`);
    }
  }

  /**
   * Remove fallback model from a tier
   */
  removeFallback(tier: keyof TierModelConfig, model: string): void {
    const index = this.config[tier].fallbacks.indexOf(model);
    if (index > -1) {
      this.config[tier].fallbacks.splice(index, 1);
      console.log(`🔄 MODEL ROUTING: Removed fallback ${model} from ${tier} tier`);
    }
  }

  /**
   * Validate model routing configuration
   */
  validateConfig(): { isValid: boolean; errors: string[] } {
    const errors: string[] = [];
    
    for (const [tier, config] of Object.entries(this.config)) {
      if (!config.primary) {
        errors.push(`${tier} tier missing primary model`);
      }
      
      if (!config.fallbacks || config.fallbacks.length === 0) {
        errors.push(`${tier} tier missing fallback models`);
      }
      
      if (config.maxRetries && config.maxRetries < 1) {
        errors.push(`${tier} tier invalid maxRetries value`);
      }
      
      if (config.timeoutMs && config.timeoutMs < 1000) {
        errors.push(`${tier} tier timeout too low (minimum 1000ms)`);
      }
    }
    
    return {
      isValid: errors.length === 0,
      errors
    };
  }
}

// Export singleton instance
export const modelRoutingManager = ModelRoutingManager.getInstance();

/**
 * Cost optimization utilities
 */
export const CostOptimizer = {
  /**
   * Sort models by cost (cheapest first)
   */
  sortByCost(models: string[]): string[] {
    return models.sort((a, b) => {
      const costA = getModelCostTier(a);
      const costB = getModelCostTier(b);
      
      const costOrder = ['FREE', 'CHEAP', 'MEDIUM', 'EXPENSIVE', 'UNKNOWN'];
      return costOrder.indexOf(costA) - costOrder.indexOf(costB);
    });
  },

  /**
   * Get recommended model sequence for cost optimization
   */
  getOptimizedSequence(tier: keyof TierModelConfig): string[] {
    const routing = getModelRouting(tier);
    const allModels = [routing.primary, ...routing.fallbacks];
    
    // For executor tier, prioritize free models
    if (tier === 'executor') {
      return this.sortByCost(allModels);
    }
    
    // For other tiers, keep original order (quality first)
    return allModels;
  }
};