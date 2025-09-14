import { OpenRouterService } from './openRouterService';
import { HumanBehaviorAutomation } from './humanBehaviorAutomation';
import { automationModelConfigService } from './automationModelConfig';
import type { MCPAction } from './mcpClient';

export interface TaskPlanRequest {
  goal: string;
  currentState: string;
  previousActions?: ExecutionStep[];
  context?: {
    sessionId: string;
    screenshotPath?: string;
    pageUrl?: string;
    pageTitle?: string;
  };
}

export interface ExecutionStep {
  action: MCPAction;
  reasoning: string;
  expectedOutcome: string;
  completed?: boolean;
  result?: {
    success: boolean;
    data?: any;
    error?: string;
    screenshot?: string;
    duration?: number;
  };
}

export interface TaskPlan {
  goal: string;
  strategy: string;
  steps: ExecutionStep[];
  nextStep: number;
  isComplete: boolean;
  confidence: number; // 0-1 score
}

export interface PlanningResult {
  plan: TaskPlan;
  explanation: string;
  needsMoreInfo: boolean;
  suggestedActions?: string[];
}

export type TaskType = 'planning' | 'execution' | 'completion' | 'fallback';

export class TaskPlanner {
  private openRouterService: OpenRouterService;
  private humanBot: HumanBehaviorAutomation;
  private retryAttempts = 3;

  constructor(openRouterService: OpenRouterService) {
    this.openRouterService = openRouterService;
    this.humanBot = new HumanBehaviorAutomation();
  }

  async initBrowser() {
    await this.humanBot.initBrowser();
  }

  /**
   * Creates an initial task plan from a user goal with human-like actions
   */
  async createInitialPlan(request: TaskPlanRequest): Promise<PlanningResult> {
    const systemPrompt = this.getSystemPrompt();

    const userMessage = `Create a task plan for: "${request.goal}"

Current state: ${request.currentState}

${request.context ? `
Context:
- Session ID: ${request.context.sessionId}
- Current URL: ${request.context.pageUrl || 'unknown'}
- Page Title: ${request.context.pageTitle || 'unknown'}
- Screenshot: ${request.context.screenshotPath || 'none available'}
` : ''}

${request.previousActions && request.previousActions.length > 0 ? `Previous actions taken: 
${request.previousActions.map((step, i) => 
  `${i + 1}. ${step.action.type} ${JSON.stringify(step.action.params || {})} - ${step.completed ? 'COMPLETED' : 'PENDING'}`
).join('\n')}` : ''}

Plan the next sequence of HUMAN-LIKE browser automation actions to achieve the goal.
Use realistic delays, natural mouse movements, and human behavior patterns.`;

    try {
      const response = await this.callLLMWithRetry(
        userMessage,
        systemPrompt,
        request.context?.sessionId || 'planning',
        'planning'
      );

      const planningResult = this.validatePlan(response);
      
      return {
        ...planningResult,
        plan: {
          ...planningResult.plan,
          goal: request.goal
        }
      };
    } catch (error) {
      console.error('Error creating initial plan:', error);
      
      return this.getFallbackPlan(request.goal);
    }
  }

  /**
   * Execute a single step with human-like behavior
   */
  async executeStep(step: ExecutionStep): Promise<ExecutionStep> {
    const startTime = Date.now();

    try {
      console.log(`[TaskPlanner] Executing: ${step.action.type}`, step.action.params);
      
      // Execute with human-like behavior
      const result = await this.humanBot.executeHumanCommand(step.action);
      const duration = Date.now() - startTime;
      
      // Take screenshot after action for verification
      const screenshot = await this.humanBot.page?.screenshot({ 
        encoding: 'base64',
        fullPage: false 
      });

      const executedStep: ExecutionStep = {
        ...step,
        completed: true,
        result: {
          success: true,
          data: result,
          duration,
          screenshot: screenshot ? `data:image/png;base64,${screenshot}` : undefined
        }
      };

      console.log(`[TaskPlanner] Completed in ${duration}ms`);
      return executedStep;

    } catch (error) {
      const duration = Date.now() - startTime;
      
      console.error(`[TaskPlanner] Failed after ${duration}ms:`, error);
      
      return {
        ...step,
        completed: true,
        result: {
          success: false,
          error: error.message,
          duration
        }
      };
    }
  }

  /**
   * Updates an existing plan based on execution results
   */
  async updatePlan(
    currentPlan: TaskPlan,
    completedStep: ExecutionStep,
    currentState: string
  ): Promise<PlanningResult> {
    const systemPrompt = this.getUpdateSystemPrompt();

    const userMessage = `Update the task plan based on execution results.

ORIGINAL GOAL: ${currentPlan.goal}
CURRENT STRATEGY: ${currentPlan.strategy}

COMPLETED STEP:
Action: ${completedStep.action.type} ${JSON.stringify(completedStep.action.params || {})}
Reasoning: ${completedStep.reasoning}
Expected: ${completedStep.expectedOutcome}
Result: ${completedStep.result ? JSON.stringify(completedStep.result) : 'No result yet'}
Success: ${completedStep.result?.success ? 'YES' : 'NO'}
${completedStep.result?.error ? `Error: ${completedStep.result.error}` : ''}

CURRENT STATE: ${currentState}

REMAINING STEPS:
${currentPlan.steps.slice(currentPlan.nextStep).map((step, i) => 
  `${i + 1}. ${step.action.type} ${JSON.stringify(step.action.params || {})} - ${step.reasoning}`
).join('\n')}

Update the plan based on what happened. If the step failed, provide alternative approaches.
Always include realistic human-like delays and behaviors.`;

    try {
      const response = await this.callLLMWithRetry(
        userMessage,
        systemPrompt,
        'planning',
        'execution'
      );

      const planningResult = this.validatePlan(response);
      
      return {
        ...planningResult,
        plan: {
          ...planningResult.plan,
          goal: currentPlan.goal // Preserve original goal
        }
      };
    } catch (error) {
      console.error('Error updating plan:', error);
      
      // Continue with existing plan
      return {
        plan: {
          ...currentPlan,
          nextStep: Math.min(currentPlan.nextStep + 1, currentPlan.steps.length),
          confidence: Math.max(currentPlan.confidence - 0.1, 0.1)
        },
        explanation: 'Continued with existing plan due to planning error',
        needsMoreInfo: false
      };
    }
  }

  /**
   * Analyzes if the goal has been achieved with screenshot analysis
   */
  async checkGoalCompletion(
    goal: string,
    currentState: string,
    executedSteps: ExecutionStep[]
  ): Promise<{ isComplete: boolean; confidence: number; explanation: string }> {
    // Take current screenshot for analysis
    let currentScreenshot = '';
    try {
      const screenshot = await this.humanBot.page?.screenshot({
        encoding: 'base64',
        fullPage: false
      });
      currentScreenshot = screenshot || '';
    } catch (error) {
      console.warn('Could not take screenshot for goal completion check');
    }

    const systemPrompt = `Analyze whether a browser automation goal has been achieved.

RESPONSE FORMAT (JSON only):
{
  "isComplete": true/false,
  "confidence": 0.9,
  "explanation": "Explanation of why goal is/isn't complete"
}

Consider:
1. The original goal
2. Current page state and screenshot  
3. Success/failure of executed steps
4. Visual indicators of completion

Be conservative - only mark complete if clearly achieved.`;

    const userMessage = `Analyze goal completion:

GOAL: ${goal}
CURRENT STATE: ${currentState}
${currentScreenshot ? 'CURRENT SCREENSHOT: Available for analysis' : 'SCREENSHOT: Not available'}

STEPS EXECUTED:
${executedSteps.map((step, i) => 
  `${i + 1}. ${step.action.type} - ${step.result?.success ? 'SUCCESS' : 'FAILED'} - ${step.reasoning}
  ${step.result?.error ? `  Error: ${step.result.error}`: ''}
  ${step.result?.duration ? `  Duration: ${step.result.duration}ms` : ''}`
).join('\n')}

Is the goal achieved? Look at the current state and step results.`;

    try {
      const response = await this.callLLMWithRetry(
        userMessage,
        systemPrompt,
        'analysis',
        'completion'
      );

      return this.parseCompletionResponse(response);
    } catch (error) {
      console.error('Error checking goal completion:', error);
      
      return {
        isComplete: false,
        confidence: 0.3,
        explanation: 'Could not analyze completion due to error'
      };
    }
  }

  private getSystemPrompt(): string {
    return `You are a browser automation task planner specializing in HUMAN-LIKE automation.

AVAILABLE ACTIONS:
- navigate: {url: string} - Navigate to URL with human-like loading wait
- screenshot: {} - Take screenshot of current page
- click: {selector?: string, x?: number, y?: number} - Human-like click with hover and delays
- type: {selector: string, text: string, clearFirst?: boolean} - Human typing with mistakes and corrections
- wait_for: {selector: string, timeout?: number} - Wait for element to appear
- scroll: {direction: "up"|"down"|"to_element", selector?: string, distance?: number} - Natural scroll
- eval_js: {code: string} - Execute JavaScript
- coords_click: {x: number, y: number} - Click at coordinates with human movement
- get_url: {} - Get current page URL
- get_title: {} - Get current page title
- human_pause: {type: "micro"|"normal"|"reading"|"thinking"} - Realistic human pauses
- simulate_reading: {duration?: number} - Simulate reading behavior with micro-movements

HUMAN-LIKE BEHAVIOR RULES:
1. Always start with screenshot to understand current state
2. Add human_pause between major actions
3. Use simulate_reading after page loads
4. Include wait_for before interacting with elements
5. Use realistic coordinates for clicks (not exact center)
6. Add verification pauses after important actions

RESPONSE FORMAT (JSON only - NO markdown, NO explanations outside JSON):
{
  "plan": {
    "goal": "User's goal",
    "strategy": "Human-like approach description",
    "steps": [
      {
        "action": {"type": "screenshot"},
        "reasoning": "Need to see current page state",
        "expectedOutcome": "Get visual information about current page"
      },
      {
        "action": {"type": "human_pause", "params": {"type": "normal"}},
        "reasoning": "Natural pause before interaction",
        "expectedOutcome": "Realistic delay"
      }
    ],
    "nextStep": 0,
    "isComplete": false,
    "confidence": 0.8
  },
  "explanation": "Brief explanation of the human-like approach",
  "needsMoreInfo": false
}

CRITICAL: Respond ONLY with valid JSON. Include human-like pauses and natural behavior.`;
  }

  private getUpdateSystemPrompt(): string {
    return `Update a browser automation plan based on execution results.

RESPONSE FORMAT (JSON only):
{
  "plan": {
    "goal": "Keep original goal",
    "strategy": "Updated strategy if needed", 
    "steps": [
      // Updated steps array with human-like actions
    ],
    "nextStep": 1,
    "isComplete": false,
    "confidence": 0.8
  },
  "explanation": "What was learned and what changes were made",
  "needsMoreInfo": false
}

RULES:
1. Analyze the result of the completed step
2. If step failed, add alternative approaches with human-like behavior
3. Update confidence based on success/failure
4. Add human pauses and verification steps
5. Mark plan complete if goal is clearly achieved
6. ALWAYS respond with valid JSON only

Include realistic delays and human behavior patterns in updated steps.`;
  }

  private async callLLMWithRetry(
    message: string,
    systemPrompt: string,
    sessionId: string,
    taskType: TaskType = 'planning',
    maxRetries = 3
  ): Promise<any> {
    let lastError;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        // Get appropriate model for task type
        const primaryModel = await this.getModelForTaskType(taskType);
        
        const response = await this.openRouterService.processNaturalLanguage(
          message,
          primaryModel,
          sessionId,
          undefined,
          false
        );
        
        return this.extractJSON(response.linkLanguageCommand);
      } catch (error) {
        lastError = error;
        
        // На последней попытке пробуем fallback модель
        if (attempt === maxRetries - 1) {
          try {
            const fallbackModel = await automationModelConfigService.getFallbackModel();
            
            const fallbackResponse = await this.openRouterService.processNaturalLanguage(
              message + "\n\nIMPORTANT: Respond with ONLY valid JSON, no markdown.",
              fallbackModel,
              sessionId,
              undefined,
              false
            );
            
            return this.extractJSON(fallbackResponse.linkLanguageCommand);
          } catch (fallbackError) {
            break;
          }
        }
        
        // Небольшая задержка между попытками
        await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
      }
    }

    throw lastError;
  }

  /**
   * Get appropriate model for task type from configuration
   */
  private async getModelForTaskType(taskType: TaskType): Promise<string> {
    try {
      switch (taskType) {
        case 'planning':
          return await automationModelConfigService.getPlanningModel();
        case 'execution':
          return await automationModelConfigService.getExecutionModel();
        case 'completion':
          return await automationModelConfigService.getCompletionModel();
        case 'fallback':
          return await automationModelConfigService.getFallbackModel();
        default:
          return await automationModelConfigService.getPlanningModel();
      }
    } catch (error) {
      console.error(`Error getting model for task type ${taskType}:`, error);
      // Ultimate fallback to hardcoded default
      return 'openai/gpt-4o-mini';
    }
  }

  private extractJSON(response: string): any {
    // Убираем markdown блоки
    let cleaned = response.replace(/```json\n?/g, '').replace(/```\n?/g, '');

    // Находим самый большой JSON объект
    const possibleJSONs = [];
    let braceCount = 0;
    let start = -1;

    for (let i = 0; i < cleaned.length; i++) {
      if (cleaned[i] === '{') {
        if (braceCount === 0) start = i;
        braceCount++;
      } else if (cleaned[i] === '}') {
        braceCount--;
        if (braceCount === 0 && start !== -1) {
          possibleJSONs.push(cleaned.substring(start, i + 1));
        }
      }
    }

    // Пробуем парсить самый длинный JSON
    possibleJSONs.sort((a, b) => b.length - a.length);
    for (const jsonStr of possibleJSONs) {
      try {
        return JSON.parse(jsonStr);
      } catch (e) {
        continue;
      }
    }

    throw new Error('No valid JSON found in response: ' + response.substring(0, 200));
  }

  private validatePlan(parsed: any): PlanningResult {
    // Проверяем структуру
    if (!parsed.plan || typeof parsed.plan !== 'object') {
      throw new Error('Missing plan object');
    }

    if (!Array.isArray(parsed.plan.steps)) {
      throw new Error('Steps must be an array');
    }

    // Валидируем каждый шаг
    const validTypes = [
      'navigate', 'screenshot', 'click', 'type', 'wait_for', 'scroll', 
      'eval_js', 'coords_click', 'get_url', 'get_title', 'human_pause', 
      'simulate_reading'
    ];

    for (const step of parsed.plan.steps) {
      if (!step.action || !step.action.type) {
        throw new Error('Each step must have action.type');
      }
      
      if (!validTypes.includes(step.action.type)) {
        throw new Error(`Invalid action type: ${step.action.type}`);
      }
    }

    // Устанавливаем дефолтные значения
    parsed.plan.nextStep = parsed.plan.nextStep || 0;
    parsed.plan.isComplete = parsed.plan.isComplete || false;
    parsed.plan.confidence = Math.min(Math.max(parsed.plan.confidence || 0.5, 0), 1);

    return parsed as PlanningResult;
  }

  private parseCompletionResponse(response: any): { isComplete: boolean; confidence: number; explanation: string } {
    try {
      return {
        isComplete: response.isComplete || false,
        confidence: response.confidence || 0.3,
        explanation: response.explanation || 'No explanation provided'
      };
    } catch (error) {
      console.error('Error parsing completion response:', error);

      return {
        isComplete: false,
        confidence: 0.3,
        explanation: 'Could not parse completion analysis'
      };
    }
  }

  private getFallbackPlan(goal: string): PlanningResult {
    return {
      plan: {
        goal: goal,
        strategy: 'Take screenshot and assess current state with human-like behavior',
        steps: [
          {
            action: { type: 'screenshot' },
            reasoning: 'Need to see current page state to plan next actions',
            expectedOutcome: 'Get visual information about current page'
          },
          {
            action: { type: 'human_pause', params: { type: 'normal' } },
            reasoning: 'Natural pause to process visual information',
            expectedOutcome: 'Realistic delay before next action'
          }
        ],
        nextStep: 0,
        isComplete: false,
        confidence: 0.5
      },
      explanation: 'Created fallback plan with human-like behavior due to planning error',
      needsMoreInfo: true,
      suggestedActions: ['Take screenshot', 'Analyze page state', 'Plan next steps']
    };
  }

  async cleanup() {
    if (this.humanBot?.browser) {
      await this.humanBot.browser.close();
    }
  }
}