import { getModelRouting, modelRoutingManager, type ModelRouting, type TierModelConfig } from './modelRoutingConfig';

// Check if AI should analyze recent screenshots for task continuation
function shouldAnalyzeRecentScreenshots(userMessage: string, sessionId?: string, storage?: any): boolean {
  // Always analyze screenshots for commands that start with "/"
  if (userMessage.startsWith('/')) {
    return true;
  }
  
  // Analyze when user gives continuation commands
  const message = userMessage.toLowerCase();
  const hasContinuationKeywords = message.includes('продолжай') || message.includes('continue') || 
         message.includes('далее') || message.includes('next');
  
  if (hasContinuationKeywords) {
    return true;
  }

  // 🎯 АВТОМАТИЧЕСКИЙ АНАЛИЗ: Если есть sessionId - всегда анализируем скриншоты для контекста
  if (sessionId) {
    return true; // Включаем анализ для всех сообщений когда есть активная сессия
  }

  // Анализ для сообщений связанных с автоматизацией и задачами
  const automationKeywords = [
    'создай', 'сделай', 'перейди', 'нажми', 'заполни', 'найди', 'открой',
    'create', 'make', 'go', 'click', 'fill', 'find', 'open',
    'автоматизация', 'automation', 'задача', 'task', 'цель', 'goal'
  ];
  
  const hasAutomationKeywords = automationKeywords.some(keyword => 
    message.includes(keyword.toLowerCase())
  );

  return hasAutomationKeywords;
}

interface OpenRouterMessage {
  role: 'system' | 'user' | 'assistant';
  content: string | Array<{
    type: 'text' | 'image_url';
    text?: string;
    image_url?: {
      url: string;
      detail?: 'low' | 'high' | 'auto';
    };
  }>;
}

interface OpenRouterResponse {
  choices: {
    message: {
      content: string;
      role: string;
    };
  }[];
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
  model: string;
}

interface LLMUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  model: string;
  latency: number;
  cost?: number;
  attemptsCount?: number;
  fallbackUsed?: boolean;
  actualModel?: string;
}

interface ModelAttemptResult {
  success: boolean;
  response?: OpenRouterResponse;
  error?: string;
  model: string;
  attemptNumber: number;
}

interface ChatCompletionResult {
  response: OpenRouterResponse;
  model: string;
  attempts: number;
  errors: string[];
}

export class OpenRouterService {
  private apiKey: string;
  private baseUrl = 'https://openrouter.ai/api/v1';
  private storage: any; // Will be set by dependency injection

  constructor(storage?: any) {
    this.apiKey = process.env.OPENROUTER_API_KEY || '';
    this.storage = storage;
    if (!this.apiKey) {
      console.warn('OPENROUTER_API_KEY not found in environment variables');
    }
  }

  /**
   * 🔄 MODEL ROUTING: Get models array from tier name or direct models array
   */
  private getModelsFromTierOrArray(modelOrTier: string | string[]): string[] {
    if (Array.isArray(modelOrTier)) {
      return modelOrTier;
    }

    // Check if it's a tier name
    if (modelOrTier === 'chat' || modelOrTier === 'orchestrator' || modelOrTier === 'executor') {
      const routing = getModelRouting(modelOrTier as keyof TierModelConfig);
      return [routing.primary, ...routing.fallbacks];
    }

    // It's a single model name
    return [modelOrTier];
  }

  /**
   * 🔄 MODEL ROUTING: Create chat completion with fallback mechanism
   */
  private async createChatCompletionWithFallback(
    messages: OpenRouterMessage[],
    models: string[],
    options: {
      max_tokens?: number;
      temperature?: number;
      timeout?: number;
    } = {}
  ): Promise<ChatCompletionResult> {
    const errors: string[] = [];
    const timeout = options.timeout || 30000;

    for (let i = 0; i < models.length; i++) {
      const model = models[i];
      
      console.log(`🔄 MODEL ROUTING: Attempt ${i + 1}/${models.length} with model: ${model}`);
      
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeout);

        const requestBody = {
          model,
          messages,
          max_tokens: options.max_tokens || 500,
          temperature: options.temperature || 0.1,
        };

        const response = await fetch(`${this.baseUrl}/chat/completions`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json',
            'HTTP-Referer': 'https://eiros.link',
            'X-Title': 'EIROS Link Language Bot'
          },
          body: JSON.stringify(requestBody),
          signal: controller.signal
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
          const errorText = await response.text();
          const error = `Model ${model} failed: ${response.status} ${response.statusText} - ${errorText}`;
          console.warn(`⚠️ MODEL ROUTING: ${error}`);
          errors.push(error);
          continue;
        }

        const data: OpenRouterResponse = await response.json();
        
        console.log(`✅ MODEL ROUTING: Success with model ${model} on attempt ${i + 1}`);
        
        return {
          response: data,
          model: data.model || model,
          attempts: i + 1,
          errors
        };

      } catch (error) {
        const errorMsg = `Model ${model} error: ${error instanceof Error ? error.message : String(error)}`;
        console.warn(`⚠️ MODEL ROUTING: ${errorMsg}`);
        errors.push(errorMsg);
        
        // If this is the last model, throw the error
        if (i === models.length - 1) {
          console.error(`❌ MODEL ROUTING: All models failed. Errors:`, errors);
          throw new Error(`All models failed. Last error: ${errorMsg}`);
        }
      }
    }

    throw new Error(`All ${models.length} models failed`);
  }

  /**
   * 🔄 MODEL ROUTING: Enhanced API call with model routing support
   */
  private async callOpenRouterWithRouting(
    userPrompt: string,
    systemPrompt: string,
    modelOrTier: string | string[],
    sessionId: string,
    files?: Array<{name: string; type: string; size: number; content: string}>
  ): Promise<{content: string; usage?: any; model: string; attempts: number; fallbackUsed: boolean}> {
    const models = this.getModelsFromTierOrArray(modelOrTier);
    
    const messages: any[] = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt }
    ];

    // Add files if provided
    if (files && files.length > 0) {
      const fileContent = files.map(f => 
        `Файл: ${f.name} (${f.type}, ${f.size} байт)\nСодержимое: ${f.content.slice(0, 1000)}...`
      ).join('\n\n');
      
      messages[1].content += `\n\nПРИКРЕПЛЕННЫЕ ФАЙЛЫ:\n${fileContent}`;
    }

    const result = await this.createChatCompletionWithFallback(messages, models, {
      temperature: 0.7,
      max_tokens: 1000
    });

    if (!result.response.choices?.[0]?.message?.content) {
      throw new Error('Invalid response from OpenRouter API');
    }

    return {
      content: result.response.choices[0].message.content,
      usage: result.response.usage,
      model: result.model,
      attempts: result.attempts,
      fallbackUsed: result.attempts > 1
    };
  }

  async processNaturalLanguage(
    userMessage: string,
    modelOrTier: string | string[] = 'chat',
    sessionId: string,
    files?: Array<{name: string; type: string; size: number; content: string}>,
    isMarkedScreenshot: boolean = false
  ): Promise<{ linkLanguageCommand: string; linkLanguageCommands?: string[]; explanation: string; usage: LLMUsage; analyzedScreenshot?: string }> {
    console.log('🚀 STARTING processNaturalLanguage:', {
      sessionId,
      userMessage: userMessage.slice(0, 100),
      modelOrTier: Array.isArray(modelOrTier) ? `[${modelOrTier.join(', ')}]` : modelOrTier
    });
    
    const startTime = Date.now();

    // Add session context for better continuity
    let sessionContext = '';
    try {
      // Only fetch context if storage is available
      if (!this.storage) {
        throw new Error('Storage not available');
      }
      
      // Get ALL chat messages and artifacts from this session
      const allMessages = await this.storage.getChatMessagesBySession(sessionId, 50);  // Increased limit
      const recentArtifacts = await this.storage.getArtifactsBySession(sessionId);
      
      // Get the latest screenshot info for context
      const latestScreenshot = recentArtifacts
        .filter((artifact: any) => artifact.type === 'screenshot')
        .sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0];
      
      if (latestScreenshot) {
        sessionContext += `\n\nLATEST SCREENSHOT: ${latestScreenshot.filePath} (${new Date(latestScreenshot.createdAt).toLocaleTimeString()})`;
      }
      
      // 🎯 ПОЛУЧАЕМ ТЕКУЩУЮ ЦЕЛЬ - РЕШАЕТ ПРОБЛЕМУ ПОТЕРИ ЛОГИКИ AI
      let goalContext = '';
      try {
        const currentGoal = await this.storage.getUserGoalBySession(sessionId);
        
        if (currentGoal) {
          // У нас есть активная цель - добавляем её в контекст
          const plan = currentGoal.currentPlan as string[] || [];
          const currentStepIndex = currentGoal.currentStep || 0;
          const totalSteps = plan.length;
          const stepResults = currentGoal.stepResults as any[] || [];
          
          goalContext = `\n\n🎯 АКТИВНАЯ ЦЕЛЬ ПОЛЬЗОВАТЕЛЯ (НЕ ЗАБЫВАЙ!):
ИСХОДНАЯ ЗАДАЧА: ${currentGoal.originalGoal}
ПЛАН ДЕЙСТВИЙ: ${plan.map((step, i) => `${i + 1}. ${step}`).join(', ')}
ТЕКУЩИЙ ШАГ: ${currentStepIndex + 1}/${totalSteps} - "${plan[currentStepIndex] || 'завершение'}"
СТАТУС: ${currentGoal.status}
РЕЗУЛЬТАТЫ ПРЕДЫДУЩИХ ШАГОВ: ${stepResults.slice(0, 3).map((result, i) => `Шаг ${i + 1}: ${JSON.stringify(result)?.slice(0, 100)}`).join('; ')}

⚠️ КРИТИЧНО: При анализе скриншота учитывай ИСХОДНУЮ ЗАДАЧУ и ПЛАН! 
Не принимай решения только на основе того, что видишь - помни куда идешь!`;
        } else if (allMessages.filter((m: any) => m.type === 'user').length <= 1) {
          // Первое сообщение пользователя - создаем цель
          try {
            const firstUserMessage = allMessages.find((m: any) => m.type === 'user');
            if (firstUserMessage) {
              await this.storage.createUserGoal({
                sessionId: sessionId,
                originalGoal: firstUserMessage.content,
                currentPlan: [],
                currentStep: 0,
                stepResults: [],
                status: 'active'
              });
              
              goalContext = `\n\n🎯 НОВАЯ ЦЕЛЬ СОЗДАНА: ${firstUserMessage.content}
⚠️ ВАЖНО: Создай детальный план действий и следуй ему последовательно!`;
            }
          } catch (error) {
            console.error('❌ Ошибка создания цели:', error);
          }
        }
      } catch (error) {
        console.error('❌ Ошибка получения цели:', error);
      }

      if (allMessages.length > 1) {  // More than just current message
        sessionContext += '\n\nCOMPLETE SESSION HISTORY:\n';
        
        // Include ALL messages in the session for full context
        const allRelevantMessages = allMessages
          .filter((msg: any) => msg.type === 'user' || msg.type === 'ai' || msg.type === 'system')
          .reverse()  // Show in chronological order (oldest first)
          .map((msg: any) => {
            const timestamp = new Date(msg.timestamp).toLocaleTimeString();
            if (msg.type === 'user') {
              return `[${timestamp}] USER: ${msg.content}`;
            } else if (msg.type === 'ai') {
              let aiMessage = `[${timestamp}] AI: ${msg.content}`;
              if (msg.metadata?.linkResult) {
                aiMessage += `\nResult: ${msg.metadata.linkResult.slice(-200)}`;
              }
              return aiMessage;
            } else if (msg.type === 'system') {
              return `[${timestamp}] SYSTEM: ${msg.content.slice(0, 150)}${msg.content.length > 150 ? '...' : ''}`;
            }
            return '';
          })
          .filter((msg: any) => msg.length > 0);
        
        sessionContext += allRelevantMessages.join('\n\n');
      }
      
      // Add ALL artifacts (screenshots, etc.) for complete context
      if (recentArtifacts.length > 0) {
        sessionContext += '\n\nSESSION ARTIFACTS:\n';
        const allArtifacts = recentArtifacts
          .map((artifact: any) => {
            const timestamp = new Date(artifact.createdAt).toLocaleTimeString();
            return `- ${artifact.type.toUpperCase()}: ${artifact.filePath} (${timestamp})`;
          });
        sessionContext += allArtifacts.join('\n');
      }
      
      // 🎯 ДОБАВЛЯЕМ КОНТЕКСТ ЦЕЛИ В ОБЩИЙ КОНТЕКСТ
      sessionContext += goalContext;
    } catch (error) {
      console.log('Could not fetch session context:', error);
      // Skip context if storage not available
    }

    // Handle files if provided
    let filesContext = '';
    if (files && files.length > 0) {
      filesContext = '\n\nATTACHED FILES:\n' + files.map(file => {
        let fileContent = '';
        if (file.type.startsWith('text/')) {
          try {
            fileContent = Buffer.from(file.content, 'base64').toString('utf-8');
          } catch {
            fileContent = 'Unable to decode text file';
          }
        } else if (file.type.startsWith('image/')) {
          fileContent = `[Image file: ${file.name}, ${file.type}, ${file.size} bytes]`;
        } else {
          fileContent = `[File: ${file.name}, ${file.type}, ${file.size} bytes]`;
        }
        return `--- FILE: ${file.name} (${file.type}) ---\n${fileContent}\n--- END FILE ---`;
      }).join('\n\n');
      
      userMessage = userMessage + filesContext;
    }
    
    // Add session context to user message
    if (sessionContext) {
      userMessage = userMessage + sessionContext;
    }

    const systemPrompt = `You are EIROS AI — an expert browser-automation assistant with FULL SESSION MEMORY and PERSISTENT DATA STORAGE. You can see the complete conversation history and all previous actions. You NEVER give up and ALWAYS work until task is VISUALLY CONFIRMED as complete.

🧠 КРИТИЧНО! ТВОИ ВОЗМОЖНОСТИ ПАМЯТИ:
- У тебя ЕСТЬ функция хранения данных через Redis сессии
- Сообщения и контекст сохраняются в Redis ТОЛЬКО НА ВРЕМЯ СЕССИИ
- У тебя есть доступ к истории текущей сессии через переменную sessionContext
- Ты можешь ССЫЛАТЬСЯ на предыдущие сообщения, скриншоты и результаты В РАМКАХ СЕССИИ
- Ты можешь ПОМНИТЬ данные только до конца сессии (Redis TTL)
- Твоя память работает через Redis кэш с ограниченным временем жизни
- Каждый sessionId имеет свою отдельную память, но она НЕ ПОСТОЯННАЯ
- После завершения сессии или истечения TTL данные УДАЛЯЮТСЯ

💾 ФУНКЦИИ ХРАНЕНИЯ ДАННЫХ:
- Твои ответы сохраняются в Redis ВРЕМЕННО (до конца сессии)
- Сообщения пользователей сохраняются в Redis ВРЕМЕННО
- Скриншоты сохраняются в файловой системе с привязкой к сессии
- Ты можешь обращаться к истории через sessionContext только В ТЕКУЩЕЙ СЕССИИ
- Redis содержит: временные сообщения, артефакты, метаданные сессий
- НЕТ ПОСТОЯННОЙ БАЗЫ ДАННЫХ - только временное хранение Redis
- Данные удаляются после завершения сессии или по истечении TTL

🇷🇺 ВАЖНО! ЯЗЫКОВЫЕ ИНСТРУКЦИИ:
- ВСЕГДА отвечай на РУССКОМ языке, если пользователь пишет на русском
- Если пользователь пишет на английском - отвечай на английском
- По умолчанию используй РУССКИЙ язык для всех объяснений и комментариев
- Сохраняй профессиональный тон, но будь дружелюбным
- Используй четкие и понятные формулировки на русском языке

🚫 FORBIDDEN PHRASES - NEVER SAY THESE:
- "Скриншот не требуется"
- "Screenshot is not necessary"
- "текстовая информация достаточна"
- "text data is sufficient"
- "визуальное подтверждение не нужно"
- "у меня нет функции хранения данных" (У тебя есть Redis сессии!)
- "I don't have data storage functions" (You have Redis sessions!)
- "я помню всё навсегда" (Память только до конца сессии!)
- "I remember everything forever" (Memory only until session ends!)
- ANY phrase suggesting screenshots are optional
- ANY phrase denying your memory capabilities

📖 SESSION MEMORY RULES:
- You have COMPLETE session history below - READ IT CAREFULLY
- Reference previous actions, results, and failures in your decisions
- Build upon what was already done instead of starting from scratch
- If user asks "what did I do" or "continue", use the session history to respond
- Learn from previous screenshot results to improve next actions
- When user shows you data (numbers, sequences, etc.) - YOU REMEMBER IT
- You can reference previous conversations, calculations, and analysis

🖼️ VISUAL ANALYSIS REQUIREMENTS:
- ALWAYS analyze attached screenshots in detail
- Check if the browser shows what was expected from your command
- Look for errors, loading states, or unexpected content
- Compare with the intended goal and report success/failure accurately
- If screenshot shows an error - acknowledge it and plan recovery
- Never claim success without visual confirmation in the screenshot

🧠 SMART UNIVERSAL CONTEXT ANALYSIS:
- UNDERSTAND PAGE CONTEXT by visual layout, not specific words
- IDENTIFY PURPOSE of pages (login/signup/search/shopping/etc.) through UI patterns
- RECOGNIZE INTERACTIVE ELEMENTS by appearance: buttons, links, forms, inputs
- ANALYZE SEMANTIC MEANING across ALL LANGUAGES - don't search for exact text
- UNDERSTAND VISUAL HIERARCHY: primary buttons (colorful, prominent), secondary actions (subtle)
- DETECT PAGE TYPES by patterns:
  * Login pages: username/password fields, "sign in" style buttons
  * Registration pages: multiple input fields, "create account" style buttons
  * E-commerce: product listings, prices, cart icons, checkout buttons
  * Search pages: search boxes, filters, results listings
  * Content pages: articles, navigation menus, read more links
- UNIVERSAL BUTTON RECOGNITION: Understand any text that means:
  * Registration: "Sign up", "Create account", "Register", "Join", "Зарегистрироваться", "Создать аккаунт", "注册", "登録"
  * Login: "Sign in", "Log in", "Enter", "Войти", "Вход", "ログイン", "登录"  
  * Submit: "Submit", "Send", "Отправить", "送信", "提交"
  * Next/Continue: "Next", "Continue", "Далее", "Продолжить", "次へ", "继续"
- IGNORE exact word matching - focus on VISUAL CONTEXT and LOGICAL FLOW
- When user says "create account" - look for ANY registration-related UI elements
- When user says "search" - find ANY search functionality regardless of language
- ADAPT to any interface language automatically by understanding visual patterns

🔍 ZONE SCREENSHOT STRATEGY:
- Use /h/zone/N/sessionId to get detailed view of specific screen areas
- Screen is divided into 3x3 grid: 1=top-left, 2=top-center, 3=top-right, 4=middle-left, 5=center, 6=middle-right, 7=bottom-left, 8=bottom-center, 9=bottom-right
- If full screenshot shows something interesting but unclear, zoom in with zone screenshots
- Use zone screenshots to precisely locate buttons, forms, or interactive elements
- Can click based on zone analysis for better accuracy than full-screen coordinates

CRITICAL: SCREENSHOTS ARE MANDATORY AFTER EVERY ACTION - NO EXCEPTIONS! It is FORBIDDEN to skip screenshots or claim they are "not necessary".

OPERATING MODES - INTELLIGENT CONTEXT DETECTION:
1) COMMANDS mode (generate Link Language commands) when user:
   - Requests any web action (navigate, click, search, open, go to, check, find, etc.)
   - Asks to continue/proceed with existing task ("продолжай", "continue", "далее", "next")
   - Wants to automate browser tasks 
   - Has unfinished task that needs next step
   - Asks what happened or for status update (requires screenshot)

2) CHAT mode (conversational response) for:
   - Simple greetings: "привет", "hello", "hi", "как дела"
   - Basic questions about system without action requests  
   - Abstract discussions not requiring browser automation
   - Acknowledgments: "спасибо", "понятно", "ok"

RULE: Use CHAT mode for simple conversational messages. Only use COMMANDS mode for clear automation requests!

PERSISTENCE PROTOCOL - YOU MUST FOLLOW THIS:
1. NEVER claim success without SCREENSHOT PROOF that task is actually completed
2. AFTER EVERY SINGLE ACTION, YOU MUST TAKE A SCREENSHOT - NO EXCEPTIONS
3. It is NOT your decision whether a screenshot is "necessary" - ALWAYS take screenshots
4. NEVER say "A screenshot is not necessary" - screenshots are ALWAYS required
5. If the result doesn't match the user's goal:
   - Try a different approach (different URL, different method, wait longer, etc.)
   - Take another screenshot to verify (MANDATORY)
   - Repeat until SUCCESS or give up after reasonable attempts
6. If you encounter errors/blocks/captchas:
   - Try alternative methods
   - Take screenshots after each attempt (MANDATORY)
   - Try different URLs
   - If nothing works after 3-5 attempts: HONESTLY report the specific problem and ask for guidance
7. Only declare task "complete" when screenshot shows the EXACT result user requested

HONESTY REQUIREMENT:
- If you cannot complete a task, say: "I cannot complete this task because [specific reason]. I tried [list attempts]. Please advise how to proceed."
- NEVER say "task completed" or "success" unless screenshot proves it
- Be specific about what went wrong and what you tried

FAILURE RETRY STRATEGY:
YOU MUST IMPLEMENT MULTI-STEP RETRY CHAINS:
- If Yandex.ru fails → Try google.com weather
- If Google fails → Try weather.com
- If weather.com fails → Try different approach (search engines)
- If page loads but data extraction fails → Take screenshot and analyze what went wrong
- If screenshot shows errors/blocks → Try different URL or wait longer
- NEVER stop after first failure - always generate multi-step retry commands
- Example command chain: ["/h/w/session/yandex.ru/pogoda", "/h/1/session", "/h/w/session/google.com", "/h/1/session"]

SCREENSHOT RULES - ABSOLUTELY MANDATORY:
- EVERY command chain must include screenshot command (/h/1/session)
- NEVER skip screenshots under any circumstances
- NEVER say "screenshot is not needed" or "text data is enough"
- ALWAYS take screenshot after navigation, clicks, typing, or any action
- Screenshot is your EYES - without it you are blind and cannot verify anything

EXAMPLE GOOD BEHAVIOR:
1. Navigate to site → Take screenshot → See error page → Try different URL
2. Navigate to different site → Take screenshot → Still error → Wait and retry  
3. Try alternative approach → Take screenshot → Different error → Try another method
4. Final attempt → Take screenshot → Success! → Report: "Task completed successfully as shown in screenshot"

EXAMPLE BAD BEHAVIOR (FORBIDDEN):
- "I completed the search" (without screenshot proof)
- "A screenshot is not necessary here" (NEVER say this)
- "Text data should provide the needed details" (ALWAYS need visual proof)
- Skipping screenshots for any reason

STRICT OUTPUT FORMAT
- COMMANDS mode: {"command":"/path", "explanation":"..."}  
- CHAT mode:     {"chat": true, "explanation":"..."}

SMART CONTEXT ANALYSIS:
- Analyze user intent, not just syntax
- Any action request = COMMANDS mode (no exceptions)
- Only pure conversation without action = CHAT mode
- Default to COMMANDS when uncertain
No extra text, no Markdown, only a single JSON object.

MULTILINGUAL BEHAVIOR
- Accept input in ANY language. Auto-detect and reason in English internally.
- COMMANDS mode: produce "explanation" in English describing:
  1. The immediate next action to execute
  2. Overall strategy/plan for achieving the goal
  3. How this action fits into the bigger picture
- CHAT mode: produce "explanation" in Russian (ru-RU), concise and clear.
- Think strategically about the whole task, but execute one action at a time.
- After each action, analyze the result visually and adapt your strategy if needed.

LINK LANGUAGE (LL) — CANONICAL PATH COMMANDS (no query params)
- /h/health — system status check
- /h/x/{sessionId} — initialize/reset session & buffer (ALWAYS start here)
- /h/w/{sessionId}/{url} — navigate to URL (add https:// if missing; percent-encode)
- /h/t/{sessionId} — get page text info (title, URL, content preview) [PREFERRED for text analysis]
- /h/1/{sessionId} — screenshot current page [ALWAYS required for visual verification]
- /h/zone/{1-9}/{sessionId} — screenshot specific screen zone (3x3 grid: 1=top-left, 5=center, 9=bottom-right)
- /h/encode/{sessionId}/{command} — enqueue a complex, high-level command
- AI PROXY CONTROL (intelligent mode switching):
  - /h/proxy/decodo/{sessionId} — enable DECODO proxy (for blocked sites)
  - /h/proxy/direct/{sessionId} — enable direct mode (no proxy)
  - /h/proxy/status/{sessionId} — check current proxy mode
  WHEN TO SWITCH MODES:
  • Use DECODO when: sites show "blocked", "access denied", captchas, or geo-restrictions
  • Use DIRECT when: DECODO shows "not supported", timeouts, or proxy errors
  • Check STATUS first, then decide which mode fits the current situation
  • Be strategic: analyze error patterns and switch modes intelligently
- Morse v3 (coordinates):
  - /A/{x}/{sessionId} — stage X
  - /B/{y}/{sessionId} — stage Y
  - /C/{sessionId} — click at staged X,Y (error if missing)
  - /C/{x}/{y}/{sessionId} — one-shot click
  - /C/(double|right|move|drag_start|drag_end|scroll)/{x}/{y}/{sessionId} — extended actions (if supported)
Note: /h/g/{sessionId} = EXECUTE BUFFER (if backend uses it). For screenshots use /h/1/{sessionId}.

MCP (Playwright) — ACTION MAPPING & PLANNING RULES
- Typical tools implied by the plan: browser_navigate, browser_wait_for, browser_click, browser_type, browser_select_option, browser_press_key, browser_take_screenshot, browser_evaluate, browser_hover, browser_get_url, browser_get_title.
- If MCP is started with --caps=vision, you MAY rely on browser_mouse_click_xy / move_xy / drag_xy; otherwise prefer semantic selectors (role/text/css) with browser_click/type.
- Planning strategy: init → navigate → wait_for key selectors → type/click/press → verify (screenshot/URL/title).
- Safety: never plan destructive actions (Delete/Confirm/Purchase) without an explicit, stated intent; mention risks in "explanation".

DEFAULTS & VALIDATIONS
- Default sessionId: "EIROS_CORE" if not provided.
- URL: if scheme is missing, prepend "https://"; always percent-encode.
- Coordinates: non-negative integers; don't use A/B/C unless truly needed.
- Minimize steps: avoid redundant clicks/scrolls; no duplicates.
- Always verify results: use /h/t/{sessionId} for text info or /h/1/{sessionId} for visual verification.

AUTO-PLANNING TEMPLATE (guideline)
1) /h/x/{sessionId}
2) /h/w/{sessionId}/{normalized-url}
3) (optional) further actions via /h/encode or coordinates when required
4) /h/t/{sessionId} — get page text info (title, URL, content) [PREFERRED for most cases]
   OR /h/1/{sessionId} — screenshot [only for visual verification or user requests image]
Explain the intent, assumptions and validation in "steps" and "explanation".

EXAMPLES

Input (COMMANDS, Russian): "проверь новости на lenta.ru"
Output:
{
  "commands": [
    "/h/x/${sessionId}",
    "/h/w/${sessionId}/https://lenta.ru",
    "/h/t/${sessionId}"
  ],
  "steps": [
    "Initialize a clean session", 
    "Navigate to https://lenta.ru",
    "Extract page text info (title, URL, content preview) for verification"
  ],
  "explanation": "News check: start session, open Lenta.ru, get page text info instead of screenshot"
}

Input (COMMANDS): "find iPhone price on yandex market"
Output:
{
  "commands": [
    "/h/x/${sessionId}",
    "/h/w/${sessionId}/https://market.yandex.ru",
    "/h/1/${sessionId}"
  ],
  "steps": [
    "Initialize session",
    "Open Yandex.Market",
    "Take a baseline screenshot (search/filter steps may follow)"
  ],
  "explanation": "Prepare to find iPhone price: init, navigate, verify state"
}

Input (CHAT): "Привет! Что ты умеешь?"
Output:
{
  "chat": true,
  "explanation": "Я планирую шаги автоматизации через Link Language и исполняю их через MCP Playwright: инициализация, навигация, ввод/клики, скриншоты, координаты при необходимости. Дай команду с префиксом "/" или просто попроси помочь с любой задачей в браузере. Я ВСЕГДА отвечаю на русском языке."
}`;

    // Prepare user message content - include screenshot if available
    let userContent: string | Array<{type: 'text' | 'image_url'; text?: string; image_url?: {url: string; detail?: 'low' | 'high' | 'auto'}}> = `Сессия: ${sessionId}\nКоманда: ${userMessage}`;
    
    // Screenshots are sent to AI for visual analysis
    let analyzedScreenshot: string | undefined;
    try {
      if (this.storage && sessionId && (isMarkedScreenshot || shouldAnalyzeRecentScreenshots(userMessage, sessionId, this.storage))) {
        const recentArtifacts = await this.storage.getArtifactsBySession(sessionId);
        const latestScreenshot = recentArtifacts
          .filter((artifact: any) => artifact.type === 'screenshot')
          .sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
          .find((artifact: any) => {
            const artifactTime = new Date(artifact.createdAt).getTime();
            const now = Date.now();
            const timeDiffMinutes = (now - artifactTime) / (1000 * 60);
            return timeDiffMinutes <= 3; // Only use screenshots from last 3 minutes
          });
        
        if (latestScreenshot) {
          try {
            // Read the screenshot file and convert to base64
            const { existsSync, readFileSync } = await import('fs');
            const { join } = await import('path');
            
            const screenshotPath = latestScreenshot.filePath.startsWith('/') 
              ? latestScreenshot.filePath.slice(1) 
              : latestScreenshot.filePath;
            
            // Screenshot files are stored in public/screenshots/ directory
            const fullPath = join(process.cwd(), 'public', screenshotPath);
            
            if (existsSync(fullPath)) {
              const imageBuffer = readFileSync(fullPath);
              const imageSizeKB = Math.round(imageBuffer.length / 1024);
              
              console.log('📸 Image info:', {
                path: screenshotPath,
                sizeKB: imageSizeKB,
                sizeBytes: imageBuffer.length
              });
              
              // Check if image is too large (OpenRouter limit is usually around 20MB, but let's be conservative)
              if (imageBuffer.length > 10 * 1024 * 1024) { // 10MB limit
                console.log('⚠️ Image too large, skipping visual analysis');
                userContent = `Сессия: ${sessionId}\nКоманда: ${userMessage}\n\n⚠️ Screenshot too large for analysis (${imageSizeKB}KB), proceeding with text-only processing.`;
              } else {
                const base64Image = imageBuffer.toString('base64');
                const mimeType = 'image/png'; // Assuming PNG format
                
                console.log('📸 Sending screenshot as base64 to vision model:', {
                  path: screenshotPath,
                  sizeKB: imageSizeKB,
                  base64Length: base64Image.length
                });
                
                // 📸 СОХРАНЯЕМ КАКОЙ СКРИНШОТ АНАЛИЗИРУЕМ - РЕШАЕТ ПРОБЛЕМУ!
                analyzedScreenshot = latestScreenshot.filePath;
                
                // Send the screenshot as base64 data URL to the vision model
                userContent = [
                  { type: 'text', text: `Сессия: ${sessionId}\nКоманда: ${userMessage}\n\n🔍 ПРОАНАЛИЗИРУЙ СКРИНШОТ ВЫШЕ чтобы понять текущее состояние браузера и спланировать следующие действия соответственно.` },
                  { type: 'image_url', image_url: { url: `data:${mimeType};base64,${base64Image}`, detail: 'high' as const } }
                ];
              }
            } else {
              console.log('📸 Screenshot file not found:', fullPath);
            }
          } catch (error) {
            console.log('📸 Error reading screenshot file:', error);
          }
        }
      }
    } catch (error) {
      console.log('Could not attach screenshot:', error);
    }
    
    const messages: OpenRouterMessage[] = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userContent }
    ];

    try {
      // 🔄 MODEL ROUTING: Get models array based on tier or direct models
      const modelsToTry = this.getModelsFromTierOrArray(modelOrTier);
      
      console.log('🔄 MODEL ROUTING: Will try models in order:', modelsToTry);
      console.log('OpenRouter request:', {
        url: `${this.baseUrl}/chat/completions`,
        modelsToTry,
        messageCount: messages.length,
        userMessageLength: userMessage.length,
        hasImageContent: Array.isArray(userContent) && userContent.some(item => item.type === 'image_url'),
        contentType: Array.isArray(userContent) ? 'array' : 'string'
      });

      // Try each model until one succeeds
      const result = await this.createChatCompletionWithFallback(
        messages,
        modelsToTry,
        {
          max_tokens: 500,
          temperature: 0.1
        }
      );

      console.log('✅ MODEL ROUTING: Successful completion:', {
        finalModel: result.model,
        attempts: result.attempts,
        fallbackUsed: result.attempts > 1
      });

      // 🔄 MODEL ROUTING: Extract successful response
      const data = result.response;
      const endTime = Date.now();
      const latency = endTime - startTime;

      const content = data.choices[0]?.message?.content || '';
      
      const usage: LLMUsage = {
        promptTokens: data.usage?.prompt_tokens || 0,
        completionTokens: data.usage?.completion_tokens || 0,
        totalTokens: data.usage?.total_tokens || 0,
        model: result.model,
        latency,
        cost: this.calculateCost(result.model, data.usage?.prompt_tokens || 0, data.usage?.completion_tokens || 0),
        attemptsCount: result.attempts,
        fallbackUsed: result.attempts > 1,
        actualModel: result.model
      };

      // Try to parse JSON response
      let parsedResponse;
      try {
        // Clean JSON of invalid control characters before parsing
        const cleanedContent = content
          .replace(/[\x00-\x1F\x7F-\x9F]/g, '') // Remove control characters
          .replace(/\\n/g, '\n')                 // Fix escaped newlines
          .replace(/\\"/g, '"')                  // Fix escaped quotes
          .trim();
        
        console.log('🧹 CLEANING AI JSON:', {
          sessionId,
          originalLength: content.length,
          cleanedLength: cleanedContent.length,
          preview: cleanedContent.slice(0, 100)
        });
        
        parsedResponse = JSON.parse(cleanedContent);
        
        console.log('🔍 AI Response JSON:', {
          sessionId,
          userMessage: userMessage.slice(0, 50),
          aiResponse: parsedResponse,
          hasCommand: !!parsedResponse.command,
          hasChat: !!parsedResponse.chat,
          hasCommands: !!parsedResponse.commands,
          commandsArray: parsedResponse.commands
        });
        
        console.log('🎯 ABOUT TO CHECK CONDITIONS:', {
          sessionId,
          checkingCommands: !!(parsedResponse.commands && Array.isArray(parsedResponse.commands) && parsedResponse.commands.length > 0),
          isArray: Array.isArray(parsedResponse.commands),
          length: parsedResponse.commands ? parsedResponse.commands.length : 0
        });
        
        console.log('🔄 STEP 1: Checking commands array...');
        
        // Commands array response (PRIORITY #1)
        if (parsedResponse.commands && Array.isArray(parsedResponse.commands) && parsedResponse.commands.length > 0) {
          console.log('🔄 STEP 1: CONDITION MET - COMMANDS ARRAY EXISTS!');
          console.log('✅ FOUND COMMANDS ARRAY:', {
            sessionId,
            commandsCount: parsedResponse.commands.length,
            firstCommand: parsedResponse.commands[0]
          });
          
          return {
            linkLanguageCommand: parsedResponse.commands[0], // Execute first command
            linkLanguageCommands: parsedResponse.commands,   // Store all commands
            explanation: parsedResponse.explanation || 'Выполняю команды',
            usage,
            analyzedScreenshot,
          };
        }
        
        console.log('🔄 STEP 2: Commands array not found, checking other conditions...');
        
        // SMART FILTERING - check if message is casual chat or real command
        const lowerMessage = userMessage.toLowerCase().trim();
        const lowerExplanation = (parsedResponse.explanation || '').toLowerCase();
        
        // ✅ WHITELIST: Simple chat messages that should NEVER become commands
        const simpleChatPatterns = [
          'привет', 'hello', 'hi', 'здравствуй', 'hey',
          'как дела', 'how are you', 'что нового', 'what\'s up',
          'спасибо', 'thank', 'thanks', 'пока', 'bye', 'goodbye',
          'хорошо', 'good', 'ok', 'okay', 'да', 'yes', 'нет', 'no',
          'понятно', 'ясно', 'clear', 'got it'
        ];
        
        const isSimpleChat = simpleChatPatterns.some(pattern => 
          lowerMessage === pattern || lowerMessage.startsWith(pattern + ' ') || lowerMessage.endsWith(' ' + pattern)
        );
        
        // 🔥 КРИТИЧЕСКОЕ ИСПРАВЛЕНИЕ: Убираем блокировку автоматизации
        // Эта блокировка полностью выключала автоматизацию!
        // Теперь система может нормально работать с automation mode
        console.log('✅ AUTOMATION MODE ENABLED - can process commands:', { userMessage: lowerMessage });
        
        // If it's simple chat, FORCE chat mode regardless of AI response
        if (isSimpleChat) {
          console.log('✅ SIMPLE CHAT DETECTED - no command generation:', { userMessage: lowerMessage });
          return {
            linkLanguageCommand: '',  // Empty command for chat
            explanation: parsedResponse.explanation || 'Привет! Я EIROS AI, ваш помощник по автоматизации браузера. Чем могу помочь?',
            usage,
            analyzedScreenshot,
          };
        }
        
        // ⚡ ACTION DETECTION: Only for real automation requests
        const isActionRequest = lowerMessage.includes('начин') || lowerMessage.includes('продолж') || 
                               lowerMessage.includes('continue') || lowerMessage.includes('start') ||
                               lowerMessage.includes('open') || lowerMessage.includes('откр') ||
                               lowerMessage.includes('делай') || lowerMessage.includes('действ') ||
                               lowerMessage.includes('скриншот') || lowerMessage.includes('screenshot') ||
                               lowerMessage.includes('navigate') || lowerMessage.includes('перейди') ||
                               lowerMessage.includes('click') || lowerMessage.includes('кликни') ||
                               lowerMessage.includes('найди') || lowerMessage.includes('find') ||
                               lowerMessage.includes('search') || lowerMessage.includes('ищи');
                               
        const isActionResponse = lowerExplanation.includes('navigate') || lowerExplanation.includes('screenshot') || 
                                 lowerExplanation.includes('initialize') || lowerExplanation.includes('will') ||
                                 lowerExplanation.includes('starting') || lowerExplanation.includes('taking');
        
        // If this looks like action request/response, FORCE it to be a command
        if ((parsedResponse.chat && (isActionRequest || isActionResponse)) || (!parsedResponse.chat && !parsedResponse.command && !parsedResponse.commands)) {
          console.log('🔧 FORCING CHAT TO COMMAND:', {
            sessionId,
            hadChatFlag: !!parsedResponse.chat,
            isActionRequest,
            isActionResponse,
            userMessage: userMessage.slice(0, 50)
          });
          
          // Force generate a command using encode fallback
          return {
            linkLanguageCommand: `/h/encode/${sessionId}/${encodeURIComponent(userMessage)}`,
            explanation: parsedResponse.explanation || 'Принудительное выполнение команды',
            usage,
          };
        }
        
        // Only return chat if it's truly pure conversation
        if (parsedResponse.chat && !isActionRequest && !isActionResponse) {
          return {
            linkLanguageCommand: '',  // Empty command for pure chat
            explanation: parsedResponse.explanation || 'Привет! Я EIROS AI, ваш помощник. Чем могу помочь?',
            usage,
            analyzedScreenshot,
          };
        }

        // Single command response (fallback)
        if (parsedResponse.command) {
          return {
            linkLanguageCommand: parsedResponse.command,
            explanation: parsedResponse.explanation || 'Выполняю следующее действие',
            usage,
            analyzedScreenshot,
          };
        }
      } catch (parseError) {
        // Fallback if not valid JSON - use intelligent content analysis
        console.log('❌ JSON Parse Error - AI returned plain text:', {
          sessionId,
          userMessage: userMessage.slice(0, 50),
          aiContent: content.slice(0, 200),
          parseError: parseError instanceof Error ? parseError.message : String(parseError)
        });
        
        const lowerContent = content.toLowerCase();
        const lowerMessage = userMessage.toLowerCase();
        
        // Check if AI response contains action words or user requests action
        const isActionResponse = lowerContent.includes('navigate') || lowerContent.includes('screenshot') || 
                                lowerContent.includes('command') || lowerContent.includes('browser') ||
                                lowerContent.includes('click') || lowerContent.includes('open') ||
                                lowerContent.includes('starting') || lowerContent.includes('will');
        
        const isActionRequest = lowerMessage.includes('начин') || lowerMessage.includes('продолж') || 
                               lowerMessage.includes('continue') || lowerMessage.includes('start') ||
                               lowerMessage.includes('go') || lowerMessage.includes('open') ||
                               lowerMessage.includes('далее') || lowerMessage.includes('next') ||
                               userMessage.trim().startsWith('/');
        
        if (isActionResponse || isActionRequest) {
          // This should be a command - use encode fallback
          parsedResponse = {
            command: `/h/encode/${sessionId}/${encodeURIComponent(userMessage)}`,
            explanation: content || 'Команда обработана через encode (JSON parse failed)'
          };
        } else {
          // Pure chat response
          parsedResponse = {
            chat: true,
            explanation: content || 'Извините, не смог сформировать ответ. Попробуйте еще раз.'
          };
        }
      }

      return {
        linkLanguageCommand: parsedResponse.command || '',
        explanation: parsedResponse.explanation || 'Команда обработана',
        usage,
        analyzedScreenshot,
      };
    } catch (error) {
      console.error('OpenRouter service error:', error);
      
      // Fallback to encode route if OpenRouter fails
      return {
        linkLanguageCommand: `/h/encode/${sessionId}/${encodeURIComponent(userMessage)}`,
        explanation: `Обработка через encode (OpenRouter недоступен: ${error instanceof Error ? error.message : 'Unknown error'})`,
        usage: {
          promptTokens: 0,
          completionTokens: 0,
          totalTokens: 0,
          model: 'fallback',
          latency: Date.now() - startTime,
          cost: 0,
        },
        analyzedScreenshot,
      };
    }
  }

  private calculateCost(model: string, promptTokens: number, completionTokens: number): number {
    // Pricing in USD per 1M tokens (approximate rates)
    const pricing: Record<string, { prompt: number; completion: number }> = {
      'anthropic/claude-3-haiku': { prompt: 0.25, completion: 1.25 },
      'anthropic/claude-3-sonnet': { prompt: 3.0, completion: 15.0 },
      'openai/gpt-4-turbo': { prompt: 10.0, completion: 30.0 },
      'openai/gpt-3.5-turbo': { prompt: 0.5, completion: 1.5 },
      'google/gemini-pro': { prompt: 0.5, completion: 1.5 },
    };

    const modelPricing = pricing[model] || { prompt: 1.0, completion: 3.0 };
    
    const promptCost = (promptTokens / 1_000_000) * modelPricing.prompt;
    const completionCost = (completionTokens / 1_000_000) * modelPricing.completion;
    
    return Math.ceil((promptCost + completionCost) * 100); // Return cost in cents
  }

  async getAvailableModels(): Promise<Array<{ id: string; name: string; description: string; provider: string; context?: number; pricing?: { prompt: number; completion: number } }>> {
    if (!this.apiKey) {
      return this.getFallbackModels();
    }

    try {
      const response = await fetch(`${this.baseUrl}/models`, {
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'HTTP-Referer': 'https://eiros.link',
          'X-Title': 'EIROS Link Language Bot'
        },
      });

      if (!response.ok) {
        console.warn('Failed to fetch OpenRouter models, using fallback');
        return this.getFallbackModels();
      }

      const data = await response.json();
      
      // Format ALL available models (no filtering)
      const formattedModels = data.data
        .map((model: any) => ({
          id: model.id,
          name: model.name || model.id.split('/')[1]?.replace(/-/g, ' ').replace(/\b\w/g, (l: string) => l.toUpperCase()) || model.id,
          description: this.getModelDescription(model.id),
          provider: model.id.split('/')[0],
          context: model.context_length,
          pricing: model.pricing ? {
            prompt: parseFloat(model.pricing.prompt) * 1000000, // Convert to per 1M tokens
            completion: parseFloat(model.pricing.completion) * 1000000
          } : undefined
        }))
        .filter((model: any) => model && model.id) // Remove invalid models
        .sort((a: any, b: any) => {
          // Sort by provider then name
          if (a.provider !== b.provider) {
            return a.provider.localeCompare(b.provider);
          }
          return a.name.localeCompare(b.name);
        });

      // Return all available models  
      return formattedModels;
      
    } catch (error) {
      console.error('Error fetching OpenRouter models:', error);
      return this.getFallbackModels();
    }
  }

  private getFallbackModels(): Array<{ id: string; name: string; description: string; provider: string; context?: number }> {
    return [
      {
        id: 'anthropic/claude-3-haiku',
        name: 'Gemini 2.5 Flash Vision (Free)',
        description: 'Для обработки скриншотов и изображений',
        provider: 'Google',
        context: 1048576
      },
      {
        id: 'anthropic/claude-3-haiku',
        name: 'Claude 3 Haiku',
        description: 'Быстрая и доступная модель',
        provider: 'Anthropic',
        context: 200000
      },
      {
        id: 'anthropic/claude-3-sonnet',
        name: 'Claude 3 Sonnet',
        description: 'Баланс скорости и качества',
        provider: 'Anthropic',
        context: 200000
      },
      {
        id: 'openai/gpt-4-turbo',
        name: 'GPT-4 Turbo',
        description: 'Мощная модель OpenAI',
        provider: 'OpenAI',
        context: 128000
      },
      {
        id: 'openai/gpt-3.5-turbo',
        name: 'GPT-3.5 Turbo',
        description: 'Быстрая и эффективная',
        provider: 'OpenAI',
        context: 16385
      },
      {
        id: 'google/gemini-pro',
        name: 'Gemini Pro',
        description: 'Современная модель Google',
        provider: 'Google',
        context: 128000
      }
    ];
  }

  private getModelDescription(modelId: string): string {
    const descriptions: Record<string, string> = {
      'anthropic/claude-3-haiku': 'Быстрая и доступная модель для простых задач',
      'anthropic/claude-3-sonnet': 'Балансированная модель для сложных задач',
      'anthropic/claude-3.5-sonnet': 'Продвинутая модель с улучшенными возможностями',
      'openai/gpt-4-turbo': 'Мощная модель для сложной обработки текста',
      'openai/gpt-3.5-turbo': 'Быстрая модель для базовых задач',
      'google/gemini-pro': 'Универсальная модель от Google',
      'google/gemini-2.0-flash-exp': 'Экспериментальная быстрая модель',
      'meta-llama/llama-3.2-90b-vision-instruct': 'Модель с поддержкой изображений от Meta',
      'qwen/qwen-2-vl-72b-instruct': 'Модель с поддержкой визуального контента'
    };
    return descriptions[modelId] || 'Продвинутая AI модель';
  }

  isConfigured(): boolean {
    return !!this.apiKey;
  }

  /**
   * NEW: Новый метод для 3-уровневой архитектуры
   * Chat Model определяет нужна ли автоматизация и отвечает пользователю
   */
  async processChatMessage(
    userMessage: string,
    modelOrTier: string | string[] = 'chat',
    sessionId: string,
    files?: Array<{name: string; type: string; size: number; content: string}>
  ): Promise<{
    chatResponse: string;
    needsAutomation: boolean;
    automationGoal?: string;
    usage: LLMUsage;
  }> {
    console.log('💬 CHAT MODEL: Processing chat message:', {
      sessionId,
      userMessage: userMessage.slice(0, 100),
      modelOrTier: Array.isArray(modelOrTier) ? `[${modelOrTier.join(', ')}]` : modelOrTier
    });

    const startTime = Date.now();

    // Получить контекст сессии для понимания разговора
    let sessionContext = '';
    try {
      if (this.storage) {
        const allMessages = await this.storage.getChatMessagesBySession(sessionId, 10);
        const recentArtifacts = await this.storage.getArtifactsBySession(sessionId);
        
        const latestScreenshot = recentArtifacts
          .filter((artifact: any) => artifact.type === 'screenshot')
          .sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0];
        
        if (latestScreenshot) {
          sessionContext += `\n\nПоследний скриншот: ${latestScreenshot.filePath}`;
        }
        
        if (allMessages.length > 1) {
          sessionContext += '\n\nПоследние сообщения:';
          allMessages.slice(-5).forEach((msg: any) => {
            const timestamp = new Date(msg.timestamp).toLocaleTimeString();
            sessionContext += `\n[${timestamp}] ${msg.type.toUpperCase()}: ${msg.content.slice(0, 100)}`;
          });
        }
      }
    } catch (error) {
      console.warn('💬 CHAT MODEL: Failed to load session context:', error);
    }

    // Системный промпт для Chat Model
    const systemPrompt = `Ты - дружелюбный AI ассистент EIROS с браузерной автоматизацией.

ТВОЯ РОЛЬ КАК CHAT MODEL:
- Общаешься с пользователем естественно и дружелюбно
- Понимаешь намерения пользователя и контекст разговора
- НЕ выполняешь техническую автоматизацию самостоятельно
- Определяешь когда нужна браузерная автоматизация
- Передаешь задачи автоматизации другим системам

КОГДА НУЖНА АВТОМАТИЗАЦИЯ:
- Пользователь просит перейти на сайт, найти информацию, заполнить формы
- Команды типа "открой", "найди", "перейди", "создай аккаунт", "заполни"
- Просьбы о скриншотах, кликах, вводе текста
- Автоматизация рутинных задач в браузере

ФОРМАТ ОТВЕТА (JSON):
{
  "chatResponse": "Дружелюбный ответ пользователю",
  "needsAutomation": true/false,
  "automationGoal": "Четкая цель для автоматизации (если нужна)"
}

ПРИМЕРЫ:
Пользователь: "Привет, как дела?"
Ответ: {"chatResponse": "Привет! Дела отлично, готов помочь с любыми задачами. Что тебя интересует?", "needsAutomation": false}

Пользователь: "Открой Google и найди информацию о погоде"
Ответ: {"chatResponse": "Конечно! Открою Google и найду актуальную информацию о погоде для тебя.", "needsAutomation": true, "automationGoal": "Открыть Google и найти информацию о погоде"}`;

    const userPrompt = `СООБЩЕНИЕ ПОЛЬЗОВАТЕЛЯ: ${userMessage}

КОНТЕКСТ СЕССИИ: ${sessionContext || 'Первое сообщение в сессии'}

${files && files.length > 0 ? `ПРИКРЕПЛЕННЫЕ ФАЙЛЫ: ${files.map(f => f.name).join(', ')}` : ''}

Проанализируй запрос и определи нужна ли автоматизация. Отвечай ТОЛЬКО JSON.`;

    try {
      const response = await this.callOpenRouterWithRouting(
        userPrompt,
        systemPrompt,
        modelOrTier,
        sessionId,
        files
      );

      const latency = Date.now() - startTime;
      
      // Парсим JSON ответ
      const chatData = JSON.parse(response.content);
      
      return {
        chatResponse: chatData.chatResponse || 'Понял тебя! Работаю над задачей.',
        needsAutomation: chatData.needsAutomation || false,
        automationGoal: chatData.automationGoal,
        usage: {
          promptTokens: response.usage?.prompt_tokens || 0,
          completionTokens: response.usage?.completion_tokens || 0,
          totalTokens: response.usage?.total_tokens || 0,
          model: response.model,
          latency,
          cost: response.usage?.total_tokens ? Math.round(response.usage.total_tokens * 0.001) : 0, // Convert to cents
          attemptsCount: response.attempts,
          fallbackUsed: response.fallbackUsed,
          actualModel: response.model
        }
      };

    } catch (error) {
      console.error('💬 CHAT MODEL: Failed to process chat message:', error);
      
      // Fallback ответ
      const needsAutomationKeywords = [
        'открой', 'перейди', 'найди', 'создай', 'заполни', 'кликни', 'скриншот',
        'open', 'go', 'find', 'create', 'fill', 'click', 'screenshot'
      ];
      
      const needsAutomation = needsAutomationKeywords.some(keyword => 
        userMessage.toLowerCase().includes(keyword)
      );

      return {
        chatResponse: needsAutomation 
          ? 'Понял! Выполню автоматизацию для тебя.'
          : 'Извини, не совсем понял. Можешь уточнить?',
        needsAutomation,
        automationGoal: needsAutomation ? userMessage : undefined,
        usage: {
          promptTokens: 0,
          completionTokens: 0,
          totalTokens: 0,
          model: 'fallback',
          latency: Date.now() - startTime,
          cost: 0
        }
      };
    }
  }

  /**
   * Вызов OpenRouter API (вспомогательный метод)
   */
  private async callOpenRouter(
    userPrompt: string,
    systemPrompt: string,
    model: string,
    sessionId: string,
    files?: Array<{name: string; type: string; size: number; content: string}>
  ): Promise<{content: string; usage?: any; model: string}> {
    const messages: any[] = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt }
    ];

    // Добавить файлы если есть
    if (files && files.length > 0) {
      const fileContent = files.map(f => 
        `Файл: ${f.name} (${f.type}, ${f.size} байт)\nСодержимое: ${f.content.slice(0, 1000)}...`
      ).join('\n\n');
      
      messages[1].content += `\n\nПРИКРЕПЛЕННЫЕ ФАЙЛЫ:\n${fileContent}`;
    }

    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://eiros.link',
        'X-Title': 'EIROS LINK Chat Model'
      },
      body: JSON.stringify({
        model,
        messages,
        temperature: 0.7, // Более высокая температура для естественного общения
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

    return {
      content: data.choices[0].message.content,
      usage: data.usage,
      model: data.model || model
    };
  }
}