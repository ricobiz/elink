import { OpenRouterService } from './openRouterService';
import { mcpClient } from './mcpClient';
import { linkLanguageService } from './linkLanguage';
import type { MCPAction, MCPResult } from '@shared/schema';

interface ExecutorTask {
  id: string;
  sessionId: string;
  goal: string;
  context: {
    currentUrl?: string;
    pageTitle?: string;
    screenshotPath?: string;
    previousActions?: ExecutorAction[];
  };
}

interface ExecutorAction {
  type: 'navigate' | 'click' | 'type' | 'screenshot' | 'scroll' | 'wait';
  params?: any;
  reasoning: string;
  expectedOutcome: string;
  result?: MCPResult;
}

interface ExecutorPlan {
  actions: ExecutorAction[];
  reasoning: string;
  confidence: number;
}

interface ExecutorResult {
  success: boolean;
  actions: ExecutorAction[];
  finalState: {
    currentUrl?: string;
    pageTitle?: string;
    screenshotPath?: string;
  };
  summary: string;
  error?: string;
}

/**
 * ExecutorService - Техническая реализация автоматизации браузера
 * 
 * Особенности:
 * - Использует openai/gpt-oss-20b:free модель
 * - НЕ хранит контекст между задачами
 * - Фокусируется на технической реализации
 * - Function calling для браузерных действий
 */
export class ExecutorService {
  private openRouter: OpenRouterService;
  private executorTier = 'executor'; // Используем executor tier с fallback моделями

  constructor(storage?: any) {
    this.openRouter = new OpenRouterService(storage);
  }

  /**
   * Выполнить техническую задачу автоматизации
   * Каждая задача выполняется как новая (БЕЗ памяти контекста)
   */
  async executeTask(task: ExecutorTask): Promise<ExecutorResult> {
    console.log('🔧 EXECUTOR: Starting technical automation task:', {
      id: task.id,
      sessionId: task.sessionId,
      goal: task.goal.slice(0, 100)
    });

    try {
      // 1. Создать план действий
      const plan = await this.createExecutionPlan(task);
      
      // 2. Выполнить план пошагово
      const executedActions: ExecutorAction[] = [];
      let lastResult: MCPResult | undefined;
      
      for (let index = 0; index < plan.actions.length; index++) {
        const action = plan.actions[index];
        console.log(`🔧 EXECUTOR: Executing step ${index + 1}/${plan.actions.length}: ${action.type}`);
        
        try {
          // Выполнить действие
          const result = await this.executeAction(task.sessionId, action);
          
          // Сохранить результат
          action.result = result;
          executedActions.push(action);
          lastResult = result;
          
          // Если действие не удалось, попробовать восстановиться
          if (!result.success) {
            console.warn(`🔧 EXECUTOR: Action failed, attempting recovery:`, result.error);
            
            // Попробовать альтернативный подход
            const recoveryAction = await this.createRecoveryAction(task, action, result);
            if (recoveryAction) {
              const recoveryResult = await this.executeAction(task.sessionId, recoveryAction);
              recoveryAction.result = recoveryResult;
              executedActions.push(recoveryAction);
              lastResult = recoveryResult;
            }
          }
          
          // Небольшая пауза между действиями для человекоподобного поведения
          await new Promise(resolve => setTimeout(resolve, 1000 + Math.random() * 2000));
          
        } catch (error) {
          console.error(`🔧 EXECUTOR: Error executing action ${action.type}:`, error);
          action.result = {
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error'
          };
          executedActions.push(action);
        }
      }
      
      // 3. Получить финальное состояние
      const finalState = await this.getFinalState(task.sessionId);
      
      // 4. Создать сводку результатов
      const summary = await this.createExecutionSummary(task, executedActions, finalState);
      
      return {
        success: executedActions.some(action => action.result?.success),
        actions: executedActions,
        finalState,
        summary
      };
      
    } catch (error) {
      console.error('🔧 EXECUTOR: Task execution failed:', error);
      
      return {
        success: false,
        actions: [],
        finalState: {},
        summary: `Выполнение задачи завершилось ошибкой: ${error instanceof Error ? error.message : 'Неизвестная ошибка'}`,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Создать план выполнения на основе технического задания
   */
  private async createExecutionPlan(task: ExecutorTask): Promise<ExecutorPlan> {
    const systemPrompt = `Ты - Executor AI, специализирующийся на технической реализации автоматизации браузера.

ТВОЯ РОЛЬ:
- Создавать детальные планы браузерной автоматизации
- Использовать только технические браузерные действия
- НЕ думать о контексте - каждая задача новая
- Быть максимально эффективным и точным

ДОСТУПНЫЕ ДЕЙСТВИЯ:
- navigate: перейти на URL
- screenshot: сделать скриншот
- click: кликнуть по координатам или селектору  
- type: ввести текст
- scroll: прокрутить страницу
- wait: подождать

ФОРМАТ ОТВЕТА (JSON):
{
  "actions": [
    {
      "type": "screenshot",
      "params": {},
      "reasoning": "Получить текущее состояние страницы",
      "expectedOutcome": "Скриншот текущей страницы"
    },
    {
      "type": "navigate", 
      "params": { "url": "https://example.com" },
      "reasoning": "Перейти на целевую страницу",
      "expectedOutcome": "Страница загружена"
    }
  ],
  "reasoning": "Общий план действий",
  "confidence": 0.9
}`;

    const userPrompt = `ТЕХНИЧЕСКОЕ ЗАДАНИЕ:
Цель: ${task.goal}

ТЕКУЩИЙ КОНТЕКСТ:
${task.context.currentUrl ? `URL: ${task.context.currentUrl}` : 'URL: неизвестен'}
${task.context.pageTitle ? `Заголовок: ${task.context.pageTitle}` : 'Заголовок: неизвестен'}
${task.context.screenshotPath ? `Скриншот: доступен` : 'Скриншот: недоступен'}
${task.context.previousActions?.length ? `Предыдущие действия: ${task.context.previousActions.length}` : 'Предыдущие действия: нет'}

Создай технический план автоматизации для достижения цели.
Начни со скриншота если его нет, затем выполни необходимые действия.
Отвечай ТОЛЬКО JSON без дополнительного текста.`;

    try {
      const response = await this.openRouter.callOpenRouterWithRouting(
        userPrompt,
        systemPrompt,
        this.executorTier,
        task.sessionId
      );
      
      // Парсим JSON ответ
      const planData = JSON.parse(response.content);
      
      // Валидируем план
      if (!planData.actions || !Array.isArray(planData.actions)) {
        throw new Error('Invalid plan format: missing actions array');
      }
      
      return {
        actions: planData.actions.map((action: any) => ({
          type: action.type,
          params: action.params || {},
          reasoning: action.reasoning || '',
          expectedOutcome: action.expectedOutcome || ''
        })),
        reasoning: planData.reasoning || 'Технический план автоматизации',
        confidence: planData.confidence || 0.8
      };
      
    } catch (error) {
      console.error('🔧 EXECUTOR: Failed to create execution plan:', error);
      
      // Fallback план
      return {
        actions: [
          {
            type: 'screenshot',
            params: {},
            reasoning: 'Получить текущее состояние для анализа',
            expectedOutcome: 'Скриншот текущей страницы'
          }
        ],
        reasoning: 'Fallback план - получение состояния',
        confidence: 0.5
      };
    }
  }

  /**
   * Выполнить отдельное действие
   */
  private async executeAction(sessionId: string, action: ExecutorAction): Promise<MCPResult> {
    console.log(`🔧 EXECUTOR: Executing ${action.type} with params:`, action.params);
    
    const mcpAction: MCPAction = {
      type: action.type as any,
      params: action.params
    };
    
    // Выполнить действие через MCP клиент
    return await mcpClient.executeAction(sessionId, mcpAction);
  }

  /**
   * Создать действие для восстановления после ошибки
   */
  private async createRecoveryAction(
    task: ExecutorTask, 
    failedAction: ExecutorAction, 
    error: MCPResult
  ): Promise<ExecutorAction | null> {
    const systemPrompt = `Ты - Executor AI. Создай альтернативное действие для восстановления после ошибки.

ФОРМАТ ОТВЕТА (JSON):
{
  "type": "screenshot",
  "params": {},
  "reasoning": "Причина выбора альтернативы",
  "expectedOutcome": "Ожидаемый результат"
}

Если восстановление невозможно, верни null.`;

    const userPrompt = `НЕУДАВШЕЕСЯ ДЕЙСТВИЕ:
Тип: ${failedAction.type}
Параметры: ${JSON.stringify(failedAction.params)}
Ошибка: ${error.error}

КОНТЕКСТ ЗАДАЧИ:
Цель: ${task.goal}

Предложи альтернативное действие или верни null если восстановление невозможно.
Отвечай ТОЛЬКО JSON.`;

    try {
      const response = await this.openRouter.callOpenRouterWithRouting(
        userPrompt,
        systemPrompt,
        this.executorTier,
        task.sessionId
      );
      
      if (response.content.trim() === 'null') {
        return null;
      }
      
      const recoveryData = JSON.parse(response.content);
      
      return {
        type: recoveryData.type,
        params: recoveryData.params || {},
        reasoning: `ВОССТАНОВЛЕНИЕ: ${recoveryData.reasoning}`,
        expectedOutcome: recoveryData.expectedOutcome || 'Попытка восстановления'
      };
      
    } catch (error) {
      console.error('🔧 EXECUTOR: Failed to create recovery action:', error);
      return null;
    }
  }

  /**
   * Получить финальное состояние после выполнения
   */
  private async getFinalState(sessionId: string): Promise<any> {
    try {
      // Получить текущий URL
      const urlResult = await mcpClient.getCurrentUrl(sessionId);
      const currentUrl = urlResult.success ? urlResult.data : undefined;
      
      // Получить заголовок страницы  
      const titleResult = await mcpClient.getPageTitle(sessionId);
      const pageTitle = titleResult.success ? titleResult.data : undefined;
      
      // Сделать финальный скриншот
      const screenshotResult = await mcpClient.takeScreenshot(sessionId);
      const screenshotPath = screenshotResult.success ? screenshotResult.data : undefined;
      
      return {
        currentUrl,
        pageTitle,
        screenshotPath
      };
      
    } catch (error) {
      console.error('🔧 EXECUTOR: Failed to get final state:', error);
      return {};
    }
  }

  /**
   * Создать сводку выполнения
   */
  private async createExecutionSummary(
    task: ExecutorTask,
    actions: ExecutorAction[],
    finalState: any
  ): Promise<string> {
    const systemPrompt = `Ты - Executor AI. Создай краткую техническую сводку выполнения.

ФОРМАТ: Простой текст, до 200 символов.
Сосредоточься на технических результатах, без эмоций.`;

    const userPrompt = `ЗАДАЧА: ${task.goal}

ВЫПОЛНЕННЫЕ ДЕЙСТВИЯ:
${actions.map((action, i) => 
  `${i + 1}. ${action.type} - ${action.result?.success ? 'успех' : 'ошибка'}`
).join('\n')}

ФИНАЛЬНОЕ СОСТОЯНИЕ:
URL: ${finalState.currentUrl || 'неизвестен'}
Заголовок: ${finalState.pageTitle || 'неизвестен'}

Создай краткую техническую сводку результата.`;

    try {
      const response = await this.openRouter.callOpenRouterWithRouting(
        userPrompt,
        systemPrompt,
        this.executorTier,
        task.sessionId
      );
      return response.content;
    } catch (error) {
      console.error('🔧 EXECUTOR: Failed to create summary:', error);
      
      const successfulActions = actions.filter(a => a.result?.success).length;
      const totalActions = actions.length;
      
      return `Выполнено ${successfulActions}/${totalActions} действий. Состояние: ${finalState.currentUrl || 'неизвестно'}.`;
    }
  }

  /**
   * Вызвать Executor модель через OpenRouter
   */
  private async callExecutorModel(userPrompt: string, systemPrompt: string): Promise<string> {
    try {
      const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'https://eiros.link',
          'X-Title': 'EIROS LINK Executor'
        },
        body: JSON.stringify({
          model: this.executorTier,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt }
          ],
          temperature: 0.1, // Низкая температура для технической точности
          max_tokens: 1000
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
      console.error('🔧 EXECUTOR: OpenRouter API call failed:', error);
      throw error;
    }
  }

  /**
   * Проверить доступность Executor модели
   */
  async checkModelAvailability(): Promise<boolean> {
    try {
      const response = await this.openRouter.callOpenRouterWithRouting(
        'Проверка связи. Ответь: OK',
        'Ты - тестовый Executor AI. Отвечай кратко.',
        this.executorTier,
        'test-session'
      );
      
      return response.content.includes('OK');
      
    } catch (error) {
      console.error('🔧 EXECUTOR: Model availability check failed:', error);
      return false;
    }
  }
}

// Экспорт синглтона
export const executorService = new ExecutorService();