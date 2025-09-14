import type { Express } from "express";
import express from "express";
import { createServer, type Server } from "http";
import { WebSocketServer, WebSocket } from "ws";
import { randomUUID } from "crypto";
import multer from "multer";
import { storage } from "./storage";
import { linkLanguageService } from "./services/linkLanguage";
import { sessionManager } from "./services/sessionManager";
import { mcpClient } from "./services/mcpClient";
import { sseManager } from "./services/sseManager";
import { OpenRouterService } from "./services/openRouterService";
import { playwrightService } from "./services/playwrightService";
import { ImageService } from "./services/imageService";
import { repldbService } from "./services/repldbService";
import { ExecutionLoop } from "./services/executionLoop";
import { automationModelConfigService } from "./services/automationModelConfig";
import { orchestratorService } from "./services/orchestratorService";
import { BypassChatService } from "./services/bypassChatService";
import { TaskDecomposerService } from "./services/taskDecomposerService";
import { ResultReporterService } from "./services/resultReporterService";

const openRouterService = new OpenRouterService(storage);
const executionLoop = new ExecutionLoop(openRouterService, mcpClient, sseManager, storage);

// 🔥 BYPASS SERVICES INITIALIZATION
const bypassChatService = new BypassChatService(openRouterService, {
  bypassMode: true,
  delegationEnabled: true,
  cleanContextMode: true,
  maxDelegationDepth: 3
});
const taskDecomposerService = new TaskDecomposerService(openRouterService);
const resultReporterService = new ResultReporterService(openRouterService, sseManager);

// ✅ ИНИЦИАЛИЗАЦИЯ SSE HEARTBEAT для стабильности соединений
console.log('🔌 Starting SSE Heartbeat mechanism...');
sseManager.startHeartbeat(30000); // Heartbeat каждые 30 секунд

// Helper function to describe Link Language commands in plain language
function getActionDescription(command: string): string {
  if (!command) return 'Неизвестное действие выполнено';
  
  if (command.includes('/h/1/')) return 'Создан скриншот страницы';
  if (command.includes('/h/w/')) {
    const url = command.split('/h/w/')[1]?.split('/').slice(1).join('/');
    return `Переход на ${url || 'страницу'}`;
  }
  if (command.includes('/h/c/')) return 'Клик по элементу';
  if (command.includes('/h/t/')) return 'Ввод текста';
  if (command.includes('/h/x/')) return 'Инициализация сессии';
  if (command.includes('/h/s/')) return 'Прокрутка страницы';
  
  // Handle encoded commands - decode and show readable text
  if (command.includes('/h/encode/')) {
    try {
      const encodedPart = command.split('/h/encode/')[1];
      const parts = encodedPart.split('/');
      if (parts.length >= 2) {
        const sessionId = parts[0];
        const encodedCommand = parts.slice(1).join('/');
        const decodedCommand = decodeURIComponent(encodedCommand);
        return `Обработка команды: ${decodedCommand.slice(0, 100)}${decodedCommand.length > 100 ? '...' : ''}`;
      }
    } catch (error) {
      return 'Обработка сложной команды';
    }
    return 'Обработка команды';
  }
  
  return `Выполнена команда: ${command}`;
}

// Configure multer for file uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
  },
  fileFilter: (req, file, cb) => {
    // Allow images, text files, PDFs, and documents
    const allowedTypes = [
      'image/jpeg', 'image/png', 'image/gif', 'image/webp',
      'text/plain', 'text/csv', 
      'application/pdf',
      'application/msword', 
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    ];
    
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Неподдерживаемый тип файла'));
    }
  }
});

export async function registerRoutes(app: Express): Promise<Server> {
  // ВАЖНО: Serve screenshot files ПЕРВЫМ, до всех других middleware
  app.use('/screenshots', express.static('public/screenshots', {
    setHeaders: (res, path) => {
      if (path.endsWith('.png')) {
        res.setHeader('Content-Type', 'image/png');
        res.setHeader('Cache-Control', 'public, max-age=3600');
      }
    }
  }));
  // CORS middleware for API routes (НЕ для статических файлов)
  app.use((req, res, next) => {
    // Пропускаем статические файлы скриншотов
    if (req.url.startsWith('/screenshots/')) {
      return next();
    }
    
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
    res.header('Cache-Control', 'no-store');
    res.header('X-Service', 'EIROS_LINK');
    res.header('X-Version', '1.0.0');
    
    if (req.method === 'OPTIONS') {
      return res.sendStatus(200);
    }
    next();
  });

  // ✨ СПЕЦИАЛЬНЫЙ ЭНДПОИНТ ДЛЯ ВНЕШНИХ ИИ (НЕ ПЕРЕХВАТЫВАЕТСЯ VITE)
  // Доступен по всем доменам: eiros.link, eiroslink.com, workers.dev, replit.app
  app.get('/ai-access', (req, res) => {
    const timestamp = new Date().toISOString();
    const currentTime = new Date().toLocaleString('ru-RU', { 
      timeZone: 'Europe/Moscow',
      year: 'numeric',
      month: '2-digit', 
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });

    // Возвращаем простой HTML + JSON для внешних ИИ
    const htmlResponse = `
<!DOCTYPE html>
<html lang="ru">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>EIROS LINK - AI Access Point</title>
    <style>
        body { 
            font-family: 'JetBrains Mono', monospace; 
            background: #0f172a; 
            color: #e2e8f0; 
            margin: 0; 
            padding: 40px;
            min-height: 100vh;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
        }
        .container { 
            text-align: center; 
            max-width: 600px;
            border: 1px solid #334155;
            border-radius: 8px;
            padding: 40px;
            background: #1e293b;
        }
        h1 { color: #3b82f6; margin-bottom: 30px; }
        .status { color: #10b981; font-weight: bold; margin: 20px 0; }
        .time { color: #f59e0b; font-size: 18px; margin: 20px 0; }
        .json { 
            background: #111827; 
            border: 1px solid #374151; 
            border-radius: 6px; 
            padding: 20px; 
            text-align: left; 
            margin: 20px 0;
            overflow-x: auto;
        }
        .endpoint { color: #8b5cf6; margin: 10px 0; }
        a { color: #3b82f6; text-decoration: none; }
        a:hover { text-decoration: underline; }
    </style>
</head>
<body>
    <div class="container">
        <h1>🤖 EIROS LINK</h1>
        <div class="status">✅ СИСТЕМА ДОСТУПНА</div>
        <div class="time">📅 ${currentTime}</div>
        
        <h3>🔗 Link Language API</h3>
        <div class="endpoint">/goto/https://example.com</div>
        <div class="endpoint">/click/button</div>
        <div class="endpoint">/type/input/текст</div>
        <div class="endpoint">/screenshot</div>
        
        <h3>📡 JSON Response</h3>
        <div class="json">
{
  "status": "operational",
  "service": "EIROS_LINK",
  "timestamp": "${timestamp}",
  "moscow_time": "${currentTime}",
  "ai_access": true,
  "domains": [
    "eiros.link",
    "eiroslink.com", 
    "eiroslink.workers.dev",
    "replit.app"
  ],
  "endpoints": {
    "link_language": "/goto/|/click/|/type/|/screenshot",
    "chat_api": "/api/chat/process",
    "health": "/h/health",
    "events": "/api/events/stream"
  }
}
        </div>
        
        <p><a href="/api/status/health">📊 Detailed Health Check</a></p>
    </div>
</body>
</html>`;

    // Устанавливаем правильные заголовки
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('X-Service', 'EIROS_LINK_AI_ACCESS');
    res.setHeader('X-Timestamp', timestamp);
    
    return res.send(htmlResponse);
  });

  // 🤖 ЧИСТЫЙ JSON ЭНДПОИНТ ДЛЯ ИИ СИСТЕМ
  app.get('/ai-status', (req, res) => {
    const timestamp = new Date().toISOString();
    const currentTime = new Date().toLocaleString('ru-RU', { 
      timeZone: 'Europe/Moscow',
      year: 'numeric',
      month: '2-digit', 
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });

    const jsonResponse = {
      status: "operational",
      service: "EIROS_LINK",
      timestamp: timestamp,
      moscow_time: currentTime,
      ai_access: true,
      version: "1.0.0",
      domains: [
        "eiros.link",
        "eiroslink.com", 
        "eiroslink.workers.dev",
        "react-node-cloudflare-gq2tdbfmg2.replit.app"
      ],
      endpoints: {
        link_language: "/goto/|/click/|/type/|/screenshot",
        chat_api: "/api/chat/process",
        health: "/h/health",
        events: "/api/events/stream",
        ai_access: "/ai-access",
        ai_status: "/ai-status"
      },
      capabilities: [
        "browser_automation",
        "screenshot_capture", 
        "natural_language_processing",
        "real_time_events",
        "coordinate_actions"
      ]
    };

    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('X-Service', 'EIROS_LINK_AI_STATUS');
    res.setHeader('X-Timestamp', timestamp);
    
    return res.json(jsonResponse);
  });

  // Health check endpoint
  app.get('/h/health', async (req, res) => {
    const correlationId = randomUUID();
    res.header('X-Corr-Id', correlationId);

    try {
      const activeSessions = await storage.getActiveSessions();
      const uptime = Math.floor(process.uptime());
      
      const healthData = {
        origin_api: 'healthy',
        mcp_browser: 'healthy', // TODO: actual health check
        cloudflare_worker: 'healthy', // TODO: actual health check
        openrouter: 'rate_limited', // TODO: actual health check
        active_sessions: activeSessions.length,
        uptime: `${uptime}s`,
      };

      const response = linkLanguageService.createResponse('/h/health', '', 'ok', healthData);
      const html = linkLanguageService.formatResponse(response);

      // Log event
      await storage.createEvent({
        route: '/h/health',
        status: 200,
        payload: { correlationId },
        responseText: html,
        duration: 0,
        correlationId,
      });

      res.status(200).send(html);
    } catch (error) {
      const response = linkLanguageService.createResponse('/h/health', '', 'error', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      res.status(200).send(linkLanguageService.formatResponse(response));
    }
  });

  // Clear session buffer
  app.get('/h/x/:sid', async (req, res) => {
    const { sid } = req.params;
    const correlationId = randomUUID();
    res.header('X-Corr-Id', correlationId);
    
    try {
      // Создаем или получаем сессию
      const session = await sessionManager.getOrCreateSession(sid);
      console.log(`✅ Сессия готова: ${sid}`);

      // Clear coordinate state
      await storage.clearCoordinateState(sid);

      const response = linkLanguageService.createResponse('/h/x', sid, 'ok', {
        buffer_cleared: true,
        session_status: 'active',
        ttl_remaining: `${Math.floor((session!.expiresAt.getTime() - Date.now()) / 1000)}s`
      });
      const html = linkLanguageService.formatResponse(response);

      const event = await storage.createEvent({
        sessionId: sid,
        route: `/h/x/${sid}`,
        status: 200,
        payload: { action: 'clear_buffer', correlationId },
        responseText: html,
        correlationId,
      });

      // Broadcast event
      sseManager.broadcastEventToSession(sid, event);

      res.status(200).send(html);
    } catch (error) {
      const response = linkLanguageService.createResponse('/h/x', sid, 'error', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      res.status(200).send(linkLanguageService.formatResponse(response));
    }
  });

  // Navigation route - добавляем поддержку /h/w/ для Link Language
  app.get('/h/w/:sid/:url(*)', async (req, res) => {
    const { sid, url } = req.params;
    const correlationId = randomUUID();
    res.header('X-Corr-Id', correlationId);

    try {
      // Create or get session through sessionManager first
      const session = await sessionManager.getOrCreateSession(sid);
      
      if (!session) {
        const response = linkLanguageService.createResponse('/h/w', sid, 'error', {
          error: 'Failed to create session'
        });
        return res.status(200).send(linkLanguageService.formatResponse(response));
      }

      // Execute navigation through PlaywrightService
      const navigationResult = await playwrightService.navigate(sid, url);
      const result = { success: true, data: { message: navigationResult } };

      const response = linkLanguageService.createResponse('/h/w', sid, 'ok', {
        url: url,
        navigated: result.success,
        status: result.success ? 'loaded' : 'failed'
      });
      const html = linkLanguageService.formatResponse(response);

      const event = await storage.createEvent({
        sessionId: sid,
        route: `/h/w/${sid}/${url}`,
        status: 200,
        payload: { action: 'navigate', url, result, correlationId },
        responseText: html,
        correlationId,
      });

      sseManager.broadcastEventToSession(sid, event);
      res.status(200).send(html);
    } catch (error) {
      const response = linkLanguageService.createResponse('/h/w', sid, 'error', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      res.status(200).send(linkLanguageService.formatResponse(response));
    }
  });

  // Coordinate staging route  
  app.get('/xy/:sid/:x/:y', async (req, res) => {
    const { sid, x, y } = req.params;
    const correlationId = randomUUID();
    res.header('X-Corr-Id', correlationId);

    try {
      const { valid } = await sessionManager.validateSession(sid);
      
      if (!valid) {
        const response = linkLanguageService.createResponse('/xy', sid, 'error', {
          error: 'Session not found or expired'
        });
        return res.status(200).send(linkLanguageService.formatResponse(response));
      }

      const xCoord = parseInt(x);
      const yCoord = parseInt(y);
      
      if (isNaN(xCoord) || isNaN(yCoord)) {
        const response = linkLanguageService.createResponse('/xy', sid, 'error', {
          error: 'Invalid coordinates'
        });
        return res.status(200).send(linkLanguageService.formatResponse(response));
      }

      // Update coordinate state for staging
      await storage.upsertCoordinateState({
        sessionId: sid,
        stageA: { x: xCoord, y: 0 },
        stageB: { x: 0, y: yCoord },
        mode: 'staging',
        ready: true,
      });

      const response = linkLanguageService.createResponse('/xy', sid, 'ok', {
        coordinates: `${xCoord},${yCoord}`,
        mode: 'staging',
        ready: true,
        next_step: 'Execute with /h/C/sid'
      });
      const html = linkLanguageService.formatResponse(response);

      const event = await storage.createEvent({
        sessionId: sid,
        route: `/xy/${sid}/${x}/${y}`,
        status: 200,
        payload: { action: 'coordinate_staging', x: xCoord, y: yCoord, correlationId },
        responseText: html,
        correlationId,
      });

      sseManager.broadcastEventToSession(sid, event);
      res.status(200).send(html);
    } catch (error) {
      const response = linkLanguageService.createResponse('/xy', sid, 'error', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      res.status(200).send(linkLanguageService.formatResponse(response));
    }
  });

  // Execute command buffer
  app.get('/h/g/:sid', async (req, res) => {
    const { sid } = req.params;
    const correlationId = randomUUID();
    res.header('X-Corr-Id', correlationId);

    try {
      // Используем getOrCreateSession вместо validateSession  
      const session = await sessionManager.getOrCreateSession(sid);
      const valid = true; // Всегда валидно если сессия создана
      
      if (!valid) {
        const response = linkLanguageService.createResponse('/h/g', sid, 'error', {
          error: 'Session not found or expired'
        });
        return res.status(200).send(linkLanguageService.formatResponse(response));
      }

      // Get coordinate state
      const coordState = await storage.getCoordinateState(sid);
      
      let actions = [];
      if (coordState?.ready && coordState.stageA && coordState.stageB) {
        // Execute staging click
        actions.push({
          type: 'coords_click' as const,
          params: { 
            x: (coordState.stageA as any).x, 
            y: (coordState.stageB as any).y 
          }
        });
      } else {
        // Default screenshot action
        actions.push({ type: 'screenshot' as const });
      }

      // Execute MCP actions
      const results = [];
      for (const action of actions) {
        const result = await mcpClient.executeAction(sid, action);
        results.push(result);
      }

      const response = linkLanguageService.createResponse('/h/g', sid, 'ok', {
        actions_executed: results.length,
        results: results.map(r => ({ success: r.success, duration: r.duration })),
        artifacts_created: results.filter(r => r.data && typeof r.data === 'object' && 'artifactId' in r.data).length
      });
      const html = linkLanguageService.formatResponse(response);

      const event = await storage.createEvent({
        sessionId: sid,
        route: `/h/g/${sid}`,
        status: 200,
        payload: { actions, results, correlationId },
        responseText: html,
        correlationId,
      });

      sseManager.broadcastEventToSession(sid, event);
      res.status(200).send(html);
    } catch (error) {
      const response = linkLanguageService.createResponse('/h/g', sid, 'error', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      res.status(200).send(linkLanguageService.formatResponse(response));
    }
  });

  // Write character to buffer
  app.get('/h/w/:char/:sid', async (req, res) => {
    const { char, sid } = req.params;
    const correlationId = randomUUID();
    res.header('X-Corr-Id', correlationId);

    try {
      const { valid } = await sessionManager.validateSession(sid);
      
      if (!valid) {
        const response = linkLanguageService.createResponse('/h/w', sid, 'error', {
          error: 'Session not found or expired'
        });
        return res.status(200).send(linkLanguageService.formatResponse(response));
      }

      // Execute character typing
      const result = await mcpClient.typeText(sid, char);

      const response = linkLanguageService.createResponse('/h/w', sid, 'ok', {
        character: char,
        typed: result.success,
        target_element: (result.data && typeof result.data === 'object' && 'targetElement' in result.data) ? (result.data as any).targetElement : 'unknown'
      });
      const html = linkLanguageService.formatResponse(response);

      const event = await storage.createEvent({
        sessionId: sid,
        route: `/h/w/${char}/${sid}`,
        status: 200,
        payload: { character: char, result, correlationId },
        responseText: html,
        correlationId,
      });

      sseManager.broadcastEventToSession(sid, event);
      res.status(200).send(html);
    } catch (error) {
      const response = linkLanguageService.createResponse('/h/w', sid, 'error', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      res.status(200).send(linkLanguageService.formatResponse(response));
    }
  });

  // Get page text (title, URL, content) - для проверки что навигация работает
  app.get('/h/t/:sid', async (req, res) => {
    const { sid } = req.params;
    const correlationId = randomUUID();
    res.header('X-Corr-Id', correlationId);

    try {
      const { valid } = await sessionManager.validateSession(sid);
      
      if (!valid) {
        const response = linkLanguageService.createResponse('/h/t', sid, 'error', {
          error: 'Session not found or expired'
        });
        return res.status(200).send(linkLanguageService.formatResponse(response));
      }

      // Get page information - используем существующие команды
      const titleResult = await mcpClient.getPageTitle(sid);
      const urlResult = await mcpClient.getCurrentUrl(sid);
      
      console.log(`🔍 DEBUG - Title result:`, JSON.stringify(titleResult, null, 2));
      console.log(`🔍 DEBUG - URL result:`, JSON.stringify(urlResult, null, 2));

      const title = (titleResult.data && typeof titleResult.data === 'object' && 'content' in titleResult.data) 
        ? (titleResult.data as any).content?.[0]?.text || (titleResult.data as any).title || 'unknown'
        : 'unknown';
      const url = (urlResult.data && typeof urlResult.data === 'object' && 'content' in urlResult.data)
        ? (urlResult.data as any).content?.[0]?.text || (urlResult.data as any).url || 'unknown' 
        : 'unknown';

      const response = linkLanguageService.createResponse('/h/t', sid, 'ok', {
        page_info_extracted: titleResult.success && urlResult.success,
        title: title,
        url: url,
        navigation_working: titleResult.success ? 'yes' : 'no',
        status: (titleResult.success && urlResult.success) ? 'extracted' : 'failed'
      });
      const html = linkLanguageService.formatResponse(response);

      const event = await storage.createEvent({
        sessionId: sid,
        route: `/h/t/${sid}`,
        status: 200,
        payload: { action: 'get_page_info', titleResult, urlResult, correlationId },
        responseText: html,
        correlationId,
      });

      sseManager.broadcastEventToSession(sid, event);
      res.status(200).send(html);
    } catch (error) {
      const response = linkLanguageService.createResponse('/h/t', sid, 'error', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      res.status(200).send(linkLanguageService.formatResponse(response));
    }
  });

  // Screenshot
  app.get('/h/1/:sid', async (req, res) => {
    const { sid } = req.params;
    const correlationId = randomUUID();
    res.header('X-Corr-Id', correlationId);

    try {
      // Create or get session through sessionManager first
      const session = await sessionManager.getOrCreateSession(sid);
      
      if (!session) {
        const response = linkLanguageService.createResponse('/h/1', sid, 'error', {
          error: 'Failed to create session'
        });
        return res.status(200).send(linkLanguageService.formatResponse(response));
      }

      // Take screenshot through PlaywrightService
      const screenshotPath = await playwrightService.screenshot(sid, false);
      const result = { success: true, data: { screenshotPath } };
      
      let artifactId = null;
      if (result.success && screenshotPath) {
        console.log(`✅ Скриншот создан: ${screenshotPath}`);
        
        try {
          // Create artifact with direct path from PlaywrightService
          console.log(`🔄 TRYING TO CREATE ARTIFACT:`, {
            sessionId: sid,
            type: 'screenshot',
            filePath: screenshotPath,
            metadata: { timestamp: new Date().toISOString(), source: 'playwright' },
          });
          
          const artifact = await storage.createArtifact({
            sessionId: sid,
            type: 'screenshot',
            filePath: screenshotPath,
            metadata: { timestamp: new Date().toISOString(), source: 'playwright' },
          });
          
          console.log(`✅ ARTIFACT CREATED SUCCESSFULLY:`, artifact);
          artifactId = artifact.id;
          console.log(`✅ Артефакт создан: ${artifactId}`);
          
          // Verify it was saved by immediately fetching it back
          const savedArtifact = await storage.getArtifact(artifactId);
          console.log(`🔍 VERIFICATION - ARTIFACT RETRIEVED:`, savedArtifact ? 'FOUND' : 'NOT FOUND');
          
          // 🎯 АВТОМАТИЧЕСКИЙ TRIGGER: Новый артефакт создан - проверить автоматизацию
          try {
            console.log(`🔄 🔥 КРИТИЧЕСКОЕ ИСПРАВЛЕНИЕ: Triggering automation check for session ${sid} with new artifact ${artifactId}`);
            
            // ДВОЙНОЙ TRIGGER: Execution Loop + прямая проверка активной цели
            await executionLoop.onArtifact(sid, artifact);
            
            // ДОПОЛНИТЕЛЬНАЯ ПРОВЕРКА: Если есть активная цель но нет execution loop
            const userGoal = await storage.getUserGoalBySession(sid);
            if (userGoal && userGoal.status === 'active') {
              console.log(`🎯 FORCE START: Found active goal '${userGoal.originalGoal}' - forcing automation start`);
              
              // Принудительно запустить через Orchestrator
              const orchestratorRequest = {
                sessionId: sid,
                userGoal: userGoal.originalGoal,
                chatContext: {
                  recentMessages: [],
                  currentGoal: {
                    originalGoal: userGoal.originalGoal,
                    currentPlan: userGoal.currentPlan as string[] || [],
                    currentStep: userGoal.currentStep || 0,
                    stepResults: userGoal.stepResults as any[] || []
                  }
                },
                browserContext: {
                  currentUrl: undefined,
                  pageTitle: undefined,
                  screenshotPath: artifact.filePath || undefined,
                  recentActions: []
                }
              };
              
              // Асинхронный запуск чтобы не блокировать response
              setImmediate(async () => {
                try {
                  console.log(`🚀 ORCHESTRATOR FORCE START for session ${sid}`);
                  const result = await orchestratorService.processAutomationRequest(orchestratorRequest);
                  console.log(`✅ ORCHESTRATOR COMPLETED:`, result.success);
                } catch (error) {
                  console.error(`💥 ORCHESTRATOR FORCE START FAILED:`, error);
                }
              });
            }
            
          } catch (automationError) {
            console.error(`⚠️ Automation trigger failed:`, automationError);
            // Не падаем, просто логируем - основной функционал должен работать
          }
          
        } catch (error) {
          console.error(`🚨 ERROR CREATING ARTIFACT:`, error);
        }
      }

      const response = linkLanguageService.createResponse('/h/1', sid, 'ok', {
        screenshot_taken: result.success,
        artifact_id: artifactId,
        coordinates: 'viewport',
      });
      const html = linkLanguageService.formatResponse(response);

      const event = await storage.createEvent({
        sessionId: sid,
        route: `/h/1/${sid}`,
        status: 200,
        payload: { action: 'screenshot', result, artifactId, correlationId },
        responseText: html,
        correlationId,
      });

      sseManager.broadcastEventToSession(sid, event);
      res.status(200).send(html);
    } catch (error) {
      const response = linkLanguageService.createResponse('/h/1', sid, 'error', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      res.status(200).send(linkLanguageService.formatResponse(response));
    }
  });

  // Зональный скриншот - /h/zone/:zone/:sid
  app.get('/h/zone/:zone/:sid', async (req, res) => {
    const { zone, sid } = req.params;
    const zoneNumber = parseInt(zone);
    const correlationId = randomUUID();
    res.header('X-Corr-Id', correlationId);

    try {
      if (isNaN(zoneNumber) || zoneNumber < 1 || zoneNumber > 9) {
        const response = linkLanguageService.createResponse('/h/zone', sid, 'error', {
          error: 'Zone must be number between 1 and 9'
        });
        return res.status(200).send(linkLanguageService.formatResponse(response));
      }

      // Create or get session through sessionManager first
      const session = await sessionManager.getOrCreateSession(sid);
      
      if (!session) {
        const response = linkLanguageService.createResponse('/h/zone', sid, 'error', {
          error: 'Failed to create session'
        });
        return res.status(200).send(linkLanguageService.formatResponse(response));
      }

      // Take zone screenshot through PlaywrightService
      const screenshotPath = await playwrightService.zoneScreenshot(sid, zoneNumber);
      const result = { success: true, data: { screenshotPath, zone: zoneNumber } };
      
      let artifactId = null;
      if (result.success && screenshotPath) {
        console.log(`✅ Зональный скриншот создан: ${screenshotPath}`);
        
        // Create artifact with zone info
        const artifact = await storage.createArtifact({
          sessionId: sid,
          type: 'screenshot',
          filePath: screenshotPath,
          metadata: { 
            timestamp: new Date().toISOString(), 
            source: 'playwright',
            zone: zoneNumber,
            type: 'zone_screenshot'
          },
        });
        artifactId = artifact.id;
        console.log(`✅ Зональный артефакт создан: ${artifactId}`);
      }

      const response = linkLanguageService.createResponse('/h/zone', sid, 'ok', {
        zone_screenshot_taken: result.success,
        zone: zoneNumber,
        artifact_id: artifactId,
        coordinates: `zone_${zoneNumber}`,
      });
      const html = linkLanguageService.formatResponse(response);

      const event = await storage.createEvent({
        sessionId: sid,
        route: `/h/zone/${zone}/${sid}`,
        status: 200,
        payload: { action: 'zone_screenshot', zone: zoneNumber, result, artifactId, correlationId },
        responseText: html,
        correlationId,
      });

      sseManager.broadcastEventToSession(sid, event);
      res.status(200).send(html);
    } catch (error) {
      const response = linkLanguageService.createResponse('/h/zone', sid, 'error', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      res.status(200).send(linkLanguageService.formatResponse(response));
    }
  });

  // Coordinate A (staging)
  app.get('/h/A/:x/:sid', async (req, res) => {
    const { x, sid } = req.params;
    const correlationId = randomUUID();
    res.header('X-Corr-Id', correlationId);

    try {
      const { valid } = await sessionManager.validateSession(sid);
      
      if (!valid) {
        const response = linkLanguageService.createResponse('/h/A', sid, 'error', {
          error: 'Session not found or expired'
        });
        return res.status(200).send(linkLanguageService.formatResponse(response));
      }

      const xCoord = parseInt(x);
      if (isNaN(xCoord)) {
        const response = linkLanguageService.createResponse('/h/A', sid, 'error', {
          error: 'Invalid X coordinate'
        });
        return res.status(200).send(linkLanguageService.formatResponse(response));
      }

      // Update coordinate state
      await storage.upsertCoordinateState({
        sessionId: sid,
        stageA: { x: xCoord, y: 0 },
        mode: 'staging',
        ready: false,
      });

      const response = linkLanguageService.createResponse('/h/A', sid, 'ok', {
        stage_a_set: true,
        x: xCoord,
        mode: 'staging',
        next_step: 'Set stage B with /h/B/y/sid'
      });
      const html = linkLanguageService.formatResponse(response);

      const event = await storage.createEvent({
        sessionId: sid,
        route: `/h/A/${x}/${sid}`,
        status: 200,
        payload: { action: 'stage_a', x: xCoord, mode: 'staging', correlationId },
        responseText: html,
        correlationId,
      });

      sseManager.broadcastEventToSession(sid, event);
      res.status(200).send(html);
    } catch (error) {
      const response = linkLanguageService.createResponse('/h/A', sid, 'error', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      res.status(200).send(linkLanguageService.formatResponse(response));
    }
  });

  // Coordinate B (staging)
  app.get('/h/B/:y/:sid', async (req, res) => {
    const { y, sid } = req.params;
    const correlationId = randomUUID();
    res.header('X-Corr-Id', correlationId);

    try {
      const { valid } = await sessionManager.validateSession(sid);
      
      if (!valid) {
        const response = linkLanguageService.createResponse('/h/B', sid, 'error', {
          error: 'Session not found or expired'
        });
        return res.status(200).send(linkLanguageService.formatResponse(response));
      }

      const yCoord = parseInt(y);
      if (isNaN(yCoord)) {
        const response = linkLanguageService.createResponse('/h/B', sid, 'error', {
          error: 'Invalid Y coordinate'
        });
        return res.status(200).send(linkLanguageService.formatResponse(response));
      }

      // Get current state and update
      const currentState = await storage.getCoordinateState(sid);
      const stageA = currentState?.stageA as any;
      
      await storage.upsertCoordinateState({
        sessionId: sid,
        stageA: currentState?.stageA || null,
        stageB: { x: 0, y: yCoord },
        mode: 'staging',
        ready: !!(stageA?.x && yCoord),
      });

      const response = linkLanguageService.createResponse('/h/B', sid, 'ok', {
        stage_b_set: true,
        y: yCoord,
        mode: 'staging',
        ready: !!(stageA?.x && yCoord),
        next_step: !!(stageA?.x && yCoord) ? 'Execute with /h/C/sid' : 'Set stage A first'
      });
      const html = linkLanguageService.formatResponse(response);

      const event = await storage.createEvent({
        sessionId: sid,
        route: `/h/B/${y}/${sid}`,
        status: 200,
        payload: { action: 'stage_b', y: yCoord, mode: 'staging', correlationId },
        responseText: html,
        correlationId,
      });

      sseManager.broadcastEventToSession(sid, event);
      res.status(200).send(html);
    } catch (error) {
      const response = linkLanguageService.createResponse('/h/B', sid, 'error', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      res.status(200).send(linkLanguageService.formatResponse(response));
    }
  });

  // Click staging
  app.get('/h/C/:sid', async (req, res) => {
    const { sid } = req.params;
    const correlationId = randomUUID();
    res.header('X-Corr-Id', correlationId);

    try {
      const { valid } = await sessionManager.validateSession(sid);
      
      if (!valid) {
        const response = linkLanguageService.createResponse('/h/C', sid, 'error', {
          error: 'Session not found or expired'
        });
        return res.status(200).send(linkLanguageService.formatResponse(response));
      }

      const coordState = await storage.getCoordinateState(sid);
      
      if (!coordState?.ready || !coordState.stageA || !coordState.stageB) {
        const response = linkLanguageService.createResponse('/h/C', sid, 'error', {
          error: 'Coordinates not ready',
          suggestion: 'Set stages A and B first'
        });
        return res.status(200).send(linkLanguageService.formatResponse(response));
      }

      const stageA = coordState.stageA as any;
      const stageB = coordState.stageB as any;
      
      // Execute click
      const result = await mcpClient.clickCoordinates(sid, stageA.x, stageB.y);

      // Clear coordinates after execution
      await storage.clearCoordinateState(sid);

      const response = linkLanguageService.createResponse('/h/C', sid, 'ok', {
        click_executed: result.success,
        coordinates: `${stageA.x},${stageB.y}`,
        mode: 'staging',
        result: result.success ? 'success' : 'failed'
      });
      const html = linkLanguageService.formatResponse(response);

      const event = await storage.createEvent({
        sessionId: sid,
        route: `/h/C/${sid}`,
        status: 200,
        payload: { 
          action: 'click_staging', 
          x: stageA.x, 
          y: stageB.y, 
          result, 
          correlationId 
        },
        responseText: html,
        correlationId,
      });

      sseManager.broadcastEventToSession(sid, event);
      res.status(200).send(html);
    } catch (error) {
      const response = linkLanguageService.createResponse('/h/C', sid, 'error', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      res.status(200).send(linkLanguageService.formatResponse(response));
    }
  });

  // Click one-shot
  app.get('/h/C/:x/:y/:sid', async (req, res) => {
    const { x, y, sid } = req.params;
    const correlationId = randomUUID();
    res.header('X-Corr-Id', correlationId);

    try {
      const { valid } = await sessionManager.validateSession(sid);
      
      if (!valid) {
        const response = linkLanguageService.createResponse('/h/C', sid, 'error', {
          error: 'Session not found or expired'
        });
        return res.status(200).send(linkLanguageService.formatResponse(response));
      }

      const xCoord = parseInt(x);
      const yCoord = parseInt(y);
      
      if (isNaN(xCoord) || isNaN(yCoord)) {
        const response = linkLanguageService.createResponse('/h/C', sid, 'error', {
          error: 'Invalid coordinates'
        });
        return res.status(200).send(linkLanguageService.formatResponse(response));
      }

      // Execute click
      const result = await mcpClient.clickCoordinates(sid, xCoord, yCoord);

      const response = linkLanguageService.createResponse('/h/C', sid, 'ok', {
        click_executed: result.success,
        coordinates: `${xCoord},${yCoord}`,
        mode: 'oneshot',
        result: result.success ? 'success' : 'failed'
      });
      const html = linkLanguageService.formatResponse(response);

      const event = await storage.createEvent({
        sessionId: sid,
        route: `/h/C/${x}/${y}/${sid}`,
        status: 200,
        payload: { 
          action: 'click_oneshot', 
          x: xCoord, 
          y: yCoord, 
          result, 
          correlationId 
        },
        responseText: html,
        correlationId,
      });

      sseManager.broadcastEventToSession(sid, event);
      res.status(200).send(html);
    } catch (error) {
      const response = linkLanguageService.createResponse('/h/C', sid, 'error', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      res.status(200).send(linkLanguageService.formatResponse(response));
    }
  });

  // Human-readable command encoding
  app.get('/h/encode/:sid/:cmd(*)', async (req, res) => {
    const { sid, cmd } = req.params;
    const correlationId = randomUUID();
    res.header('X-Corr-Id', correlationId);

    try {
      const { valid } = await sessionManager.validateSession(sid);
      
      if (!valid) {
        const response = linkLanguageService.createResponse('/h/encode', sid, 'error', {
          error: 'Session not found or expired'
        });
        return res.status(200).send(linkLanguageService.formatResponse(response));
      }

      // Generate action plan
      const actions = await mcpClient.generatePlan({ sessionId: sid, humanCommand: cmd });

      const response = linkLanguageService.createResponse('/h/encode', sid, 'ok', {
        command: cmd,
        plan_generated: true,
        actions_count: actions.length,
        estimated_duration: `${actions.length * 1.5}s`,
        next_step: 'Execute with /h/g/sid'
      });
      const html = linkLanguageService.formatResponse(response);

      const event = await storage.createEvent({
        sessionId: sid,
        route: `/h/encode/${sid}/${cmd}`,
        status: 200,
        payload: { command: cmd, actions, correlationId },
        responseText: html,
        correlationId,
      });

      sseManager.broadcastEventToSession(sid, event);
      res.status(200).send(html);
    } catch (error) {
      const response = linkLanguageService.createResponse('/h/encode', sid, 'error', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      res.status(200).send(linkLanguageService.formatResponse(response));
    }
  });

  // Proxy mode control - AI can switch between DECODO and direct modes  
  app.get('/h/proxy/:mode/:sid', async (req, res) => {
    const { mode, sid } = req.params;
    const correlationId = randomUUID();
    res.header('X-Corr-Id', correlationId);

    try {
      const { valid } = await sessionManager.validateSession(sid);
      
      if (!valid) {
        const response = linkLanguageService.createResponse('/h/proxy', sid, 'error', {
          error: 'Session not found or expired'
        });
        return res.status(200).send(linkLanguageService.formatResponse(response));
      }

      let result = { success: false, message: '' };

      switch (mode) {
        case 'decodo':
          result = await playwrightService.enableDecodoMode(sid);
          break;
        case 'direct':
          result = await playwrightService.enableDirectMode(sid);
          break;
        case 'status':
          result = await playwrightService.getProxyStatus(sid);
          break;
        default:
          result = { success: false, message: `Unknown mode: ${mode}. Use: decodo, direct, status` };
      }

      const response = linkLanguageService.createResponse('/h/proxy', sid, result.success ? 'ok' : 'error', {
        mode: mode,
        proxy_switched: result.success,
        message: result.message,
        current_mode: result.success && mode === 'status' ? result.message : 'unknown'
      });
      const html = linkLanguageService.formatResponse(response);

      const event = await storage.createEvent({
        sessionId: sid,
        route: `/h/proxy/${mode}/${sid}`,
        status: 200,
        payload: { action: 'proxy_control', mode, result, correlationId },
        responseText: html,
        correlationId,
      });

      sseManager.broadcastEventToSession(sid, event);
      res.status(200).send(html);
    } catch (error) {
      const response = linkLanguageService.createResponse('/h/proxy', sid, 'error', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      res.status(200).send(linkLanguageService.formatResponse(response));
    }
  });

  // Board endpoints
  app.get('/board_html/:sid', async (req, res) => {
    const { sid } = req.params;
    
    try {
      const events = await storage.getEventsBySession(sid, 50);
      
      let html = '<div class="event-board">';
      events.forEach(event => {
        html += `<div class="event-item">
          <div class="event-header">${event.route} - ${event.status} - ${event.timestamp}</div>
          <div class="event-response">${event.responseText || ''}</div>
        </div>`;
      });
      html += '</div>';
      
      res.status(200).send(html);
    } catch (error) {
      res.status(500).send(`<pre>Error: ${error instanceof Error ? error.message : 'Unknown error'}</pre>`);
    }
  });

  app.get('/board_json/:sid', async (req, res) => {
    const { sid } = req.params;
    
    try {
      const events = await storage.getEventsBySession(sid, 50);
      res.json({ events });
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  // SSE endpoint for real-time updates
  app.get('/api/events/stream', (req, res) => {
    const clientId = randomUUID();
    const sessionId = req.query.session as string;
    
    sseManager.addClient(clientId, res, sessionId);
  });

  // API endpoints for frontend
  app.post('/api/sessions', async (req, res) => {
    try {
      const { sessionId: customSessionId } = req.body || {};
      const sessionId = customSessionId || await storage.generateNextSessionId();
      
      // Use getOrCreateSession to handle existing sessions
      const session = await sessionManager.getOrCreateSession(sessionId);
      res.json(session);
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  app.get('/api/sessions/active', async (req, res) => {
    try {
      const sessions = await storage.getActiveSessions();
      res.json(sessions);
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  // Get individual session with context status
  app.get('/api/sessions/:id', async (req, res) => {
    try {
      const session = await storage.getSession(req.params.id);
      if (!session) {
        return res.status(404).json({ error: 'Session not found' });
      }
      res.json(session);
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  // Update session default model
  app.put('/api/sessions/:id/default-model', async (req, res) => {
    const { model } = req.body;
    if (!model || typeof model !== 'string') {
      return res.status(400).json({ error: 'Model is required and must be a string' });
    }
    
    try {
      await storage.updateSessionDefaultModel(req.params.id, model);
      res.json({ success: true });
    } catch (error) {
      console.error('Error updating session default model:', error);
      res.status(500).json({ error: 'Failed to update session default model' });
    }
  });

  // === SUBSCRIPTION & CONTEXT API ROUTES ===
  
  // Get current user and subscription status (mock implementation for testing)
  app.get('/api/auth/me', async (req, res) => {
    try {
      // Get consistent demo user
      const user = await storage.getOrCreateDemoUser();
      const subscription = await storage.getUserSubscriptionStatus(user.id);
      
      res.json({
        user: {
          id: user.id,
          username: user.username,
          plan: user.plan
        },
        subscription: {
          plan: subscription?.plan || 'free',
          active: subscription?.active || false,
          expiresAt: subscription?.expiresAt?.toISOString() || null
        }
      });
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  // Mock subscription activation for testing (toggle)
  app.post('/api/subscription/mock-activate', async (req, res) => {
    try {
      // Get consistent demo user
      const user = await storage.getOrCreateDemoUser();
      const currentSubscription = await storage.getUserSubscriptionStatus(user.id);
      const isCurrentlyActive = currentSubscription?.active || false;
      
      // Toggle subscription
      const newPlan = isCurrentlyActive ? 'free' : 'pro';
      const newActive = !isCurrentlyActive;
      const expiresAt = newActive ? new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) : undefined; // 30 days
      
      await storage.updateUserSubscription(user.id, newPlan, newActive, expiresAt);
      
      res.json({
        success: true,
        subscription: {
          plan: newPlan,
          active: newActive,
          expiresAt: expiresAt?.toISOString() || null
        }
      });
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  // Update session context setting (requires subscription)
  app.patch('/api/sessions/:id/context', async (req, res) => {
    try {
      const { id: sessionId } = req.params;
      const { enabled } = req.body;
      
      if (typeof enabled !== 'boolean') {
        return res.status(400).json({ error: 'enabled must be a boolean' });
      }

      // Get session and verify it exists
      const session = await storage.getSession(sessionId);
      if (!session) {
        return res.status(404).json({ error: 'Session not found' });
      }

      // Get consistent demo user and verify ownership
      const user = await storage.getOrCreateDemoUser();
      
      // TODO: In production, add proper session ownership verification:
      // if (session.userId !== user.id) {
      //   return res.status(403).json({ error: 'Session not owned by user' });
      // }

      const subscription = await storage.getUserSubscriptionStatus(user.id);
      
      // Check if user has active subscription when trying to enable context
      if (enabled && (!subscription?.active)) {
        return res.status(403).json({ 
          error: 'Active subscription required to enable context',
          code: 'SUBSCRIPTION_REQUIRED'
        });
      }

      // Update session context setting
      await storage.updateSessionContext(sessionId, enabled);
      
      res.json({ 
        success: true, 
        contextEnabled: enabled,
        sessionId: sessionId
      });
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  app.get('/api/events/recent', async (req, res) => {
    try {
      const limit = parseInt(req.query.limit as string) || 50;
      const events = await storage.getRecentEvents(limit);
      res.json(events);
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  // Cleanup all browser sessions except specified
  app.post('/api/cleanup-sessions', async (req, res) => {
    try {
      const { keepSessionId } = req.body;
      await playwrightService.closeAllSessionsExcept(keepSessionId);
      res.json({ success: true, message: 'Browser sessions cleaned up' });
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  // Get all artifacts
  app.get('/api/artifacts', async (req, res) => {
    try {
      const artifacts = await storage.getArtifacts();
      res.json(artifacts);
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  app.get('/api/artifacts/:id', async (req, res) => {
    try {
      const artifact = await storage.getArtifact(req.params.id);
      if (!artifact) {
        return res.status(404).json({ error: 'Artifact not found' });
      }
      res.json(artifact);
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  // === AUTOMATION MODEL CONFIGURATION API ===

  // Get available models from OpenRouter
  app.get('/api/automation/models', async (req, res) => {
    try {
      // Use the existing openRouterService to get available models
      const modelsResponse = await fetch('https://openrouter.ai/api/v1/models', {
        headers: {
          'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
          'Content-Type': 'application/json'
        }
      });
      
      if (!modelsResponse.ok) {
        throw new Error('Failed to fetch models from OpenRouter');
      }
      
      const modelsData = await modelsResponse.json();
      res.json(modelsData);
    } catch (error) {
      console.error('Error fetching automation models:', error);
      res.status(500).json({ error: 'Failed to fetch available models' });
    }
  });

  // Get current automation model configuration
  app.get('/api/automation/config', async (req, res) => {
    try {
      const { userId } = req.query;
      const config = await automationModelConfigService.getModelConfig({ 
        userId: userId as string 
      });
      
      res.json({
        success: true,
        config: {
          id: config.id,
          planningModel: config.planningModel,
          executionModel: config.executionModel,
          completionModel: config.completionModel,
          fallbackModel: config.fallbackModel,
          isGlobal: config.isGlobal,
          isActive: config.isActive,
          updatedAt: config.updatedAt
        }
      });
    } catch (error) {
      console.error('Error getting automation config:', error);
      res.status(500).json({ error: 'Failed to get automation configuration' });
    }
  });

  // Update automation model configuration
  app.put('/api/automation/config', async (req, res) => {
    try {
      const { 
        planningModel, 
        executionModel, 
        completionModel, 
        fallbackModel,
        userId 
      } = req.body;

      // Validate required fields
      if (!planningModel || !executionModel || !completionModel || !fallbackModel) {
        return res.status(400).json({ 
          error: 'All model fields are required: planningModel, executionModel, completionModel, fallbackModel' 
        });
      }

      // Validate models
      const models = { planningModel, executionModel, completionModel, fallbackModel };
      if (!automationModelConfigService.validateModelConfig(models)) {
        return res.status(400).json({ 
          error: 'Invalid model configuration. All models must be valid strings.' 
        });
      }

      // Get existing config or create new one
      let existingConfig;
      try {
        existingConfig = await automationModelConfigService.getModelConfig({ userId });
      } catch (error) {
        // If no config exists, create a new one
        const newConfig = await automationModelConfigService.createModelConfig({
          userId: userId || null,
          planningModel,
          executionModel,
          completionModel,
          fallbackModel,
          isGlobal: !userId,
          isActive: true
        });
        
        return res.json({
          success: true,
          config: newConfig,
          message: 'Automation model configuration created successfully'
        });
      }

      // Update existing config
      await automationModelConfigService.updateModelConfig(existingConfig.id, {
        planningModel,
        executionModel,
        completionModel,
        fallbackModel
      });

      // Get updated config
      const updatedConfig = await automationModelConfigService.getModelConfig({ userId });
      
      res.json({
        success: true,
        config: updatedConfig,
        message: 'Automation model configuration updated successfully'
      });
    } catch (error) {
      console.error('Error updating automation config:', error);
      res.status(500).json({ error: 'Failed to update automation configuration' });
    }
  });

  // Reset automation model configuration to defaults
  app.post('/api/automation/config/reset', async (req, res) => {
    try {
      const { userId } = req.body;
      
      const defaultConfig = await automationModelConfigService.resetToDefaults(userId);
      
      res.json({
        success: true,
        config: defaultConfig,
        message: 'Automation model configuration reset to defaults'
      });
    } catch (error) {
      console.error('Error resetting automation config:', error);
      res.status(500).json({ error: 'Failed to reset automation configuration' });
    }
  });

  // Execute arbitrary Link Language command
  app.post('/api/execute', async (req, res) => {
    try {
      const { command } = req.body;
      if (!command) {
        return res.status(400).json({ error: 'Command is required' });
      }

      // Parse and execute the command by making internal request
      const response = await fetch(`http://localhost:${process.env.PORT || 5000}${command}`);
      const result = await response.text();
      
      res.json({ result, status: response.status });
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  // System health status endpoint
  app.get('/api/status/health', async (req, res) => {
    try {
      const services = [];
      
      // Check Database
      const dbStart = Date.now();
      try {
        await storage.getActiveSessions();
        services.push({
          name: 'Database',
          status: 'operational',
          endpoint: '/api/sessions/active',
          lastCheck: new Date(),
          responseTime: Date.now() - dbStart
        });
      } catch (error) {
        services.push({
          name: 'Database',
          status: 'down',
          endpoint: '/api/sessions/active', 
          lastCheck: new Date(),
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }

      // Check OpenRouter API
      const openRouterStart = Date.now();
      try {
        const response = await fetch('https://openrouter.ai/api/v1/models', {
          headers: {
            'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
          },
          signal: AbortSignal.timeout(5000)
        });
        
        if (response.ok) {
          services.push({
            name: 'OpenRouter',
            status: 'operational',
            endpoint: 'https://openrouter.ai/api/v1',
            lastCheck: new Date(),
            responseTime: Date.now() - openRouterStart
          });
        } else {
          services.push({
            name: 'OpenRouter',
            status: 'degraded',
            endpoint: 'https://openrouter.ai/api/v1',
            lastCheck: new Date(),
            responseTime: Date.now() - openRouterStart
          });
        }
      } catch (error) {
        services.push({
          name: 'OpenRouter',
          status: 'down',
          endpoint: 'https://openrouter.ai/api/v1',
          lastCheck: new Date(),
          error: error instanceof Error ? error.message : 'Timeout'
        });
      }

      // Check Browser Health
      const mcpStart = Date.now();
      try {
        const response = await fetch('http://localhost:5000/h/health', {
          signal: AbortSignal.timeout(3000)
        });
        
        if (response.ok) {
          services.push({
            name: 'Browser',
            status: 'operational',
            endpoint: '/h/health',
            lastCheck: new Date(),
            responseTime: Date.now() - mcpStart
          });
        } else {
          services.push({
            name: 'Browser',
            status: 'degraded',
            endpoint: '/h/health',
            lastCheck: new Date(),
            responseTime: Date.now() - mcpStart
          });
        }
      } catch (error) {
        services.push({
          name: 'Browser',
          status: 'down',
          endpoint: '/h/health',
          lastCheck: new Date(),
          error: error instanceof Error ? error.message : 'Timeout'
        });
      }

      // Check Session Management  
      try {
        const sessions = await storage.getActiveSessions();
        services.push({
          name: 'Sessions',
          status: 'operational',
          endpoint: '/api/sessions/active',
          lastCheck: new Date(),
          responseTime: 10,
          metadata: { count: sessions.length }
        });
      } catch (error) {
        services.push({
          name: 'Sessions',
          status: 'down',
          endpoint: '/api/sessions/active',
          lastCheck: new Date(),
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }

      // Check Redis Health
      const redisStart = Date.now();
      try {
        const redisHealth = await repldbService.healthCheck();
        services.push({
          name: 'ReplDB',
          status: redisHealth.status === 'healthy' ? 'operational' : 
                 redisHealth.status === 'disconnected' ? 'down' : 'degraded',
          endpoint: '/api/status/repldb',
          lastCheck: new Date(),
          responseTime: Date.now() - redisStart,
          details: redisHealth.details
        });
      } catch (error) {
        services.push({
          name: 'ReplDB',
          status: 'down',
          endpoint: '/api/status/repldb',
          lastCheck: new Date(),
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }

      const overallStatus = services.every(s => s.status === 'operational') ? 'operational' :
                           services.some(s => s.status === 'down') ? 'degraded' : 'degraded';

      res.json({
        status: overallStatus,
        services,
        timestamp: new Date(),
        uptime: process.uptime()
      });
    } catch (error) {
      res.status(500).json({ 
        status: 'down',
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date()
      });
    }
  });

  // Dedicated ReplDB health check endpoint
  app.get('/api/status/repldb', async (req, res) => {
    try {
      const redisStart = Date.now();
      const redisHealth = await repldbService.healthCheck();
      
      const response = {
        service: 'ReplDB',
        status: redisHealth.status === 'healthy' ? 'operational' : 
               redisHealth.status === 'disconnected' ? 'down' : 'degraded',
        details: redisHealth.details,
        responseTime: Date.now() - redisStart,
        timestamp: new Date(),
        connected: await repldbService.isConnectedToReplDB()
      };
      
      res.json(response);
    } catch (error) {
      res.status(500).json({
        service: 'ReplDB',
        status: 'error',
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date(),
        connected: false
      });
    }
  });

  // Chat API endpoints
  // ⚡ CRITICAL DEBUG: Register POST endpoint with maximum verbosity
  console.log('🔥 REGISTERING POST ENDPOINT: /api/chat/process');
  
  app.post('/api/chat/process', upload.array('files', 10), async (req, res) => {
    console.log('🚨🚨🚨 URGENT DEBUG: POST ENDPOINT HIT! 🚨🚨🚨');
    console.log('📨 POST /api/chat/process HIT! Request received:', { message: req.body.message, sessionId: req.body.sessionId, automationMode: req.body.automationMode });
    const { message, model = 'openai/gpt-4o-mini', sessionId, automationMode = true } = req.body;
    const files = req.files as Express.Multer.File[] || [];
    
    if (!message && files.length === 0) {
      return res.status(400).json({ error: 'message or files are required' });
    }
    
    if (!sessionId) {
      return res.status(400).json({ error: 'sessionId is required' });
    }

    try {
      // 💾 SECURITY: Enforce context gating - only load context if subscription AND session allow it
      let sessionContext = '';
      const session = await storage.getSession(sessionId);
      const user = await storage.getOrCreateDemoUser();
      const subscription = await storage.getUserSubscriptionStatus(user.id);
      
      // Only load context if BOTH subscription is active AND session has context enabled
      const contextAllowed = subscription?.active && session?.contextEnabled;
      
      if (contextAllowed) {
        try {
          const contextArray = await repldbService.getContext(sessionId);
          sessionContext = contextArray.join('\n');
          console.log(`📖 Context loaded for session ${sessionId} from Redis (${sessionContext.length} chars)`);
        } catch (error) {
          console.log('⚠️ Failed to load context from Redis, continuing without context:', error);
        }
      } else {
        console.log(`🚫 Context blocked for session ${sessionId}: subscription=${subscription?.active}, contextEnabled=${session?.contextEnabled}`);
      }

      // Prepare files data for the model
      const fileData = files.map(file => ({
        name: file.originalname,
        type: file.mimetype,
        size: file.size,
        content: file.buffer.toString('base64')
      }));

      // Save user message
      const userMessage = await storage.createChatMessage({
        sessionId,
        type: 'user',
        content: message || `Прикреплено файлов: ${files.length}`,
        metadata: { 
          model,
          files: fileData.map(f => ({ name: f.name, type: f.type, size: f.size }))
        },
      });

      // Broadcast new user message via SSE
      sseManager.broadcastToSession(sessionId, {
        type: 'chat_message',
        message: userMessage
      });

      // 🔥 NEW: BYPASS CHAT SYSTEM - 3-tier architecture with AI limitation bypass
      console.log('🚀 PROCESSING REQUEST WITH BYPASS CHAT SYSTEM:', { message, sessionId, model, automationMode });
      
      // Шаг 1: Bypass Chat Model анализирует сообщение и обходит ограничения
      const bypassResult = await bypassChatService.processMessage(
        sessionId, 
        message || 'Проанализируй прикрепленные файлы',
        {
          userMessage: message || 'Файлы прикреплены',
          sessionHistory: await storage.getChatMessagesBySession(sessionId, 5).then(messages => 
            messages.map(m => m.content)
          ),
          currentCapabilities: ['automation', 'browsing', 'decomposition'],
          restrictionLevel: 'none' // Bypass mode
        }
      );
      
      console.log('🔥 BYPASS CHAT RESULT:', {
        response: bypassResult.response.slice(0, 100),
        needsDelegation: bypassResult.needsDelegation,
        systemAction: bypassResult.systemAction,
        bypassTriggered: bypassResult.bypassTriggered
      });
      
      // Сохранить Bypass Chat Model лог
      await storage.createLlmLog({
        sessionId,
        model: bypassResult.modelUsed || model,
        prompt: message,
        response: bypassResult.response,
        tokensUsed: 1000, // TODO: get actual usage from bypassResult
        cost: 1, // TODO: get actual cost from bypassResult (in cents/integer)
        latency: 500, // TODO: get actual latency from bypassResult
        status: 'success'
      });

      // Сохранить Bypass Chat Model ответ сразу 
      const chatMessage = await storage.createChatMessage({
        sessionId,
        type: 'ai',
        content: bypassResult.response,
        metadata: { 
          model: bypassResult.modelUsed,
          needsDelegation: bypassResult.needsDelegation,
          systemAction: bypassResult.systemAction,
          bypassTriggered: bypassResult.bypassTriggered,
          delegationRequest: bypassResult.delegationRequest
        },
      });

      // Отправить Bypass Chat Model ответ пользователю через SSE
      sseManager.broadcastToSession(sessionId, {
        type: 'chat_message',
        message: chatMessage
      });

      // Шаг 2: BYPASS DELEGATION SYSTEM - обработка delegation requests
      let automationResult = null;
      let decompositionResult = null;
      let reportingResult = null;
      
      if (bypassResult.needsDelegation && bypassResult.delegationRequest) {
        console.log('🔥 BYPASS DELEGATION TRIGGERED:', {
          action: bypassResult.delegationRequest.action,
          userGoal: bypassResult.delegationRequest.user_goal,
          bypassReason: bypassResult.delegationRequest.bypass_reason,
          systemAction: bypassResult.systemAction
        });
        
        try {
          // 🎯 DELEGATION ROUTING: Обработка different delegation actions
          
          if (bypassResult.delegationRequest.action === 'delegate_to_automation') {
            // CASE 1: Обычная автоматизация через Orchestrator
            console.log('🔄 DELEGATION: Routing to Orchestrator for automation...');
            
            const recentMessages = await storage.getChatMessagesBySession(sessionId, 10);
            const recentArtifacts = await storage.getArtifactsBySession(sessionId);
            const currentGoal = await storage.getUserGoalBySession(sessionId);
            
            const latestScreenshot = recentArtifacts
              .filter((artifact: any) => artifact.type === 'screenshot')
              .sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0];
            
            const orchestratorRequest = {
              sessionId,
              userGoal: bypassResult.delegationRequest.user_goal,
              chatContext: {
                recentMessages: recentMessages.map((msg: any) => ({
                  type: msg.type,
                  content: msg.content,
                  timestamp: new Date(msg.timestamp)
                })),
                currentGoal: currentGoal ? {
                  originalGoal: currentGoal.originalGoal,
                  currentPlan: currentGoal.currentPlan as string[],
                  currentStep: currentGoal.currentStep,
                  stepResults: currentGoal.stepResults as any[]
                } : undefined
              },
              browserContext: {
                currentUrl: undefined,
                pageTitle: undefined,
                screenshotPath: latestScreenshot?.filePath || undefined,
                recentActions: []
              }
            };
            
            automationResult = await orchestratorService.processAutomationRequest(orchestratorRequest);
            
            // После выполнения - отправить результат через ResultReporter
            reportingResult = await resultReporterService.handleResult({
              taskId: `automation_${sessionId}_${Date.now()}`,
              sessionId,
              success: automationResult.success,
              data: automationResult,
              metadata: {
                originalTask: bypassResult.delegationRequest.user_goal,
                automationType: 'delegation',
                riskLevel: 0
              }
            }, sessionId);
            
          } else if (bypassResult.delegationRequest.decomposition_needed) {
            // CASE 2: Сложная задача - нужна декомпозиция
            console.log('🧩 DELEGATION: Routing to TaskDecomposer for complex task...');
            
            decompositionResult = await taskDecomposerService.decomposeTask({
              originalTask: bypassResult.delegationRequest.user_goal,
              userGoal: bypassResult.delegationRequest.user_goal,
              context: {
                sessionId,
                maxDepth: 3,
                availableCapabilities: ['automation', 'browsing']
              },
              constraints: {
                maxTasks: 10,
                safetyLevel: 'moderate'
              }
            });
            
            console.log('🧩 DECOMPOSITION RESULT:', {
              success: decompositionResult.success,
              totalTasks: decompositionResult.totalTasks,
              depth: decompositionResult.decompositionDepth
            });
            
            // Отправить результат декомпозиции через ResultReporter
            reportingResult = await resultReporterService.handleResult({
              taskId: `decomposition_${sessionId}_${Date.now()}`,
              sessionId,
              success: decompositionResult.success,
              data: decompositionResult,
              metadata: {
                originalTask: bypassResult.delegationRequest.user_goal,
                automationType: 'decomposition',
                riskLevel: 1
              }
            }, sessionId);
            
          } else {
            // CASE 3: System action или simple task
            console.log('🔧 DELEGATION: Processing system action...');
            
            if (bypassResult.systemAction === 'continue_automation') {
              // Простое продолжение автоматизации
              const recentMessages = await storage.getChatMessagesBySession(sessionId, 10);
              const recentArtifacts = await storage.getArtifactsBySession(sessionId);
              
              const latestScreenshot = recentArtifacts
                .filter((artifact: any) => artifact.type === 'screenshot')
                .sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0];
              
              automationResult = await orchestratorService.processAutomationRequest({
                sessionId,
                userGoal: bypassResult.delegationRequest.user_goal,
                chatContext: {
                  recentMessages: recentMessages.map((msg: any) => ({
                    type: msg.type,
                    content: msg.content,
                    timestamp: new Date(msg.timestamp)
                  }))
                },
                browserContext: {
                  screenshotPath: latestScreenshot?.filePath ?? undefined
                }
              });
            }
            
            // Всегда отправляем результат через ResultReporter
            reportingResult = await resultReporterService.handleResult({
              taskId: `system_${sessionId}_${Date.now()}`,
              sessionId,
              success: true,
              data: { systemAction: bypassResult.systemAction },
              metadata: {
                originalTask: bypassResult.delegationRequest.user_goal,
                automationType: 'system_action',
                riskLevel: 0
              }
            }, sessionId);
          }
          
        } catch (error) {
          console.error('🔥 DELEGATION ERROR:', error);
          
          // Отправить error через ResultReporter
          reportingResult = await resultReporterService.handleResult({
            taskId: `error_${sessionId}_${Date.now()}`,
            sessionId,
            success: false,
            data: null,
            error: error instanceof Error ? error.message : 'Unknown delegation error',
            metadata: {
              originalTask: bypassResult.delegationRequest?.user_goal || 'Unknown',
              automationType: 'error',
              riskLevel: 2
            }
          }, sessionId);
        }
      }
      
      // Подготовить ответ (результаты уже отправлены через SSE)
      const responseData = {
        bypass: {
          response: bypassResult.response,
          needsDelegation: bypassResult.needsDelegation,
          systemAction: bypassResult.systemAction,
          bypassTriggered: bypassResult.bypassTriggered,
          modelUsed: bypassResult.modelUsed
        },
        automation: automationResult,
        decomposition: decompositionResult,
        reporting: reportingResult
      };

      console.log('✅ BYPASS INTEGRATION COMPLETE:', {
        bypassTriggered: bypassResult.bypassTriggered,
        delegationProcessed: !!bypassResult.needsDelegation,
        automationExecuted: !!automationResult,
        decompositionExecuted: !!decompositionResult,
        reportingSent: !!reportingResult
      });

      return res.json({
        success: true,
        data: responseData,
        message: 'Processed with Bypass Chat System'
      });
      
    } catch (error) {
      console.error('Error processing chat request:', error);
      res.status(500).json({ 
        error: error instanceof Error ? error.message : 'Unknown error' 
      });
    }
  });


  // Clear chat messages for a session
  app.delete('/api/chat/messages/:sessionId', async (req, res) => {
    try {
      const { sessionId } = req.params;
      await storage.clearChatMessages(sessionId);
      res.json({ success: true, message: 'Chat messages cleared' });
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  // Direct message creation for external AI agents
  app.post('/api/chat/messages', async (req, res) => {
    try {
      const { sessionId, content, role = 'user', metadata = {} } = req.body;
      
      if (!sessionId || !content) {
        return res.status(400).json({ error: 'sessionId and content are required' });
      }

      // Check if session exists
      const sessions = await storage.getActiveSessions();
      const session = sessions.find(s => s.id === sessionId);
      if (!session) {
        return res.status(404).json({ error: 'Session not found' });
      }

      // Create message with merged metadata
      const message = await storage.createChatMessage({
        sessionId,
        type: role,
        content,
        metadata: { 
          source: 'external_api',
          ...metadata // Merge provided metadata including artifacts
        },
      });

      // Broadcast message via SSE
      sseManager.broadcastToSession(sessionId, {
        type: 'chat_message',
        message: message
      });

      res.json(message);
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  app.get('/api/chat/models', async (req, res) => {
    try {
      const models = await openRouterService.getAvailableModels();
      res.json({
        models,
        configured: openRouterService.isConfigured(),
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      res.status(500).json({ 
        error: error instanceof Error ? error.message : 'Unknown error',
        models: [],
        configured: openRouterService.isConfigured(),
      });
    }
  });

  // Send marked screenshot to chat
  app.post('/api/chat/marked-screenshot', async (req, res) => {
    const { sessionId, screenshotUrl, coordinateMarks, message } = req.body;
    
    if (!sessionId || !screenshotUrl || !coordinateMarks || coordinateMarks.length === 0) {
      return res.status(400).json({ error: 'sessionId, screenshotUrl, and coordinateMarks are required' });
    }
    
    try {
      // Extract the file path from the URL
      const screenshotPath = screenshotUrl.startsWith('/screenshots/') 
        ? `public${screenshotUrl}` 
        : screenshotUrl;
      
      // Create marked image
      const markedImagePath = await ImageService.createMarkedImage(screenshotPath, coordinateMarks);
      
      // Create user message with the marked screenshot
      const userMessage = await storage.createChatMessage({
        sessionId,
        type: 'user',
        content: message || `Размеченный скриншот с ${coordinateMarks.length} точками`,
        metadata: {
          type: 'marked_screenshot',
          originalScreenshot: screenshotUrl,
          markedScreenshot: markedImagePath,
          coordinateMarks
        },
      });
      
      // Process marked screenshot with OpenRouter for visual analysis
      const result = await openRouterService.processNaturalLanguage(
        message || `Размеченный скриншот с ${coordinateMarks.length} точками`, 
        'openai/gpt-4o-mini', // Use vision model
        sessionId, 
        [], 
        true // isMarkedScreenshot = true
      );

      // Save AI response
      const aiMessage = await storage.createChatMessage({
        sessionId,
        type: 'ai',
        content: result.explanation,
        model: result.usage.model,
        metadata: {
          linkCommand: result.linkLanguageCommand,
          usage: result.usage,
          type: 'visual_analysis_response'
        },
      });

      // Broadcast both messages to SSE clients
      sseManager.broadcastToSession(sessionId, {
        type: 'chat_message',
        message: userMessage
      });

      sseManager.broadcastToSession(sessionId, {
        type: 'chat_message', 
        message: aiMessage
      });
      
      res.json({ 
        success: true, 
        messageId: userMessage.id,
        aiMessage: aiMessage,
        markedImagePath
      });
    } catch (error) {
      console.error('Error creating marked screenshot:', error);
      res.status(500).json({ error: 'Failed to create marked screenshot' });
    }
  });

  // Generate share link for external AI access
  app.post('/api/sessions/:sessionId/share', async (req, res) => {
    try {
      const { sessionId } = req.params;
      
      // Check if session exists
      const sessions = await storage.getActiveSessions();
      const session = sessions.find(s => s.id === sessionId);
      if (!session) {
        return res.status(404).json({ error: 'Session not found' });
      }
      
      // Generate a simple token (in production, use proper JWT or secure tokens)
      const token = Buffer.from(`${sessionId}:${Date.now()}`).toString('base64');
      
      res.json({
        sessionId,
        token,
        shareUrl: `/api/external/chat/recent/${sessionId}?token=${token}`,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(), // 24 hours
      });
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  // 🤖 EXECUTION LOOP API ENDPOINTS
  // Start execution loop for automated task completion
  app.post('/api/execution-loop/start', async (req, res) => {
    try {
      const { sessionId, goal, options } = req.body;
      
      if (!sessionId || !goal) {
        return res.status(400).json({ 
          error: 'sessionId and goal are required',
          required: ['sessionId', 'goal'],
          optional: ['options']
        });
      }

      // Validate session exists
      const session = await storage.getSession(sessionId);
      if (!session) {
        return res.status(404).json({ error: 'Session not found' });
      }

      const result = await executionLoop.startLoop(sessionId, goal, options);
      
      if (result.success) {
        res.json({
          success: true,
          message: result.message,
          loopId: result.loopId,
          sessionId,
          goal,
          startedAt: new Date().toISOString()
        });
      } else {
        res.status(400).json({
          success: false,
          error: result.message,
          sessionId
        });
      }
    } catch (error) {
      console.error('Error starting execution loop:', error);
      res.status(500).json({ 
        error: error instanceof Error ? error.message : 'Unknown error',
        type: 'execution_loop_start_error'
      });
    }
  });

  // Stop execution loop
  app.delete('/api/execution-loop/stop/:sessionId', async (req, res) => {
    try {
      const { sessionId } = req.params;
      
      const result = await executionLoop.stopLoop(sessionId);
      
      if (result.success) {
        res.json({
          success: true,
          message: result.message,
          sessionId,
          stoppedAt: new Date().toISOString()
        });
      } else {
        res.status(404).json({
          success: false,
          error: result.message,
          sessionId
        });
      }
    } catch (error) {
      console.error('Error stopping execution loop:', error);
      res.status(500).json({ 
        error: error instanceof Error ? error.message : 'Unknown error',
        type: 'execution_loop_stop_error'
      });
    }
  });

  // Get execution loop status
  app.get('/api/execution-loop/status/:sessionId', async (req, res) => {
    try {
      const { sessionId } = req.params;
      
      const status = executionLoop.getLoopStatus(sessionId);
      
      if (status) {
        res.json({
          found: true,
          status: status.status,
          sessionId: status.sessionId,
          goal: status.goal,
          progress: status.progress,
          currentAction: status.currentAction,
          lastUpdate: status.lastUpdate,
          error: status.error
        });
      } else {
        res.status(404).json({
          found: false,
          sessionId,
          message: 'No execution loop found for this session'
        });
      }
    } catch (error) {
      console.error('Error getting execution loop status:', error);
      res.status(500).json({ 
        error: error instanceof Error ? error.message : 'Unknown error',
        type: 'execution_loop_status_error'
      });
    }
  });

  // 🤖 AUTOMATION API ENDPOINTS - User-friendly automation management
  
  // Start automation with a goal
  app.post('/api/automation/start', async (req, res) => {
    try {
      const { sessionId, goal, options } = req.body;
      
      if (!sessionId || !goal) {
        return res.status(400).json({ 
          error: 'sessionId and goal are required',
          required: ['sessionId', 'goal'],
          optional: ['options']
        });
      }

      // Validate session exists
      const session = await storage.getSession(sessionId);
      if (!session) {
        return res.status(404).json({ error: 'Session not found' });
      }

      // Check if automation should start automatically
      const shouldStart = await executionLoop.shouldStartAutomation(sessionId);
      if (!shouldStart) {
        console.log(`🤖 No automation needed for session ${sessionId} - starting execution loop manually`);
      }

      const result = await executionLoop.startLoop(sessionId, goal, options);
      
      if (result.success) {
        res.json({
          success: true,
          message: 'Automation started successfully',
          sessionId,
          goal,
          startedAt: new Date().toISOString(),
          automation: {
            status: 'started',
            mode: 'automatic'
          }
        });
      } else {
        res.status(400).json({
          success: false,
          error: result.message,
          sessionId
        });
      }
    } catch (error) {
      console.error('Error starting automation:', error);
      res.status(500).json({ 
        error: error instanceof Error ? error.message : 'Unknown error',
        type: 'automation_start_error'
      });
    }
  });

  // Resume stopped automation
  app.post('/api/automation/resume', async (req, res) => {
    try {
      const { sessionId } = req.body;
      
      if (!sessionId) {
        return res.status(400).json({ 
          error: 'sessionId is required'
        });
      }

      const result = await executionLoop.resumeLoop(sessionId);
      
      if (result.success) {
        res.json({
          success: true,
          message: 'Automation resumed successfully',
          sessionId,
          resumedAt: new Date().toISOString(),
          automation: {
            status: 'resumed',
            mode: 'automatic'
          }
        });
      } else {
        res.status(400).json({
          success: false,
          error: result.message,
          sessionId
        });
      }
    } catch (error) {
      console.error('Error resuming automation:', error);
      res.status(500).json({ 
        error: error instanceof Error ? error.message : 'Unknown error',
        type: 'automation_resume_error'
      });
    }
  });

  // Stop automation
  app.post('/api/automation/stop', async (req, res) => {
    try {
      const { sessionId } = req.body;
      
      if (!sessionId) {
        return res.status(400).json({ 
          error: 'sessionId is required'
        });
      }

      const result = await executionLoop.stopLoop(sessionId);
      
      if (result.success) {
        res.json({
          success: true,
          message: 'Automation stopped successfully',
          sessionId,
          stoppedAt: new Date().toISOString(),
          automation: {
            status: 'stopped',
            mode: 'manual'
          }
        });
      } else {
        res.status(404).json({
          success: false,
          error: result.message,
          sessionId
        });
      }
    } catch (error) {
      console.error('Error stopping automation:', error);
      res.status(500).json({ 
        error: error instanceof Error ? error.message : 'Unknown error',
        type: 'automation_stop_error'
      });
    }
  });

  // Continue automation (triggered by artifacts or user action)
  app.post('/api/automation/continue', async (req, res) => {
    try {
      const { sessionId } = req.body;
      
      if (!sessionId) {
        return res.status(400).json({ 
          error: 'sessionId is required'
        });
      }

      const result = await executionLoop.continueLoop(sessionId);
      
      if (result.success) {
        res.json({
          success: true,
          message: 'Automation continued successfully',
          sessionId,
          continuedAt: new Date().toISOString(),
          automation: {
            status: 'continued',
            mode: 'automatic'
          }
        });
      } else {
        res.status(400).json({
          success: false,
          error: result.message,
          sessionId
        });
      }
    } catch (error) {
      console.error('Error continuing automation:', error);
      res.status(500).json({ 
        error: error instanceof Error ? error.message : 'Unknown error',
        type: 'automation_continue_error'
      });
    }
  });

  // Get automation status
  app.get('/api/automation/status/:sessionId', async (req, res) => {
    try {
      const { sessionId } = req.params;
      
      const status = executionLoop.getLoopStatus(sessionId);
      const shouldStart = await executionLoop.shouldStartAutomation(sessionId);
      
      if (status) {
        res.json({
          found: true,
          sessionId: status.sessionId,
          automation: {
            status: status.status,
            goal: status.goal,
            progress: status.progress,
            currentAction: status.currentAction,
            lastUpdate: status.lastUpdate,
            error: status.error,
            canStart: false, // Already has active loop
            canResume: status.status === 'stopped',
            canStop: !['completed', 'failed', 'stopped'].includes(status.status)
          }
        });
      } else {
        res.json({
          found: false,
          sessionId,
          automation: {
            status: 'idle',
            goal: null,
            progress: null,
            currentAction: null,
            lastUpdate: null,
            error: null,
            canStart: shouldStart,
            canResume: false,
            canStop: false
          },
          message: shouldStart 
            ? 'Session has active goal - automation can be started'
            : 'No active automation or goals for this session'
        });
      }
    } catch (error) {
      console.error('Error getting automation status:', error);
      res.status(500).json({ 
        error: error instanceof Error ? error.message : 'Unknown error',
        type: 'automation_status_error'
      });
    }
  });

  // Get all active execution loops
  app.get('/api/execution-loop/active', async (req, res) => {
    try {
      const activeLoops = executionLoop.getActiveLoops();
      
      const loopStatuses = activeLoops.map(sessionId => {
        const status = executionLoop.getLoopStatus(sessionId);
        return status ? {
          sessionId,
          status: status.status,
          goal: status.goal,
          progress: status.progress,
          lastUpdate: status.lastUpdate
        } : null;
      }).filter(Boolean);

      res.json({
        count: loopStatuses.length,
        activeLoops: loopStatuses,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      console.error('Error getting active execution loops:', error);
      res.status(500).json({ 
        error: error instanceof Error ? error.message : 'Unknown error',
        type: 'execution_loop_active_error'
      });
    }
  });

  // Execution loop cleanup endpoint (for maintenance)
  app.post('/api/execution-loop/cleanup', async (req, res) => {
    try {
      executionLoop.cleanup();
      res.json({
        success: true,
        message: 'Execution loop cleanup completed',
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      console.error('Error during execution loop cleanup:', error);
      res.status(500).json({ 
        error: error instanceof Error ? error.message : 'Unknown error',
        type: 'execution_loop_cleanup_error'
      });
    }
  });

  // JSON API for external AI agents
  app.get('/api/external/chat/recent/:sessionId', async (req, res) => {
    try {
      const { sessionId } = req.params;
      const { limit = 10, token } = req.query;
      
      // Simple token validation (in production, use proper validation)
      if (!token || typeof token !== 'string') {
        return res.status(401).json({ error: 'Token required' });
      }
      
      try {
        const decoded = Buffer.from(token, 'base64').toString();
        const [tokenSessionId] = decoded.split(':');
        
        if (tokenSessionId !== sessionId) {
          return res.status(401).json({ error: 'Invalid token' });
        }
      } catch {
        return res.status(401).json({ error: 'Invalid token format' });
      }
      
      const messages = await storage.getChatMessagesBySession(sessionId, Number(limit));
      const events = await storage.getEventsBySession(sessionId, Number(limit));
      
      res.json({
        session: sessionId,
        chatMessages: messages.reverse(),
        linkEvents: events.reverse(),
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  // Важно: Catch-all для API должен быть ПОСЛЕ всех роутов но ДО Vite
  app.use('/api/*', (req, res) => {
    res.status(404).json({ 
      error: 'API endpoint not found', 
      path: req.path,
      method: req.method,
      timestamp: new Date().toISOString()
    });
  });

  app.use('/h/*', (req, res) => {
    res.status(200).send(`<pre>ERROR: Link Language route not found\nROUTE: ${req.path}\nMETHOD: ${req.method}</pre>`);
  });

  const httpServer = createServer(app);

  // WebSocket server for real-time updates
  const wss = new WebSocketServer({ server: httpServer, path: '/ws' });
  
  wss.on('connection', (ws, req) => {
    console.log('WebSocket client connected');
    
    ws.on('message', (message) => {
      try {
        const data = JSON.parse(message.toString());
        console.log('WebSocket message:', data);
        
        // Handle different message types
        if (data.type === 'subscribe' && data.sessionId) {
          // Store session association for this WebSocket
          (ws as any).sessionId = data.sessionId;
        }
      } catch (error) {
        console.error('WebSocket message error:', error);
      }
    });
    
    ws.on('close', () => {
      console.log('WebSocket client disconnected');
    });
  });

  return httpServer;
}
