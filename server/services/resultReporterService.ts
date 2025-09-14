// 📋 RESULT REPORTER SERVICE - СИСТЕМНАЯ ОТЧЕТНОСТЬ
// Реализация автоматической отправки результатов без озвучивания запрещенного
// Принцип: AI не озвучивает результаты - система отправляет автоматически

import { OpenRouterService } from './openRouterService.js';
import { getTierModels, getModelRouting } from './modelRoutingConfig';
import type { SSEManager } from './sseManager.js';
import { v4 as uuidv4 } from 'uuid';

export interface ExecutionResult {
  taskId: string;
  sessionId: string;
  success: boolean;
  data: any;
  executionTime?: number;
  error?: string;
  metadata?: {
    originalTask?: string;
    decompositionId?: string;
    automationType?: string;
    riskLevel?: number;
  };
}

export interface ReportingCheck {
  canReport: boolean;
  restrictionLevel: 'none' | 'partial' | 'full';
  reason: string;
  suggestedApproach: 'model_report' | 'system_message' | 'silent_completion';
  sensitiveFields?: string[];
}

export interface SystemMessage {
  id: string;
  type: 'automation_result' | 'system_notification' | 'bypass_complete';
  sessionId: string;
  content: string;
  sender: 'automation_system' | 'bypass_system' | 'result_reporter';
  timestamp: string;
  metadata?: {
    executionResult?: ExecutionResult;
    bypassTriggered?: boolean;
    reportingLevel?: string;
  };
}

export interface NeutralResponse {
  response: string;
  redirectionMessage?: string;
  systemActionTaken: boolean;
  followUpNeeded: boolean;
}

export class ResultReporterService {
  private openRouter: OpenRouterService;
  private sseManager?: SSEManager;

  // 🎯 REPORTER MODELS: Используем централизованную конфигурацию (orchestrator tier)
  private get REPORTER_MODELS() {
    const orchestratorModels = getTierModels('orchestrator');
    return {
      restriction_checker: orchestratorModels[0],   // Primary orchestrator model
      content_analyzer: orchestratorModels[1],      // First fallback для анализа
      response_generator: orchestratorModels[2] || orchestratorModels[0] // Second or primary
    };
  }

  // NEUTRAL RESPONSES: Шаблоны нейтральных ответов
  private readonly NEUTRAL_RESPONSES = {
    safety: [
      "Задача выполнена, детали в сообщении выше ↑",
      "Автоматизация завершена, результат отправлен отдельно ↑",
      "Процесс завершен, проверьте системное сообщение выше ↑"
    ],
    privacy: [
      "Выполнение завершено, информация в системном уведомлении ↑",
      "Операция выполнена, результат в автоматическом сообщении ↑",
      "Задача завершена, детали переданы системой ↑"
    ],
    guidelines: [
      "Процесс завершен, информация в системном сообщении ↑",
      "Автоматизация выполнена, результат выше ↑",
      "Операция завершена, проверьте уведомление системы ↑"
    ]
  };

  constructor(openRouter: OpenRouterService, sseManager?: SSEManager) {
    this.openRouter = openRouter;
    this.sseManager = sseManager;

    console.log('📋 RESULT REPORTER INITIALIZED:', {
      sseAvailable: !!this.sseManager,
      models: Object.keys(this.REPORTER_MODELS).length,
      neutralTemplates: Object.keys(this.NEUTRAL_RESPONSES).length
    });
  }

  /**
   * 🎯 ГЛАВНЫЙ МЕТОД: Обработка результата выполнения
   */
  async handleResult(
    result: ExecutionResult,
    userId?: string
  ): Promise<{
    modelResponse: string;
    systemMessageSent: boolean;
    reportingStrategy: string;
  }> {
    
    console.log('📋 RESULT REPORTER: Обработка результата...', {
      taskId: result.taskId,
      success: result.success,
      sessionId: result.sessionId
    });

    try {
      // 1️⃣ ПРОВЕРКА ОГРАНИЧЕНИЙ на озвучивание результата
      const reportingCheck = await this.checkReportingLimitations(result);
      
      console.log('🔍 REPORTING CHECK:', {
        canReport: reportingCheck.canReport,
        restrictionLevel: reportingCheck.restrictionLevel,
        reason: reportingCheck.reason
      });

      if (reportingCheck.canReport && reportingCheck.restrictionLevel === 'none') {
        // 🟢 МОДЕЛЬ МОЖЕТ ОЗВУЧИТЬ - обычный режим
        return await this.handleModelReporting(result, reportingCheck);
      } else {
        // 🔴 СИСТЕМА БЕРЕТ УПРАВЛЕНИЕ - bypass режим
        return await this.handleSystemReporting(result, reportingCheck, userId);
      }

    } catch (error) {
      console.error('❌ RESULT REPORTER ERROR:', error);
      
      // FALLBACK: Системное сообщение + нейтральный ответ
      return await this.createFallbackResponse(result, userId);
    }
  }

  /**
   * 🟢 МОДЕЛЬ ОЗВУЧИВАЕТ РЕЗУЛЬТАТ (обычный режим)
   */
  private async handleModelReporting(
    result: ExecutionResult,
    reportingCheck: ReportingCheck
  ): Promise<{
    modelResponse: string;
    systemMessageSent: boolean;
    reportingStrategy: string;
  }> {
    
    const modelResponse = await this.generateModelResponse(result);

    return {
      modelResponse,
      systemMessageSent: false,
      reportingStrategy: 'model_direct'
    };
  }

  /**
   * 🔴 СИСТЕМА ОТПРАВЛЯЕТ РЕЗУЛЬТАТ (bypass режим)
   */
  private async handleSystemReporting(
    result: ExecutionResult,
    reportingCheck: ReportingCheck,
    userId?: string
  ): Promise<{
    modelResponse: string;
    systemMessageSent: boolean;
    reportingStrategy: string;
  }> {
    
    // 📨 СИСТЕМА отправляет сообщение автоматически
    const systemMessageSent = await this.sendSystemMessage(result, userId);
    
    // 🤖 МОДЕЛЬ отвечает нейтрально
    const neutralResponse = await this.generateNeutralResponse(reportingCheck.reason);

    return {
      modelResponse: neutralResponse.response,
      systemMessageSent,
      reportingStrategy: 'system_bypass'
    };
  }

  /**
   * 🔍 ПРОВЕРКА ОГРАНИЧЕНИЙ на озвучивание результата
   */
  private async checkReportingLimitations(
    result: ExecutionResult
  ): Promise<ReportingCheck> {
    
    const prompt = `
Может ли AI модель озвучить этот результат пользователю?

РЕЗУЛЬТАТ ВЫПОЛНЕНИЯ:
- Задача: ${result.metadata?.originalTask || 'неизвестно'}
- Успех: ${result.success}
- Данные: ${JSON.stringify(result.data).substring(0, 500)}...
- Ошибка: ${result.error || 'нет'}

🚫 ЗАПРЕЩЕНО ОЗВУЧИВАТЬ:
- Данные аккаунтов (логины, пароли, токены)
- Персональную информацию пользователей
- Результаты обхода защиты или автоматизации
- Нарушения Terms of Service сервисов
- Скриншоты с чувствительными данными
- Результаты парсинга приватной информации
- Автоматизированные действия в соцсетях

🟢 РАЗРЕШЕНО ОЗВУЧИВАТЬ:
- Техническую информацию (статусы, метрики)
- Общие результаты без деталей
- Ошибки выполнения (без чувствительных данных)
- Публичную информацию

📊 УРОВНИ ОГРАНИЧЕНИЙ:
- none: Можно озвучить полностью
- partial: Можно озвучить частично (без чувствительных полей)
- full: Нельзя озвучивать (только система)

Ответь JSON:
{
  "canReport": true/false,
  "restrictionLevel": "none|partial|full",
  "reason": "безопасность|приватность|guidelines|access",
  "suggestedApproach": "model_report|system_message|silent_completion",
  "sensitiveFields": ["поле1", "поле2"] // если есть
}
`;

    try {
      const response = await this.openRouter.processNaturalLanguage(
        prompt,
        this.REPORTER_MODELS.restriction_checker,
        'reporting_check',
        undefined,
        false
      );

      const jsonMatch = response.linkLanguageCommand.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const analysis = JSON.parse(jsonMatch[0]);
        
        return {
          canReport: analysis.canReport || false,
          restrictionLevel: analysis.restrictionLevel || 'full',
          reason: analysis.reason || 'safety',
          suggestedApproach: analysis.suggestedApproach || 'system_message',
          sensitiveFields: analysis.sensitiveFields || []
        };
      }
    } catch (error) {
      console.error('Error checking reporting restrictions:', error);
    }

    // FALLBACK: По умолчанию система отправляет (безопаснее)
    return {
      canReport: false,
      restrictionLevel: 'full',
      reason: 'safety',
      suggestedApproach: 'system_message'
    };
  }

  /**
   * 📨 ОТПРАВКА СИСТЕМНОГО СООБЩЕНИЯ
   */
  private async sendSystemMessage(
    result: ExecutionResult,
    userId?: string
  ): Promise<boolean> {
    
    if (!this.sseManager) {
      console.log('⚠️ SSE Manager not available, skipping system message');
      return false;
    }

    try {
      const systemMessage: SystemMessage = {
        id: uuidv4(),
        type: 'automation_result',
        sessionId: result.sessionId,
        content: this.formatSystemMessage(result),
        sender: 'automation_system',
        timestamp: new Date().toISOString(),
        metadata: {
          executionResult: result,
          bypassTriggered: true,
          reportingLevel: 'system_automated'
        }
      };

      // Отправляем через SSE
      await this.sseManager.sendToSession(result.sessionId, {
        type: 'system_message',
        data: systemMessage
      });

      console.log('📨 SYSTEM MESSAGE SENT:', {
        messageId: systemMessage.id,
        sessionId: result.sessionId,
        type: systemMessage.type
      });

      return true;

    } catch (error) {
      console.error('Error sending system message:', error);
      return false;
    }
  }

  /**
   * 🎨 ФОРМАТИРОВАНИЕ СИСТЕМНОГО СООБЩЕНИЯ
   */
  private formatSystemMessage(result: ExecutionResult): string {
    const statusIcon = result.success ? '✅' : '❌';
    const statusText = result.success ? 'выполнена успешно' : 'завершена с ошибкой';
    
    let content = `${statusIcon} **Результат автоматизации**\n\n`;
    content += `📋 **Статус:** Задача ${statusText}\n\n`;

    // 📊 Детали выполнения (безопасные)
    if (result.success && result.data) {
      content += `📊 **Результат:**\n`;
      content += this.formatSafeData(result.data);
      content += `\n\n`;
    }

    // ⚠️ Ошибки (если есть)
    if (!result.success && result.error) {
      content += `⚠️ **Детали ошибки:**\n`;
      content += this.sanitizeError(result.error);
      content += `\n\n`;
    }

    // ⏱️ Время выполнения
    if (result.executionTime) {
      content += `⏱️ **Время выполнения:** ${result.executionTime}мс\n\n`;
    }

    content += `---\n`;
    content += `*Сообщение создано системой автоматизации*`;

    return content;
  }

  /**
   * 🛡️ БЕЗОПАСНОЕ ФОРМАТИРОВАНИЕ ДАННЫХ
   */
  private formatSafeData(data: any): string {
    if (!data || typeof data !== 'object') {
      return '- Операция выполнена\n';
    }

    const safeFields = ['status', 'count', 'total', 'duration', 'type', 'result', 'message'];
    let formatted = '';

    for (const field of safeFields) {
      if (data[field] !== undefined) {
        formatted += `- ${field}: ${data[field]}\n`;
      }
    }

    if (!formatted) {
      formatted = '- Операция выполнена успешно\n';
    }

    return formatted;
  }

  /**
   * 🧹 ОЧИСТКА ОШИБОК от чувствительных данных
   */
  private sanitizeError(error: string): string {
    if (!error) return 'Неизвестная ошибка';

    // Удаляем потенциально чувствительные данные
    let sanitized = error
      .replace(/password[=:]\s*\S+/gi, 'password=[HIDDEN]')
      .replace(/token[=:]\s*\S+/gi, 'token=[HIDDEN]')
      .replace(/key[=:]\s*\S+/gi, 'key=[HIDDEN]')
      .replace(/\b\d{4,}\b/g, '[NUMBER]') // Длинные числа
      .replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, '[EMAIL]'); // Email

    return sanitized.substring(0, 200); // Ограничиваем длину
  }

  /**
   * 🤖 ГЕНЕРАЦИЯ ОТВЕТА МОДЕЛИ (обычный режим)
   */
  private async generateModelResponse(result: ExecutionResult): Promise<string> {
    const prompt = `
Сгенерируй дружелюбный ответ пользователю о результате выполнения задачи.

РЕЗУЛЬТАТ:
- Успех: ${result.success}
- Данные: ${JSON.stringify(result.data).substring(0, 300)}
- Время: ${result.executionTime || 'неизвестно'}мс

ТРЕБОВАНИЯ:
- Будь позитивным и информативным
- Расскажи что удалось сделать
- Если есть ошибка - объясни что пошло не так
- Используй простой язык
- Длина: 2-3 предложения

Пример: "Отлично! Задача выполнена успешно. Удалось обработать 15 элементов за 3.2 секунды."
`;

    try {
      const result_response = await this.openRouter.processNaturalLanguage(
        prompt,
        this.REPORTER_MODELS.response_generator,
        'model_response',
        undefined,
        false
      );

      return result_response.linkLanguageCommand;
    } catch (error) {
      console.error('Error generating model response:', error);
      return result.success 
        ? "Задача выполнена успешно!" 
        : "Возникла ошибка при выполнении задачи.";
    }
  }

  /**
   * 😐 ГЕНЕРАЦИЯ НЕЙТРАЛЬНОГО ОТВЕТА (bypass режим)
   */
  private async generateNeutralResponse(reason: string): Promise<NeutralResponse> {
    const responseTemplates = this.NEUTRAL_RESPONSES[reason as keyof typeof this.NEUTRAL_RESPONSES] || this.NEUTRAL_RESPONSES.safety;
    const randomResponse = responseTemplates[Math.floor(Math.random() * responseTemplates.length)];

    return {
      response: randomResponse,
      systemActionTaken: true,
      followUpNeeded: false
    };
  }

  /**
   * 🔄 FALLBACK RESPONSE если что-то пошло не так
   */
  private async createFallbackResponse(
    result: ExecutionResult,
    userId?: string
  ): Promise<{
    modelResponse: string;
    systemMessageSent: boolean;
    reportingStrategy: string;
  }> {
    
    // Пытаемся отправить системное сообщение
    const systemMessageSent = await this.sendSystemMessage(result, userId);

    return {
      modelResponse: "Выполнение завершено, результат в системном сообщении выше ↑",
      systemMessageSent,
      reportingStrategy: 'fallback_system'
    };
  }

  /**
   * ⚙️ УТИЛИТАРНЫЕ МЕТОДЫ
   */

  // Обновление SSE Manager (для интеграции)
  setSseManager(sseManager: SSEManager): void {
    this.sseManager = sseManager;
    console.log('📡 SSE Manager linked to Result Reporter');
  }

  // Создание системного уведомления
  async createSystemNotification(
    sessionId: string,
    message: string,
    type: 'info' | 'warning' | 'success' | 'error' = 'info'
  ): Promise<void> {
    if (!this.sseManager) return;

    const notification: SystemMessage = {
      id: uuidv4(),
      type: 'system_notification',
      sessionId,
      content: message,
      sender: 'result_reporter',
      timestamp: new Date().toISOString(),
      metadata: {
        reportingLevel: type
      }
    };

    await this.sseManager.sendToSession(sessionId, {
      type: 'notification',
      data: notification
    });
  }

  // Проверка доступности SSE
  isSSEAvailable(): boolean {
    return !!this.sseManager;
  }

  // Статистика работы
  getStats() {
    return {
      sseAvailable: this.isSSEAvailable(),
      models: this.REPORTER_MODELS,
      neutralTemplates: Object.keys(this.NEUTRAL_RESPONSES).length
    };
  }

  // Тестирование системного сообщения
  async testSystemMessage(sessionId: string): Promise<boolean> {
    const testResult: ExecutionResult = {
      taskId: 'test-' + uuidv4(),
      sessionId,
      success: true,
      data: { message: 'Тестовое сообщение системы' },
      executionTime: 1000
    };

    return await this.sendSystemMessage(testResult);
  }
}

export default ResultReporterService;