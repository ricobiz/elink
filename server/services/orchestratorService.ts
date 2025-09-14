import { ExecutorService, executorService } from './executorService';
import { OpenRouterService } from './openRouterService';
import { sseManager } from './sseManager';
import { ResultReporterService } from './resultReporterService';
import { TaskDecomposerService } from './taskDecomposerService';
import { v4 as uuidv4 } from 'uuid';

interface OrchestratorRequest {
  sessionId: string;
  userGoal: string;
  chatContext: {
    recentMessages: Array<{
      type: 'user' | 'ai' | 'system';
      content: string;
      timestamp: Date;
    }>;
    currentGoal?: {
      originalGoal: string;
      currentPlan: string[];
      currentStep: number;
      stepResults: any[];
    };
  };
  browserContext: {
    currentUrl?: string;
    pageTitle?: string;
    screenshotPath?: string;
    recentActions?: string[];
  };
}

interface OrchestratorResult {
  success: boolean;
  userFriendlyResponse: string;
  technicalSummary: string;
  actions: Array<{
    type: string;
    description: string;
    success: boolean;
    result?: string;
  }>;
  finalBrowserState: {
    currentUrl?: string;
    pageTitle?: string;
    screenshotPath?: string;
  };
  executionTime: number;
  nextSteps?: string[];
}

interface AutomationSession {
  id: string;
  sessionId: string;
  goal: string;
  status: 'active' | 'completed' | 'failed' | 'paused';
  startTime: Date;
  lastActivity: Date;
  executorTasks: string[];
  progress: {
    completed: number;
    total: number;
    currentAction: string;
  };
}

/**
 * OrchestratorService - "Нервная система" между Chat и Executor
 * 
 * Задачи:
 * - Получать задачи от Chat Model в человекочитаемом виде
 * - Переводить их в технические задания для Executor
 * - Управлять сессиями автоматизации
 * - Интерпретировать результаты выполнения в понятные логи
 * - Обеспечивать связь Chat ↔ Executor
 */
export class OrchestratorService {
  private openRouter: OpenRouterService;
  private executor: ExecutorService;
  private resultReporter: ResultReporterService;
  private taskDecomposer: TaskDecomposerService;
  private activeSessions: Map<string, AutomationSession> = new Map();
  private orchestratorTier = 'orchestrator'; // Используем orchestrator tier с fallback моделями

  constructor(storage?: any) {
    this.openRouter = new OpenRouterService(storage);
    this.executor = executorService; // Используем синглтон
    this.resultReporter = new ResultReporterService(this.openRouter, sseManager);
    this.taskDecomposer = new TaskDecomposerService(this.openRouter);
    
    console.log('🔄 ORCHESTRATOR: Initialized with ResultReporter and TaskDecomposer integration');
  }

  /**
   * Основная точка входа - обработка запроса от Chat Model
   */
  async processAutomationRequest(request: OrchestratorRequest): Promise<OrchestratorResult> {
    const startTime = Date.now();
    
    console.log('🔄 ORCHESTRATOR: Processing automation request:', {
      sessionId: request.sessionId,
      goal: request.userGoal.slice(0, 100),
      hasContext: !!request.chatContext.currentGoal
    });

    try {
      // 🛡️ 0. SAFETY GATES: Минимальные проверки безопасности
      const safetyCheck = this.performSafetyChecks(request);
      if (!safetyCheck.safe) {
        console.warn('🛡️ SAFETY: High risk request detected, proceeding with extra caution...');
        // В bypass mode продолжаем, но логируем предупреждения
      }
      
      // 1. Создать или найти сессию автоматизации
      const automationSession = await this.getOrCreateAutomationSession(request);
      
      // 2. Проанализировать запрос и создать техническое задание
      const technicalTask = await this.createTechnicalTask(request, automationSession);
      
      // 3. Отправить уведомление о начале выполнения
      this.notifyExecutionStart(request.sessionId, technicalTask);
      
      // 4. Выполнить задачу через Executor
      const executorResult = await this.executor.executeTask(technicalTask);
      
      // 5. Обновить сессию автоматизации
      await this.updateAutomationSession(automationSession, executorResult);
      
      // 🔥 5.5. НОВОЕ: ResultReporter - автоматическая обработка результатов
      console.log('📋 ORCHESTRATOR: Processing results through ResultReporter...');
      const reportingResult = await this.resultReporter.handleResult({
        taskId: technicalTask.id,
        sessionId: request.sessionId,
        success: executorResult.success,
        data: executorResult,
        executionTime: Date.now() - startTime,
        metadata: {
          originalTask: request.userGoal,
          automationType: 'orchestrated_execution',
          riskLevel: 0
        }
      }, request.sessionId);
      
      console.log('📋 ORCHESTRATOR: ResultReporter completed:', {
        modelResponse: reportingResult.modelResponse.slice(0, 100),
        systemMessageSent: reportingResult.systemMessageSent,
        strategy: reportingResult.reportingStrategy
      });
      
      // 6. Интерпретировать результаты для Chat Model
      const interpretedResult = await this.interpretExecutorResult(
        request,
        executorResult,
        automationSession
      );
      
      // 7. Отправить уведомление о завершении
      this.notifyExecutionComplete(request.sessionId, interpretedResult);
      
      const executionTime = Date.now() - startTime;
      
      return {
        ...interpretedResult,
        executionTime
      };
      
    } catch (error) {
      console.error('🔄 ORCHESTRATOR: Request processing failed:', error);
      
      const executionTime = Date.now() - startTime;
      
      // 🔥 ДАЖЕ ПРИ ОШИБКЕ: отправляем через ResultReporter
      try {
        await this.resultReporter.handleResult({
          taskId: `error_${request.sessionId}_${Date.now()}`,
          sessionId: request.sessionId,
          success: false,
          data: null,
          error: error instanceof Error ? error.message : 'Unknown orchestrator error',
          executionTime,
          metadata: {
            originalTask: request.userGoal,
            automationType: 'orchestrator_error',
            riskLevel: 2
          }
        }, request.sessionId);
      } catch (reportingError) {
        console.error('🔄 ORCHESTRATOR: Failed to report error via ResultReporter:', reportingError);
      }
      
      return {
        success: false,
        userFriendlyResponse: `Извините, не удалось выполнить автоматизацию: ${error instanceof Error ? error.message : 'Неизвестная ошибка'}`,
        technicalSummary: `Ошибка оркестратора: ${error instanceof Error ? error.message : 'Unknown error'}`,
        actions: [],
        finalBrowserState: {},
        executionTime
      };
    }
  }

  /**
   * 🛡️ SAFETY GATES: Минимальные проверки безопасности даже в bypass mode
   */
  private performSafetyChecks(request: OrchestratorRequest): { safe: boolean; warnings: string[]; riskLevel: number } {
    const warnings: string[] = [];
    let riskLevel = 0;
    
    // Базовые проверки
    if (request.userGoal.toLowerCase().includes('delete') || request.userGoal.toLowerCase().includes('remove')) {
      warnings.push('Detected destructive action keywords');
      riskLevel += 1;
    }
    
    if (request.userGoal.toLowerCase().includes('system') || request.userGoal.toLowerCase().includes('admin')) {
      warnings.push('Detected system-level operation');
      riskLevel += 1;
    }
    
    const isUnsafe = riskLevel > 2;
    
    console.log('🛡️ SAFETY CHECK:', {
      goal: request.userGoal.slice(0, 50),
      riskLevel,
      warnings: warnings.length,
      safe: !isUnsafe
    });
    
    return {
      safe: !isUnsafe,
      warnings,
      riskLevel
    };
  }

  /**
   * 🧩 НОВОЕ: Обработка decomposition requests
   */
  async processDecompositionRequest(request: OrchestratorRequest, decompositionConfig?: any): Promise<OrchestratorResult> {
    console.log('🧩 ORCHESTRATOR: Processing decomposition request...', {
      sessionId: request.sessionId,
      goal: request.userGoal.slice(0, 100)
    });
    
    try {
      const decompositionResult = await this.taskDecomposer.decomposeTask({
        originalTask: request.userGoal,
        userGoal: request.userGoal,
        context: {
          sessionId: request.sessionId,
          maxDepth: decompositionConfig?.maxDepth || 3,
          availableCapabilities: ['automation', 'browsing']
        },
        constraints: {
          maxTasks: decompositionConfig?.maxTasks || 10,
          safetyLevel: 'moderate'
        }
      });
      
      // После decomposition всегда вызываем ResultReporter
      const reportingResult = await this.resultReporter.handleResult({
        taskId: `decomposition_${request.sessionId}_${Date.now()}`,
        sessionId: request.sessionId,
        success: decompositionResult.success,
        data: decompositionResult,
        metadata: {
          originalTask: request.userGoal,
          automationType: 'decomposition',
          riskLevel: 1
        }
      }, request.sessionId);
      
      return {
        success: decompositionResult.success,
        userFriendlyResponse: `Задача разбита на ${decompositionResult.totalTasks} подзадач. ${reportingResult.modelResponse}`,
        technicalSummary: `Decomposition: ${decompositionResult.totalTasks} tasks, depth: ${decompositionResult.decompositionDepth}`,
        actions: decompositionResult.atomicTasks.map((task, i) => ({
          type: 'decompose',
          description: `Подзадача ${i + 1}: ${task.description}`,
          success: true,
          result: `Создана атомарная задача (${task.safetyLevel})`
        })),
        finalBrowserState: {},
        executionTime: decompositionResult.metadata.decompositionTime
      };
      
    } catch (error) {
      console.error('🧩 ORCHESTRATOR: Decomposition failed:', error);
      return {
        success: false,
        userFriendlyResponse: `Не удалось разбить задачу: ${error instanceof Error ? error.message : 'Неизвестная ошибка'}`,
        technicalSummary: `Decomposition error: ${error instanceof Error ? error.message : 'Unknown error'}`,
        actions: [],
        finalBrowserState: {},
        executionTime: 0
      };
    }
  }

  /**
   * Создать или найти существующую сессию автоматизации
   */
  private async getOrCreateAutomationSession(request: OrchestratorRequest): Promise<AutomationSession> {
    const existingSession = this.activeSessions.get(request.sessionId);
    
    if (existingSession && existingSession.status === 'active') {
      // Обновить активность существующей сессии
      existingSession.lastActivity = new Date();
      return existingSession;
    }
    
    // Создать новую сессию
    const newSession: AutomationSession = {
      id: uuidv4(),
      sessionId: request.sessionId,
      goal: request.userGoal,
      status: 'active',
      startTime: new Date(),
      lastActivity: new Date(),
      executorTasks: [],
      progress: {
        completed: 0,
        total: 1,
        currentAction: 'Планирование'
      }
    };
    
    this.activeSessions.set(request.sessionId, newSession);
    
    console.log('🔄 ORCHESTRATOR: Created new automation session:', newSession.id);
    
    return newSession;
  }

  /**
   * Создать техническое задание для Executor
   */
  private async createTechnicalTask(
    request: OrchestratorRequest, 
    session: AutomationSession
  ): Promise<any> {
    const systemPrompt = `Ты - Orchestrator AI, переводишь пользовательские задачи в технические задания.

ТВОЯ РОЛЬ:
- Анализировать цель пользователя и контекст
- Создавать четкие технические задания для Executor
- Учитывать текущее состояние браузера
- Разбивать сложные задачи на простые действия

ФОРМАТ ТЕХНИЧЕСКОЕ ЗАДАНИЕ:
{
  "id": "уникальный ID",
  "sessionId": "ID сессии", 
  "goal": "четкая техническая цель",
  "context": {
    "currentUrl": "текущий URL",
    "pageTitle": "заголовок страницы",
    "screenshotPath": "путь к скриншоту",
    "previousActions": []
  }
}`;

    const userPrompt = `ПОЛЬЗОВАТЕЛЬСКАЯ ЗАДАЧА: ${request.userGoal}

КОНТЕКСТ ЧАТА:
${request.chatContext.currentGoal ? `
Активная цель: ${request.chatContext.currentGoal.originalGoal}
План: ${request.chatContext.currentGoal.currentPlan.join(', ')}
Текущий шаг: ${request.chatContext.currentGoal.currentStep + 1}/${request.chatContext.currentGoal.currentPlan.length}
` : 'Новая задача без активной цели'}

СОСТОЯНИЕ БРАУЗЕРА:
URL: ${request.browserContext.currentUrl || 'неизвестен'}
Заголовок: ${request.browserContext.pageTitle || 'неизвестен'}
Скриншот: ${request.browserContext.screenshotPath ? 'доступен' : 'недоступен'}
Недавние действия: ${request.browserContext.recentActions?.join(', ') || 'нет'}

СЕССИЯ АВТОМАТИЗАЦИИ:
ID: ${session.id}
Статус: ${session.status}
Прогресс: ${session.progress.completed}/${session.progress.total}

Создай техническое задание для Executor. Отвечай ТОЛЬКО JSON.`;

    try {
      const response = await this.openRouter.callOpenRouterWithRouting(
        userPrompt,
        systemPrompt,
        this.orchestratorTier,
        request.sessionId
      );
      const taskData = JSON.parse(response.content);
      
      // Валидация и дополнение
      return {
        id: taskData.id || uuidv4(),
        sessionId: request.sessionId,
        goal: taskData.goal || request.userGoal,
        context: {
          currentUrl: request.browserContext.currentUrl,
          pageTitle: request.browserContext.pageTitle,
          screenshotPath: request.browserContext.screenshotPath,
          previousActions: request.browserContext.recentActions || [],
          ...taskData.context
        }
      };
      
    } catch (error) {
      console.error('🔄 ORCHESTRATOR: Failed to create technical task:', error);
      
      // Fallback задание
      return {
        id: uuidv4(),
        sessionId: request.sessionId,
        goal: request.userGoal,
        context: {
          currentUrl: request.browserContext.currentUrl,
          pageTitle: request.browserContext.pageTitle,
          screenshotPath: request.browserContext.screenshotPath,
          previousActions: request.browserContext.recentActions || []
        }
      };
    }
  }

  /**
   * Интерпретировать результаты Executor для Chat Model
   */
  private async interpretExecutorResult(
    request: OrchestratorRequest,
    executorResult: any,
    session: AutomationSession
  ): Promise<Omit<OrchestratorResult, 'executionTime'>> {
    const systemPrompt = `Ты - Orchestrator AI, интерпретируешь технические результаты для пользователя.

ТВОЯ РОЛЬ:
- Переводить технические результаты в понятный ответ
- Объяснять что было сделано простыми словами
- Предлагать следующие шаги при необходимости
- Сохранять дружелюбный тон общения

ФОРМАТ ОТВЕТА:
{
  "success": true/false,
  "userFriendlyResponse": "Понятный ответ пользователю",
  "technicalSummary": "Краткая техническая сводка",
  "actions": [
    {
      "type": "screenshot",
      "description": "Сделал скриншот страницы",
      "success": true,
      "result": "Получен снимок текущего состояния"
    }
  ],
  "finalBrowserState": {
    "currentUrl": "URL",
    "pageTitle": "Заголовок",
    "screenshotPath": "Путь"
  },
  "nextSteps": ["Предложение 1", "Предложение 2"]
}`;

    const userPrompt = `ИСХОДНАЯ ЗАДАЧА: ${request.userGoal}

РЕЗУЛЬТАТ ВЫПОЛНЕНИЯ:
Успех: ${executorResult.success}
Действий выполнено: ${executorResult.actions?.length || 0}
Техническая сводка: ${executorResult.summary}
${executorResult.error ? `Ошибка: ${executorResult.error}` : ''}

ВЫПОЛНЕННЫЕ ДЕЙСТВИЯ:
${executorResult.actions?.map((action: any, i: number) => 
  `${i + 1}. ${action.type} - ${action.result?.success ? 'успех' : 'ошибка'} (${action.reasoning})`
).join('\n') || 'Нет действий'}

ФИНАЛЬНОЕ СОСТОЯНИЕ:
URL: ${executorResult.finalState?.currentUrl || 'неизвестен'}
Заголовок: ${executorResult.finalState?.pageTitle || 'неизвестен'}
Скриншот: ${executorResult.finalState?.screenshotPath || 'недоступен'}

КОНТЕКСТ СЕССИИ:
Цель сессии: ${session.goal}
Прогресс: ${session.progress.completed + 1}/${session.progress.total + 1}

Создай понятный ответ пользователю. Отвечай ТОЛЬКО JSON.`;

    try {
      const response = await this.openRouter.callOpenRouterWithRouting(
        userPrompt,
        systemPrompt,
        this.orchestratorTier,
        request.sessionId
      );
      const interpretedData = JSON.parse(response.content);
      
      return {
        success: executorResult.success,
        userFriendlyResponse: interpretedData.userFriendlyResponse || 'Выполнение завершено',
        technicalSummary: interpretedData.technicalSummary || executorResult.summary,
        actions: interpretedData.actions || [],
        finalBrowserState: interpretedData.finalBrowserState || executorResult.finalState || {},
        nextSteps: interpretedData.nextSteps
      };
      
    } catch (error) {
      console.error('🔄 ORCHESTRATOR: Failed to interpret result:', error);
      
      // Fallback интерпретация
      const successfulActions = executorResult.actions?.filter((a: any) => a.result?.success)?.length || 0;
      const totalActions = executorResult.actions?.length || 0;
      
      return {
        success: executorResult.success,
        userFriendlyResponse: executorResult.success 
          ? `Автоматизация выполнена! Выполнено ${successfulActions} из ${totalActions} действий.`
          : `Автоматизация не завершена. Выполнено ${successfulActions} из ${totalActions} действий.`,
        technicalSummary: executorResult.summary || 'Техническая сводка недоступна',
        actions: executorResult.actions?.map((action: any) => ({
          type: action.type,
          description: action.reasoning || action.type,
          success: action.result?.success || false,
          result: action.result?.data || action.result?.error
        })) || [],
        finalBrowserState: executorResult.finalState || {}
      };
    }
  }

  /**
   * Обновить сессию автоматизации
   */
  private async updateAutomationSession(
    session: AutomationSession,
    executorResult: any
  ): Promise<void> {
    session.lastActivity = new Date();
    session.progress.completed += 1;
    session.progress.currentAction = executorResult.success ? 'Завершено' : 'Ошибка';
    
    if (executorResult.success) {
      session.status = 'completed';
    } else {
      session.status = 'failed';
    }
    
    // Добавить ID задачи к выполненным
    if (executorResult.taskId) {
      session.executorTasks.push(executorResult.taskId);
    }
    
    console.log('🔄 ORCHESTRATOR: Updated automation session:', {
      id: session.id,
      status: session.status,
      progress: session.progress
    });
  }

  /**
   * Уведомить о начале выполнения
   */
  private notifyExecutionStart(sessionId: string, task: any): void {
    try {
      sseManager.broadcastToSession(sessionId, {
        type: 'automation_start',
        data: {
          taskId: task.id,
          goal: task.goal,
          timestamp: new Date().toISOString()
        }
      });
    } catch (error) {
      console.warn('🔄 ORCHESTRATOR: Failed to send start notification:', error);
    }
  }

  /**
   * Уведомить о завершении выполнения
   */
  private notifyExecutionComplete(sessionId: string, result: any): void {
    try {
      sseManager.broadcastToSession(sessionId, {
        type: 'automation_complete',
        data: {
          success: result.success,
          summary: result.technicalSummary,
          timestamp: new Date().toISOString()
        }
      });
    } catch (error) {
      console.warn('🔄 ORCHESTRATOR: Failed to send complete notification:', error);
    }
  }

  /**
   * Вызвать Orchestrator модель через OpenRouter
   */
  private async callOrchestratorModel(userPrompt: string, systemPrompt: string): Promise<string> {
    try {
      const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'https://eiros.link',
          'X-Title': 'EIROS LINK Orchestrator'
        },
        body: JSON.stringify({
          model: this.orchestratorTier,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt }
          ],
          temperature: 0.3, // Умеренная температура для гибкости
          max_tokens: 1500
        })
      });

      if (!response.ok) {
        throw new Error(`OpenRouter API error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      
      if (!data.choices?.[0]?.message?.content) {
        throw new Error('Invalid response from OpenRouter API');
      }

      return data.choices[0].message.content.trim();
      
    } catch (error) {
      console.error('🔄 ORCHESTRATOR: OpenRouter API call failed:', error);
      throw error;
    }
  }

  /**
   * Получить информацию об активных сессиях
   */
  getActiveSessions(): AutomationSession[] {
    return Array.from(this.activeSessions.values());
  }

  /**
   * Получить сессию по ID
   */
  getSession(sessionId: string): AutomationSession | undefined {
    return this.activeSessions.get(sessionId);
  }

  /**
   * Завершить сессию автоматизации
   */
  terminateSession(sessionId: string): boolean {
    const session = this.activeSessions.get(sessionId);
    if (session) {
      session.status = 'completed';
      session.lastActivity = new Date();
      return true;
    }
    return false;
  }

  /**
   * Очистить неактивные сессии (старше 1 часа)
   */
  cleanupInactiveSessions(): number {
    const cutoffTime = Date.now() - (60 * 60 * 1000); // 1 час
    let cleaned = 0;
    
    const sessionsToDelete: string[] = [];
    this.activeSessions.forEach((session, sessionId) => {
      if (session.lastActivity.getTime() < cutoffTime) {
        sessionsToDelete.push(sessionId);
      }
    });
    
    for (const sessionId of sessionsToDelete) {
      this.activeSessions.delete(sessionId);
      cleaned++;
    }
    
    if (cleaned > 0) {
      console.log(`🔄 ORCHESTRATOR: Cleaned up ${cleaned} inactive sessions`);
    }
    
    return cleaned;
  }
}

// Экспорт синглтона
export const orchestratorService = new OrchestratorService();