import { TaskPlanner, type TaskPlan, type ExecutionStep, type TaskPlanRequest } from './taskPlanner';
import { MCPClient, type MCPAction, type MCPResult } from './mcpClient';
import { OpenRouterService } from './openRouterService';
import { SSEManager } from './sseManager';
import type { IStorage } from '../storage';

export type ExecutionLoopStatus = 'idle' | 'planning' | 'executing' | 'observing' | 'checking' | 'completed' | 'failed' | 'stopped';

export interface ExecutionLoopState {
  sessionId: string;
  goal: string;
  status: ExecutionLoopStatus;
  currentPlan?: TaskPlan;
  currentStep?: number;
  lastScreenshotPath?: string;
  lastError?: string;
  startTime: Date;
  lastActivity: Date;
  cycleCount: number;
  maxCycles: number;
}

export interface LoopProgress {
  sessionId: string;
  status: ExecutionLoopStatus;
  goal: string;
  progress: {
    currentStep: number;
    totalSteps: number;
    stepDescription: string;
    completedSteps: number;
  };
  currentAction?: {
    type: string;
    description: string;
    estimatedDuration?: number;
  };
  lastUpdate: Date;
  error?: string;
}

export interface ExecutionLoopOptions {
  maxCycles?: number;
  stepTimeout?: number;
  retryAttempts?: number;
  requireConfirmation?: boolean;
}

export class ExecutionLoop {
  private taskPlanner: TaskPlanner;
  private mcpClient: MCPClient;
  private sseManager: SSEManager;
  private storage: IStorage;
  private activeLoops: Map<string, ExecutionLoopState> = new Map();
  private readonly defaultOptions: Required<ExecutionLoopOptions> = {
    maxCycles: 20,
    stepTimeout: 30000, // 30 seconds
    retryAttempts: 3,
    requireConfirmation: false
  };

  constructor(
    openRouterService: OpenRouterService,
    mcpClient: MCPClient,
    sseManager: SSEManager,
    storage: IStorage
  ) {
    this.taskPlanner = new TaskPlanner(openRouterService);
    this.mcpClient = mcpClient;
    this.sseManager = sseManager;
    this.storage = storage;
  }

  /**
   * Start execution loop for a given goal
   */
  async startLoop(
    sessionId: string,
    goal: string,
    options: ExecutionLoopOptions = {}
  ): Promise<{ success: boolean; message: string; loopId: string }> {
    const loopOptions = { ...this.defaultOptions, ...options };

    try {
      // Check if loop already running for this session
      if (this.activeLoops.has(sessionId)) {
        return {
          success: false,
          message: 'Execution loop already running for this session',
          loopId: sessionId
        };
      }

      // Initialize loop state
      const loopState: ExecutionLoopState = {
        sessionId,
        goal,
        status: 'planning',
        startTime: new Date(),
        lastActivity: new Date(),
        cycleCount: 0,
        maxCycles: loopOptions.maxCycles
      };

      this.activeLoops.set(sessionId, loopState);

      // Broadcast loop start
      await this.broadcastProgress(sessionId, {
        sessionId,
        status: 'planning',
        goal,
        progress: {
          currentStep: 0,
          totalSteps: 0,
          stepDescription: 'Initializing execution loop...',
          completedSteps: 0
        },
        lastUpdate: new Date()
      });

      // Store initial goal in database
      await this.storage.createUserGoal({
        sessionId,
        originalGoal: goal,
        currentPlan: [],
        currentStep: 0,
        stepResults: [],
        status: 'active'
      });

      // Start the execution cycle (don't await - let it run async)
      this.runExecutionCycle(sessionId, loopOptions).catch(error => {
        console.error(`Execution loop failed for session ${sessionId}:`, error);
        this.handleLoopError(sessionId, error);
      });

      return {
        success: true,
        message: 'Execution loop started successfully',
        loopId: sessionId
      };
    } catch (error) {
      console.error('Error starting execution loop:', error);
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Unknown error',
        loopId: sessionId
      };
    }
  }

  /**
   * Stop execution loop
   */
  async stopLoop(sessionId: string): Promise<{ success: boolean; message: string }> {
    const loopState = this.activeLoops.get(sessionId);
    
    if (!loopState) {
      return {
        success: false,
        message: 'No active execution loop found for this session'
      };
    }

    loopState.status = 'stopped';
    loopState.lastActivity = new Date();

    await this.broadcastProgress(sessionId, {
      sessionId,
      status: 'stopped',
      goal: loopState.goal,
      progress: {
        currentStep: loopState.currentStep || 0,
        totalSteps: loopState.currentPlan?.steps.length || 0,
        stepDescription: 'Execution stopped by user',
        completedSteps: loopState.currentStep || 0
      },
      lastUpdate: new Date()
    });

    // Keep in map but mark as stopped (for status queries)
    setTimeout(() => this.activeLoops.delete(sessionId), 60000); // Remove after 1 minute

    return {
      success: true,
      message: 'Execution loop stopped successfully'
    };
  }

  /**
   * Get status of execution loop
   */
  getLoopStatus(sessionId: string): LoopProgress | null {
    const loopState = this.activeLoops.get(sessionId);
    
    if (!loopState) {
      return null;
    }

    const currentStep = loopState.currentStep || 0;
    const totalSteps = loopState.currentPlan?.steps.length || 0;
    const currentAction = loopState.currentPlan?.steps[currentStep];

    return {
      sessionId,
      status: loopState.status,
      goal: loopState.goal,
      progress: {
        currentStep: currentStep + 1,
        totalSteps,
        stepDescription: currentAction?.reasoning || 'Preparing next action...',
        completedSteps: currentStep
      },
      currentAction: currentAction ? {
        type: currentAction.action.type,
        description: currentAction.reasoning,
        estimatedDuration: this.estimateActionDuration(currentAction.action)
      } : undefined,
      lastUpdate: loopState.lastActivity,
      error: loopState.lastError
    };
  }

  /**
   * Main execution cycle - PLAN → EXECUTE → OBSERVE → CHECK → PLAN
   */
  private async runExecutionCycle(sessionId: string, options: Required<ExecutionLoopOptions>): Promise<void> {
    const loopState = this.activeLoops.get(sessionId);
    if (!loopState) return;

    try {
      while (loopState.status !== 'stopped' && loopState.status !== 'completed' && loopState.status !== 'failed') {
        // Safety check - prevent infinite loops
        if (loopState.cycleCount >= loopState.maxCycles) {
          loopState.status = 'failed';
          loopState.lastError = `Maximum cycles (${loopState.maxCycles}) reached`;
          break;
        }

        loopState.cycleCount++;
        loopState.lastActivity = new Date();

        console.log(`🔄 Execution Cycle ${loopState.cycleCount} for session ${sessionId}`);

        // PHASE 1: PLAN (or re-plan)
        await this.planPhase(sessionId);
        if (loopState.status === 'stopped') break;

        // PHASE 2: EXECUTE 
        await this.executePhase(sessionId, options);
        if (loopState.status === 'stopped') break;

        // PHASE 3: OBSERVE
        await this.observePhase(sessionId);
        if (loopState.status === 'stopped') break;

        // PHASE 4: CHECK completion
        const isComplete = await this.checkPhase(sessionId);
        if (isComplete || loopState.status === 'completed') break;

        // Brief pause between cycles
        await new Promise(resolve => setTimeout(resolve, 1000));
      }

      // Final status update
      await this.finalizeLoop(sessionId);
    } catch (error) {
      console.error(`Execution cycle error for session ${sessionId}:`, error);
      await this.handleLoopError(sessionId, error);
    }
  }

  private async planPhase(sessionId: string): Promise<void> {
    const loopState = this.activeLoops.get(sessionId);
    if (!loopState) return;

    try {
      loopState.status = 'planning';
      
      await this.broadcastProgress(sessionId, {
        sessionId,
        status: 'planning',
        goal: loopState.goal,
        progress: {
          currentStep: loopState.currentStep || 0,
          totalSteps: loopState.currentPlan?.steps.length || 0,
          stepDescription: 'Planning next actions...',
          completedSteps: loopState.currentStep || 0
        },
        lastUpdate: new Date()
      });

      let currentState = 'Starting execution loop';
      
      // Get current page state if available
      if (loopState.lastScreenshotPath) {
        currentState = `Current page screenshot: ${loopState.lastScreenshotPath}`;
      }

      const planRequest: TaskPlanRequest = {
        goal: loopState.goal,
        currentState,
        previousActions: loopState.currentPlan?.steps.filter(step => step.completed) || [],
        context: {
          sessionId,
          screenshotPath: loopState.lastScreenshotPath
        }
      };

      if (!loopState.currentPlan) {
        // Create initial plan
        const planningResult = await this.taskPlanner.createInitialPlan(planRequest);
        loopState.currentPlan = planningResult.plan;
        loopState.currentStep = 0;
      } else {
        // Update existing plan if needed
        const lastStep = loopState.currentPlan.steps[loopState.currentStep || 0];
        if (lastStep && lastStep.completed) {
          const planningResult = await this.taskPlanner.updatePlan(
            loopState.currentPlan,
            lastStep,
            currentState
          );
          loopState.currentPlan = planningResult.plan;
        }
      }

      console.log(`📋 Plan created/updated for session ${sessionId}:`, {
        totalSteps: loopState.currentPlan.steps.length,
        nextStep: loopState.currentPlan.nextStep,
        strategy: loopState.currentPlan.strategy
      });

    } catch (error) {
      loopState.lastError = `Planning failed: ${error instanceof Error ? error.message : 'Unknown error'}`;
      console.error('Plan phase error:', error);
    }
  }

  private async executePhase(sessionId: string, options: Required<ExecutionLoopOptions>): Promise<void> {
    const loopState = this.activeLoops.get(sessionId);
    if (!loopState || !loopState.currentPlan) return;

    try {
      loopState.status = 'executing';
      
      const currentStepIndex = loopState.currentPlan.nextStep;
      const currentStep = loopState.currentPlan.steps[currentStepIndex];
      
      if (!currentStep) {
        loopState.status = 'completed';
        return;
      }

      loopState.currentStep = currentStepIndex;

      await this.broadcastProgress(sessionId, {
        sessionId,
        status: 'executing',
        goal: loopState.goal,
        progress: {
          currentStep: currentStepIndex + 1,
          totalSteps: loopState.currentPlan.steps.length,
          stepDescription: currentStep.reasoning,
          completedSteps: currentStepIndex
        },
        currentAction: {
          type: currentStep.action.type,
          description: currentStep.reasoning
        },
        lastUpdate: new Date()
      });

      console.log(`⚡ Executing step ${currentStepIndex + 1} for session ${sessionId}:`, {
        action: currentStep.action.type,
        reasoning: currentStep.reasoning
      });

      // Execute the action with timeout
      const executePromise = this.mcpClient.executeAction(sessionId, currentStep.action);
      const timeoutPromise = new Promise<MCPResult>((_, reject) => 
        setTimeout(() => reject(new Error('Action timeout')), options.stepTimeout)
      );

      const result = await Promise.race([executePromise, timeoutPromise]);

      // Update step with result
      currentStep.result = result;
      currentStep.completed = true;
      
      // Move to next step
      loopState.currentPlan.nextStep = currentStepIndex + 1;

      // Update goal progress in database
      await this.storage.updateGoalProgress(
        sessionId,
        currentStepIndex,
        {
          action: currentStep.action,
          result,
          timestamp: new Date()
        }
      );

      console.log(`✅ Step ${currentStepIndex + 1} completed for session ${sessionId}:`, {
        success: result.success,
        duration: result.duration
      });

    } catch (error) {
      loopState.lastError = `Execution failed: ${error instanceof Error ? error.message : 'Unknown error'}`;
      console.error('Execute phase error:', error);
    }
  }

  private async observePhase(sessionId: string): Promise<void> {
    const loopState = this.activeLoops.get(sessionId);
    if (!loopState) return;

    try {
      loopState.status = 'observing';
      
      await this.broadcastProgress(sessionId, {
        sessionId,
        status: 'observing',
        goal: loopState.goal,
        progress: {
          currentStep: loopState.currentStep || 0,
          totalSteps: loopState.currentPlan?.steps.length || 0,
          stepDescription: 'Taking screenshot to observe results...',
          completedSteps: loopState.currentStep || 0
        },
        lastUpdate: new Date()
      });

      // Always take screenshot to observe current state
      const screenshotResult = await this.mcpClient.takeScreenshot(sessionId);
      
      if (screenshotResult.success && screenshotResult.data?.artifactId) {
        // Get screenshot path from artifacts
        const artifact = await this.storage.getArtifact(screenshotResult.data.artifactId);
        if (artifact) {
          loopState.lastScreenshotPath = artifact.filePath;
        }
      }

      console.log(`📸 Screenshot taken for session ${sessionId}:`, {
        success: screenshotResult.success,
        screenshotPath: loopState.lastScreenshotPath
      });

    } catch (error) {
      loopState.lastError = `Observation failed: ${error instanceof Error ? error.message : 'Unknown error'}`;
      console.error('Observe phase error:', error);
    }
  }

  private async checkPhase(sessionId: string): Promise<boolean> {
    const loopState = this.activeLoops.get(sessionId);
    if (!loopState || !loopState.currentPlan) return false;

    try {
      loopState.status = 'checking';
      
      await this.broadcastProgress(sessionId, {
        sessionId,
        status: 'checking',
        goal: loopState.goal,
        progress: {
          currentStep: loopState.currentStep || 0,
          totalSteps: loopState.currentPlan.steps.length,
          stepDescription: 'Checking if goal is completed...',
          completedSteps: loopState.currentStep || 0
        },
        lastUpdate: new Date()
      });

      // Check if all steps are completed
      const allStepsCompleted = loopState.currentPlan.steps.every(step => step.completed);
      
      if (allStepsCompleted) {
        // Use TaskPlanner to analyze goal completion
        const executedSteps = loopState.currentPlan.steps.filter(step => step.completed);
        const completionResult = await this.taskPlanner.checkGoalCompletion(
          loopState.goal,
          `Screenshot: ${loopState.lastScreenshotPath || 'none'}`,
          executedSteps
        );

        if (completionResult.isComplete && completionResult.confidence > 0.7) {
          loopState.status = 'completed';
          await this.storage.completeUserGoal(sessionId);
          
          console.log(`🎉 Goal completed for session ${sessionId}:`, {
            confidence: completionResult.confidence,
            explanation: completionResult.explanation
          });
          
          return true;
        }
      }

      // Check if more steps are needed but plan is exhausted
      if (loopState.currentPlan.nextStep >= loopState.currentPlan.steps.length) {
        // Need to re-plan or complete
        const executedSteps = loopState.currentPlan.steps.filter(step => step.completed);
        const completionResult = await this.taskPlanner.checkGoalCompletion(
          loopState.goal,
          `Screenshot: ${loopState.lastScreenshotPath || 'none'}`,
          executedSteps
        );

        if (completionResult.isComplete) {
          loopState.status = 'completed';
          await this.storage.completeUserGoal(sessionId);
          return true;
        } else {
          // Reset plan to force re-planning
          loopState.currentPlan = undefined;
        }
      }

      return false;
    } catch (error) {
      loopState.lastError = `Check failed: ${error instanceof Error ? error.message : 'Unknown error'}`;
      console.error('Check phase error:', error);
      return false;
    }
  }

  private async finalizeLoop(sessionId: string): Promise<void> {
    const loopState = this.activeLoops.get(sessionId);
    if (!loopState) return;

    const finalStatus = loopState.status === 'completed' ? 'completed' : 
                       loopState.status === 'stopped' ? 'stopped' : 'failed';

    await this.broadcastProgress(sessionId, {
      sessionId,
      status: finalStatus as ExecutionLoopStatus,
      goal: loopState.goal,
      progress: {
        currentStep: loopState.currentStep || 0,
        totalSteps: loopState.currentPlan?.steps.length || 0,
        stepDescription: finalStatus === 'completed' ? 'Goal achieved!' : 
                        finalStatus === 'stopped' ? 'Execution stopped' : 'Execution failed',
        completedSteps: loopState.currentStep || 0
      },
      lastUpdate: new Date(),
      error: loopState.lastError
    });

    console.log(`🏁 Execution loop finalized for session ${sessionId}:`, {
      status: finalStatus,
      cycles: loopState.cycleCount,
      error: loopState.lastError
    });

    // Keep loop state for a while for status queries
    setTimeout(() => this.activeLoops.delete(sessionId), 300000); // 5 minutes
  }

  private async handleLoopError(sessionId: string, error: any): Promise<void> {
    const loopState = this.activeLoops.get(sessionId);
    if (!loopState) return;

    loopState.status = 'failed';
    loopState.lastError = error instanceof Error ? error.message : 'Unknown error';
    loopState.lastActivity = new Date();

    await this.broadcastProgress(sessionId, {
      sessionId,
      status: 'failed',
      goal: loopState.goal,
      progress: {
        currentStep: loopState.currentStep || 0,
        totalSteps: loopState.currentPlan?.steps.length || 0,
        stepDescription: 'Execution failed due to error',
        completedSteps: loopState.currentStep || 0
      },
      lastUpdate: new Date(),
      error: loopState.lastError
    });
  }

  private async broadcastProgress(sessionId: string, progress: LoopProgress): Promise<void> {
    this.sseManager.broadcastToSession(sessionId, {
      type: 'execution_loop_progress',
      data: progress
    });

    // Also create event for persistence
    await this.storage.createEvent({
      sessionId,
      route: '/execution-loop/progress',
      method: 'UPDATE',
      status: 200,
      payload: progress,
      responseText: `Execution loop progress: ${progress.status}`
    });
  }

  private estimateActionDuration(action: MCPAction): number {
    // Rough estimates in milliseconds
    switch (action.type) {
      case 'navigate': return 5000;
      case 'screenshot': return 2000;
      case 'click': return 1000;
      case 'type': return 500;
      case 'wait_for': return 3000;
      case 'scroll': return 1000;
      default: return 2000;
    }
  }

  /**
   * Continue execution loop from current state
   */
  async continueLoop(sessionId: string): Promise<{ success: boolean; message: string }> {
    const loopState = this.activeLoops.get(sessionId);
    
    if (!loopState) {
      return {
        success: false,
        message: 'No execution loop found for this session'
      };
    }

    if (loopState.status === 'completed') {
      return {
        success: false,
        message: 'Execution loop is already completed'
      };
    }

    if (loopState.status === 'stopped') {
      return this.resumeLoop(sessionId);
    }

    // If already running, no action needed
    if (['planning', 'executing', 'observing', 'checking'].includes(loopState.status)) {
      return {
        success: true,
        message: 'Execution loop is already running'
      };
    }

    // Start the execution cycle if idle or failed
    if (loopState.status === 'idle' || loopState.status === 'failed') {
      loopState.status = 'planning';
      loopState.lastActivity = new Date();
      loopState.lastError = undefined;

      // Continue async execution
      this.runExecutionCycle(sessionId, this.defaultOptions).catch(error => {
        console.error(`Continue execution loop failed for session ${sessionId}:`, error);
        this.handleLoopError(sessionId, error);
      });

      return {
        success: true,
        message: 'Execution loop continued successfully'
      };
    }

    return {
      success: false,
      message: `Cannot continue loop in status: ${loopState.status}`
    };
  }

  /**
   * Resume a stopped execution loop
   */
  async resumeLoop(sessionId: string): Promise<{ success: boolean; message: string }> {
    const loopState = this.activeLoops.get(sessionId);
    
    if (!loopState) {
      return {
        success: false,
        message: 'No execution loop found for this session'
      };
    }

    if (loopState.status !== 'stopped') {
      return {
        success: false,
        message: `Cannot resume loop in status: ${loopState.status}. Only stopped loops can be resumed.`
      };
    }

    // Resume from where it was stopped
    loopState.status = 'planning';
    loopState.lastActivity = new Date();
    loopState.lastError = undefined;

    await this.broadcastProgress(sessionId, {
      sessionId,
      status: 'planning',
      goal: loopState.goal,
      progress: {
        currentStep: loopState.currentStep || 0,
        totalSteps: loopState.currentPlan?.steps.length || 0,
        stepDescription: 'Resuming execution...',
        completedSteps: loopState.currentStep || 0
      },
      lastUpdate: new Date()
    });

    // Continue async execution
    this.runExecutionCycle(sessionId, this.defaultOptions).catch(error => {
      console.error(`Resume execution loop failed for session ${sessionId}:`, error);
      this.handleLoopError(sessionId, error);
    });

    return {
      success: true,
      message: 'Execution loop resumed successfully'
    };
  }

  /**
   * Triggered when a new artifact (screenshot, file) is created
   * Automatically continues execution if loop is waiting
   */
  async onArtifact(sessionId: string, artifact: any): Promise<void> {
    const loopState = this.activeLoops.get(sessionId);
    
    if (!loopState) {
      // Check if there's a goal for this session that could benefit from automation
      try {
        const userGoal = await this.storage.getUserGoalBySession(sessionId);
        if (userGoal && userGoal.status === 'active') {
          console.log(`🎯 Found active goal for session ${sessionId}, starting automation for artifact:`, artifact.type);
          
          // Start execution loop with the goal
          await this.startLoop(sessionId, userGoal.originalGoal);
          return;
        }
      } catch (error) {
        console.error('Error checking for user goal:', error);
      }
      return;
    }

    // Update loop state with new artifact info
    if (artifact.type === 'screenshot') {
      loopState.lastScreenshotPath = artifact.filePath;
      loopState.lastActivity = new Date();
    }

    // If loop is idle or waiting, trigger continuation
    if (loopState.status === 'idle' || loopState.status === 'observing') {
      console.log(`🔄 Artifact ${artifact.type} created, continuing execution for session ${sessionId}`);
      
      await this.continueLoop(sessionId);
    }

    // Broadcast artifact event
    await this.broadcastProgress(sessionId, {
      sessionId,
      status: loopState.status,
      goal: loopState.goal,
      progress: {
        currentStep: loopState.currentStep || 0,
        totalSteps: loopState.currentPlan?.steps.length || 0,
        stepDescription: `New ${artifact.type} available: ${artifact.filePath}`,
        completedSteps: loopState.currentStep || 0
      },
      lastUpdate: new Date()
    });
  }

  /**
   * Check if a session has an active goal that should trigger automation
   */
  async shouldStartAutomation(sessionId: string): Promise<boolean> {
    try {
      if (this.activeLoops.has(sessionId)) {
        return false; // Already has active loop
      }

      const userGoal = await this.storage.getUserGoalBySession(sessionId);
      return userGoal && userGoal.status === 'active';
    } catch (error) {
      console.error('Error checking automation eligibility:', error);
      return false;
    }
  }

  /**
   * Get all active loops
   */
  getActiveLoops(): string[] {
    return Array.from(this.activeLoops.keys()).filter(sessionId => {
      const state = this.activeLoops.get(sessionId);
      return state && !['completed', 'failed', 'stopped'].includes(state.status);
    });
  }

  /**
   * Clean up finished loops
   */
  cleanup(): void {
    const now = Date.now();
    const staleThreshold = 5 * 60 * 1000; // 5 minutes

    for (const [sessionId, state] of this.activeLoops.entries()) {
      if (now - state.lastActivity.getTime() > staleThreshold) {
        this.activeLoops.delete(sessionId);
      }
    }
  }
}