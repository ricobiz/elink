import { chromium, Browser, Page, BrowserContext } from 'playwright';
import { randomUUID } from 'crypto';
import path from 'path';
import fs from 'fs/promises';

// Пул User Agents для ротации
const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:132.0) Gecko/20100101 Firefox/132.0',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:132.0) Gecko/20100101 Firefox/132.0',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.1 Safari/605.1.15',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 Edg/131.0.0.0'
];

// Генерация человекоподобных движений мыши
function generateHumanMousePath(fromX: number, fromY: number, toX: number, toY: number): Array<{x: number, y: number, delay: number}> {
  const path = [];
  const distance = Math.sqrt(Math.pow(toX - fromX, 2) + Math.pow(toY - fromY, 2));
  const steps = Math.max(3, Math.min(15, Math.floor(distance / 50)));
  
  for (let i = 0; i <= steps; i++) {
    const progress = i / steps;
    
    // Кривая Безье с рандомизацией
    const controlX1 = fromX + (toX - fromX) * 0.3 + (Math.random() - 0.5) * 100;
    const controlY1 = fromY + (toY - fromY) * 0.3 + (Math.random() - 0.5) * 100;
    const controlX2 = fromX + (toX - fromX) * 0.7 + (Math.random() - 0.5) * 80;
    const controlY2 = fromY + (toY - fromY) * 0.7 + (Math.random() - 0.5) * 80;
    
    const x = Math.pow(1 - progress, 3) * fromX + 
              3 * Math.pow(1 - progress, 2) * progress * controlX1 + 
              3 * (1 - progress) * Math.pow(progress, 2) * controlX2 + 
              Math.pow(progress, 3) * toX;
              
    const y = Math.pow(1 - progress, 3) * fromY + 
              3 * Math.pow(1 - progress, 2) * progress * controlY1 + 
              3 * (1 - progress) * Math.pow(progress, 2) * controlY2 + 
              Math.pow(progress, 3) * toY;
    
    // Человеческие задержки (неравномерные)
    const baseDelay = 10 + Math.random() * 20;
    const humanDelay = baseDelay + (Math.random() > 0.7 ? Math.random() * 50 : 0);
    
    path.push({
      x: Math.round(x + (Math.random() - 0.5) * 2), // Микродрожание
      y: Math.round(y + (Math.random() - 0.5) * 2),
      delay: Math.round(humanDelay)
    });
  }
  
  return path;
}

// Рандомная задержка как у человека
function getHumanDelay(min: number = 50, max: number = 200): number {
  const base = min + Math.random() * (max - min);
  // Иногда человек делает паузы
  return Math.random() > 0.8 ? base + Math.random() * 300 : base;
}

// Генерация случайного user agent
function getRandomUserAgent(): string {
  return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
}

export interface PlaywrightSession {
  id: string;
  browser: Browser;
  context: BrowserContext;
  page: Page;
  createdAt: Date;
}

export class PlaywrightService {
  private sessions: Map<string, PlaywrightSession> = new Map();
  private userAgentRotationMap: Map<string, string> = new Map(); // sessionId -> userAgent

  async createSession(sessionId?: string): Promise<string> {
    const id = sessionId || `sess_${randomUUID().slice(0, 8)}`;
    
    if (this.sessions.has(id)) {
      return id; // Session already exists
    }

    // Конфигурация для выбранного режима прокси (AI control)
    const proxyConfig = this.getProxyConfigForMode(id);
    
    // Получить или создать User Agent для сессии
    let userAgent = this.userAgentRotationMap.get(id);
    if (!userAgent) {
      userAgent = getRandomUserAgent();
      this.userAgentRotationMap.set(id, userAgent);
    }
    
    const browser = await chromium.launch({
      headless: false, // Визуальный режим для наблюдения за автоматизацией
      slowMo: getHumanDelay(80, 150), // Рандомизированная задержка
      ...proxyConfig,
      args: [
        '--no-sandbox',
        '--disable-dev-shm-usage',
        '--disable-web-security',
        '--disable-features=VizDisplayCompositor',
        '--disable-blink-features=AutomationControlled',
        '--no-first-run',
        '--no-default-browser-check',
        '--disable-extensions-file-access-check',
        '--disable-extensions',
        '--allow-running-insecure-content',
        '--disable-component-extensions-with-background-pages',
        '--disable-ipc-flooding-protection',
        '--disable-backgrounding-occluded-windows',
        '--disable-renderer-backgrounding',
        '--disable-field-trial-config',
        '--disable-back-forward-cache',
        // Site Unblocker специальные настройки TLS
        '--ignore-ssl-errors',
        '--ignore-certificate-errors',
        '--ignore-certificate-errors-spki-list',
        '--disable-extensions-except',
        '--allow-running-insecure-content',
        '--disable-web-security',
        ...(proxyConfig.proxy ? [`--proxy-server=${proxyConfig.proxy.server}`] : [])
      ]
    });

    const context = await browser.newContext({
      viewport: { 
        width: 1920 + Math.floor(Math.random() * 100), 
        height: 1080 + Math.floor(Math.random() * 100) 
      }, // Рандомизированный размер окна
      userAgent: userAgent, // Используем рандомный User Agent
      javaScriptEnabled: true,
      ignoreHTTPSErrors: true,
      permissions: ['geolocation', 'notifications'], // Реальные разрешения
      extraHTTPHeaders: {
        'Accept-Language': 'en-US,en;q=0.9,ru;q=0.8',
        'Accept-Encoding': 'gzip, deflate, br',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Cache-Control': 'max-age=0',
        'Upgrade-Insecure-Requests': '1',
        // Site Unblocker специальные заголовки
        'X-SU-Session-Id': `unblocker-${id}-${Date.now()}`,
        'X-SU-Headless': 'html', // Включаем JavaScript rendering
        'X-SU-Status-Code': '200, 404, 403, 500', // Принимаем различные коды
        'DNT': '1',
        'Connection': 'keep-alive'
      },
      ...(proxyConfig.proxy ? {
        proxy: {
          server: proxyConfig.proxy.server,
          username: proxyConfig.proxy.username,
          password: proxyConfig.proxy.password
        }
      } : {})
    });

    const page = await context.newPage();

    // Добавляем антидетекцию скриптов
    await page.addInitScript(() => {
      // Удаляем webdriver property
      Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
      
      // Маскируем Playwright
      delete (window as any).playwright;
      delete (window as any).__playwright;
      
      // Фиксим languages
      Object.defineProperty(navigator, 'languages', {
        get: () => ['en-US', 'en', 'ru']
      });
      
      // Фиксим плагины
      Object.defineProperty(navigator, 'plugins', {
        get: () => [1, 2, 3, 4, 5] // Имитируем наличие плагинов
      });
    });

    const session: PlaywrightSession = {
      id,
      browser,
      context,
      page,
      createdAt: new Date()
    };

    this.sessions.set(id, session);
    console.log(`✅ Создана Playwright сессия: ${id} с User Agent: ${userAgent.slice(0, 50)}...`);
    
    return id;
  }

  async navigate(sessionId: string, url: string): Promise<string> {
    const session = await this.getOrCreateSession(sessionId);
    
    try {
      console.log(`🌐 Навигация к ${url} в сессии ${sessionId}`);
      
      // Увеличиваем таймаут для Site Unblocker
      await session.page.goto(url, {
        waitUntil: 'domcontentloaded', // Более быстрое условие
        timeout: 60000 // 60 секунд для Site Unblocker
      });
      
      // Дополнительно ждем загрузки контента через Site Unblocker
      try {
        await session.page.waitForLoadState('networkidle', { timeout: 20000 });
      } catch (timeoutError) {
        console.log(`⏱️ Тайм-аут networkidle, но страница загружена через Site Unblocker`);
      }
      
      // Дополнительная пауза для полной загрузки через прокси
      await session.page.waitForTimeout(3000);

      const currentUrl = session.page.url();
      const title = await session.page.title();
      
      // Проверяем успешность загрузки через ДЕКОДО
      const pageContent = await session.page.content();
      console.log(`📄 Проверка контента на ДЕКОДО ошибки: ${pageContent.substring(0, 200)}...`);
      
      const isDecodoError = pageContent.includes('"status":"failed"') || 
                           pageContent.includes('Url is not supported') ||
                           pageContent.includes('not supported') ||
                           pageContent.includes('{"status":"failed"') ||
                           pageContent.includes('message":"Url is not supported') ||
                           (pageContent.includes('status') && pageContent.includes('failed')) ||
                           (pageContent.trim().startsWith('{') && pageContent.includes('failed')) ||
                           title === '' || title === 'about:blank';
      
      console.log(`🔍 ДЕКОДО ошибка обнаружена: ${isDecodoError}`);
      
      if (currentUrl === 'about:blank' || currentUrl.includes('data:text/html') || 
          title.includes('not supported') || title.includes('error') || isDecodoError) {
        console.log(`⚠️ ДЕКОДО не поддерживает ${url}, переключаемся на прямое соединение`);
        
        // Fallback: создаем новую сессию без прокси
        await this.closeSession(sessionId);
        const fallbackSession = await this.createSessionWithoutProxy(sessionId);
        
        console.log(`🔄 Повторная навигация без ДЕКОДО к ${url}`);
        await fallbackSession.page.goto(url, {
          waitUntil: 'domcontentloaded',
          timeout: 30000
        });
        
        await fallbackSession.page.waitForTimeout(2000);
        
        const directUrl = fallbackSession.page.url();
        const directTitle = await fallbackSession.page.title();
        
        console.log(`✅ Успешная прямая навигация к: ${directUrl}`);
        return `Успешно перешли к ${directUrl}. Заголовок: ${directTitle} (без прокси)`;
      }
      
      console.log(`✅ Успешная навигация через ДЕКОДО к: ${currentUrl}`);
      return `Успешно перешли к ${currentUrl}. Заголовок: ${title}`;
      
    } catch (error) {
      console.error(`❌ Ошибка навигации через ДЕКОДО:`, error);
      
      // Fallback: пытаемся без прокси
      try {
        console.log(`🔄 Fallback: создаем сессию без ДЕКОДО для ${url}`);
        await this.closeSession(sessionId);
        const fallbackSession = await this.createSessionWithoutProxy(sessionId);
        
        await fallbackSession.page.goto(url, {
          waitUntil: 'domcontentloaded',
          timeout: 30000
        });
        
        await fallbackSession.page.waitForTimeout(2000);
        
        const directUrl = fallbackSession.page.url();
        const directTitle = await fallbackSession.page.title();
        
        console.log(`✅ Fallback навигация успешна: ${directUrl}`);
        return `Успешно перешли к ${directUrl}. Заголовок: ${directTitle} (прямое соединение)`;
        
      } catch (fallbackError) {
        console.error(`❌ Fallback навигация тоже не удалась:`, fallbackError);
        throw new Error(`Ошибка навигации: ${error instanceof Error ? error.message : 'Неизвестная ошибка'}`);
      }
    }
  }

  async screenshot(sessionId: string, fullPage: boolean = false): Promise<string> {
    const session = await this.getOrCreateSession(sessionId);
    
    try {
      console.log(`📸 Создание скриншота через Site Unblocker для сессии ${sessionId}`);
      
      const currentUrl = session.page.url();
      console.log(`🎯 Делаем скриншот страницы: ${currentUrl}`);
      
      // ИСПРАВЛЯЕМ: Site Unblocker не поддерживает X-SU-Headless через Node fetch
      // Возвращаемся к стандартному Playwright скриншоту через прокси
      console.log(`🔄 Используем Playwright с Site Unblocker прокси`);

      // Дополнительное ожидание для полной загрузки через прокси
      try {
        await session.page.waitForLoadState('domcontentloaded', { timeout: 10000 });
        await session.page.waitForTimeout(5000); // Увеличиваем время ожидания
        
        // Проверяем что страница не пустая
        const bodyText = await session.page.locator('body').textContent();
        console.log(`📄 Контент страницы (100 символов): ${bodyText?.slice(0, 100)}`);
        
        if (!bodyText || bodyText.trim().length < 50) {
          console.log(`⚠️ Страница может быть пустой, ждем еще...`);
          await session.page.waitForTimeout(3000);
          
          // Повторная проверка после ожидания
          const bodyTextAfterWait = await session.page.locator('body').textContent();
          if (!bodyTextAfterWait || bodyTextAfterWait.trim().length < 30) {
            console.log(`❌ Страница остается пустой, отказываемся от скриншота`);
            throw new Error('Отказано в создании скриншота: страница пустая или не загружена');
          }
        }
        
      } catch (error) {
        console.log(`⚠️ Продолжаем с частичной загрузкой`);
      }
      
      const screenshotDir = path.join(process.cwd(), 'public', 'screenshots');
      await fs.mkdir(screenshotDir, { recursive: true });
      
      const filename = `screenshot-${new Date().toISOString().replace(/[:.]/g, '-')}.png`;
      const filepath = path.join(screenshotDir, filename);
      
      await session.page.screenshot({
        path: filepath,
        fullPage,
        type: 'png'
      });
      
      const publicPath = `/screenshots/${filename}`;
      console.log(`✅ Скриншот через прокси сохранен: ${publicPath}`);
      
      return publicPath;
      
    } catch (error) {
      console.error(`❌ Ошибка Site Unblocker скриншота:`, error);
      // Fallback к обычному Playwright
      console.log(`🔄 Fallback к Playwright скриншоту`);
      
      try {
        const screenshotDir = path.join(process.cwd(), 'public', 'screenshots');
        await fs.mkdir(screenshotDir, { recursive: true });
        
        const filename = `screenshot-fallback-${new Date().toISOString().replace(/[:.]/g, '-')}.png`;
        const filepath = path.join(screenshotDir, filename);
        
        await session.page.screenshot({
          path: filepath,
          fullPage,
          type: 'png'
        });
        
        const publicPath = `/screenshots/${filename}`;
        console.log(`✅ Fallback скриншот сохранен: ${publicPath}`);
        
        return publicPath;
      } catch (fallbackError) {
        console.error(`❌ Ошибка fallback скриншота:`, fallbackError);
        throw new Error(`Ошибка скриншота: ${error instanceof Error ? error.message : 'Неизвестная ошибка'}`);
      }
    }
  }

  // Зональный скриншот - экран разбит на сетку 3x3 (зоны 1-9)
  async zoneScreenshot(sessionId: string, zone: number): Promise<string> {
    if (zone < 1 || zone > 9) {
      throw new Error('Zone must be between 1 and 9');
    }

    const session = await this.getOrCreateSession(sessionId);
    
    try {
      console.log(`📸🔍 Создание зонального скриншота зоны ${zone} для сессии ${sessionId}`);
      
      // Получаем размеры viewport
      const viewport = await session.page.viewportSize();
      if (!viewport) {
        throw new Error('Could not get viewport size');
      }

      const { width, height } = viewport;
      
      // Разбиваем экран на сетку 3x3
      const zoneWidth = Math.floor(width / 3);
      const zoneHeight = Math.floor(height / 3);
      
      // Определяем координаты зоны (нумерация слева направо, сверху вниз)
      // 1 2 3
      // 4 5 6  
      // 7 8 9
      const row = Math.floor((zone - 1) / 3);
      const col = (zone - 1) % 3;
      
      const x = col * zoneWidth;
      const y = row * zoneHeight;
      
      console.log(`🎯 Зона ${zone}: x=${x}, y=${y}, ширина=${zoneWidth}, высота=${zoneHeight}`);
      
      const screenshotDir = path.join(process.cwd(), 'public', 'screenshots');
      await fs.mkdir(screenshotDir, { recursive: true });
      
      const filename = `zone-${zone}-${new Date().toISOString().replace(/[:.]/g, '-')}.png`;
      const filepath = path.join(screenshotDir, filename);
      
      // Делаем скриншот определенной области
      await session.page.screenshot({
        path: filepath,
        clip: {
          x,
          y,
          width: zoneWidth,
          height: zoneHeight
        },
        type: 'png'
      });
      
      const publicPath = `/screenshots/${filename}`;
      console.log(`✅ Зональный скриншот зоны ${zone} сохранен: ${publicPath}`);
      
      return publicPath;
      
    } catch (error) {
      console.error(`❌ Ошибка при создании зонального скриншота:`, error);
      throw error;
    }
  }

  async getTitle(sessionId: string): Promise<string> {
    const session = await this.getOrCreateSession(sessionId);
    
    try {
      const title = await session.page.title();
      const url = session.page.url();
      console.log(`📄 Заголовок страницы: ${title} (${url})`);
      return `Заголовок: ${title}, URL: ${url}`;
    } catch (error) {
      console.error(`❌ Ошибка получения заголовка:`, error);
      throw new Error(`Ошибка получения заголовка: ${error instanceof Error ? error.message : 'Неизвестная ошибка'}`);
    }
  }

  async getVisibleText(sessionId: string): Promise<string> {
    const session = await this.getOrCreateSession(sessionId);
    
    try {
      const text = await session.page.locator('body').textContent();
      return text || 'Контент не найден';
    } catch (error) {
      console.error(`❌ Ошибка получения текста:`, error);
      throw new Error(`Ошибка получения текста: ${error instanceof Error ? error.message : 'Неизвестная ошибка'}`);
    }
  }

  // Человекоподобный клик с движением мыши
  async humanClick(sessionId: string, x: number, y: number): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) throw new Error('Сессия не найдена');

    const page = session.page;
    
    // Получаем текущую позицию мыши (или используем случайную начальную точку)
    const currentPosition = await page.evaluate(() => ({ 
      x: Math.random() * window.innerWidth, 
      y: Math.random() * window.innerHeight 
    }));
    
    // Генерируем человекоподобный путь
    const path = generateHumanMousePath(currentPosition.x, currentPosition.y, x, y);
    
    // Двигаем мышь по пути
    for (const point of path) {
      await page.mouse.move(point.x, point.y);
      await page.waitForTimeout(point.delay);
    }
    
    // Финальный клик с небольшой рандомной задержкой
    await page.waitForTimeout(getHumanDelay(30, 80));
    await page.mouse.click(x, y);
    
    // Держим фокус для ввода текста
    await page.waitForTimeout(getHumanDelay(50, 120));
  }

  // Человекоподобная печать с задержками
  async humanType(sessionId: string, text: string, selector?: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) throw new Error('Сессия не найдена');

    const page = session.page;
    
    // Если указан селектор, кликаем по элементу сначала
    if (selector) {
      const element = await page.locator(selector);
      const boundingBox = await element.boundingBox();
      if (boundingBox) {
        await this.humanClick(sessionId, 
          boundingBox.x + boundingBox.width / 2, 
          boundingBox.y + boundingBox.height / 2
        );
      }
    }
    
    // Печатаем каждый символ с человеческими задержками
    for (let i = 0; i < text.length; i++) {
      const char = text[i];
      await page.keyboard.type(char);
      
      // Рандомные задержки между символами (человеческая скорость печати)
      const delay = getHumanDelay(50, 150);
      // Иногда человек делает паузы при печати
      const pauseChance = Math.random();
      if (pauseChance > 0.85) {
        await page.waitForTimeout(getHumanDelay(200, 500)); // Пауза для размышлений
      } else {
        await page.waitForTimeout(delay);
      }
    }
  }

  // Человекоподобный скролл
  async humanScroll(sessionId: string, deltaY: number): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) throw new Error('Сессия не найдена');

    const page = session.page;
    
    // Скролл маленькими порциями как человек
    const steps = Math.abs(deltaY) / 100;
    const stepSize = deltaY > 0 ? 100 : -100;
    
    for (let i = 0; i < steps; i++) {
      await page.mouse.wheel(0, stepSize + Math.random() * 20 - 10); // Небольшая рандомизация
      await page.waitForTimeout(getHumanDelay(50, 150));
    }
  }

  // Ротация User Agent для существующей сессии
  async rotateUserAgent(sessionId: string): Promise<string> {
    const session = this.sessions.get(sessionId);
    if (!session) throw new Error('Сессия не найдена');

    const newUserAgent = getRandomUserAgent();
    this.userAgentRotationMap.set(sessionId, newUserAgent);
    
    // Обновляем User Agent в существующем контексте
    await session.page.setExtraHTTPHeaders({
      'User-Agent': newUserAgent
    });
    
    console.log(`🔄 Обновлен User Agent для сессии ${sessionId}: ${newUserAgent.slice(0, 50)}...`);
    return newUserAgent;
  }

  async closeSession(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (session) {
      await session.browser.close();
      this.sessions.delete(sessionId);
      this.userAgentRotationMap.delete(sessionId); // Очищаем User Agent
      console.log(`🔒 Закрыта сессия: ${sessionId}`);
    }
  }

  private async getOrCreateSession(sessionId: string): Promise<PlaywrightSession> {
    let session = this.sessions.get(sessionId);
    if (!session) {
      await this.createSession(sessionId);
      session = this.sessions.get(sessionId)!;
    }
    return session;
  }

  private getProxyConfig(): any {
    // Включаем Site Unblocker с исправленными настройками
    if (process.env.DECODO_USERNAME && process.env.DECODO_PASSWORD) {
      console.log('🔗 Используем Decodo Site Unblocker для обхода блокировок');
      return {
        proxy: {
          server: 'http://unblock.decodo.com:60000',
          username: process.env.DECODO_USERNAME,
          password: process.env.DECODO_PASSWORD
        }
      };
    }
    console.log('🔧 Работаем без прокси (тест режим)');
    return {};
  }

  // Создает сессию без прокси для fallback
  private async createSessionWithoutProxy(sessionId: string): Promise<PlaywrightSession> {
    console.log('🔄 Создаем fallback сессию без ДЕКОДО прокси');
    
    // Закрываем существующую сессию если есть
    await this.closeSession(sessionId);
    
    const userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
    
    // Запускаем браузер БЕЗ прокси
    const browser = await chromium.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox', 
        '--disable-dev-shm-usage',
        '--disable-web-security',
        '--disable-extensions',
        '--disable-plugins',
        '--disable-default-apps',
        '--disable-background-timer-throttling',
        '--disable-backgrounding-occluded-windows',
        '--disable-renderer-backgrounding',
        '--disable-field-trial-config',
        '--disable-back-forward-cache',
      ]
    });

    const context = await browser.newContext({
      userAgent,
      viewport: { width: 1920, height: 1080 },
      extraHTTPHeaders: {
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9,ru;q=0.8',
        'Accept-Encoding': 'gzip, deflate, br',
        'DNT': '1',
        'Connection': 'keep-alive',
        'Cache-Control': 'max-age=0',
        'Upgrade-Insecure-Requests': '1'
      }
    });

    const page = await context.newPage();

    // Маскировка автоматизации (с защитой от ошибок)
    try {
      await page.addInitScript(() => {
        delete (window as any).webdriver;
        
        Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
        delete (window as any).playwright;
        delete (window as any).__playwright;
        
        Object.defineProperty(navigator, 'languages', {
          get: () => ['en-US', 'en', 'ru']
        });
        
        Object.defineProperty(navigator, 'plugins', {
          get: () => [1, 2, 3, 4, 5]
        });
      });
    } catch (error) {
      console.log('⚠️ Не удалось установить маскировку автоматизации, продолжаем без неё:', error instanceof Error ? error.message : String(error));
    }

    const session: PlaywrightSession = {
      id: sessionId,
      browser,
      context,
      page,
      createdAt: new Date()
    };

    this.sessions.set(sessionId, session);
    console.log(`✅ Создана fallback сессия без прокси: ${sessionId}`);
    
    return session;
  }

  // Массово закрыть все браузерные сессии кроме указанной
  async closeAllSessionsExcept(keepSessionId?: string): Promise<void> {
    const sessionsToClose = Array.from(this.sessions.keys()).filter(id => id !== keepSessionId);
    console.log(`🧹 Закрываем ${sessionsToClose.length} браузерных сессий...`);
    
    for (const sessionId of sessionsToClose) {
      await this.closeSession(sessionId);
    }
    
    console.log(`✅ Осталось ${this.sessions.size} активных браузерных сессий`);
  }

  // Получить информацию о всех активных сессиях
  getActiveSessions(): Array<{id: string, createdAt: Date, url?: string}> {
    return Array.from(this.sessions.values()).map(session => ({
      id: session.id,
      createdAt: session.createdAt,
      url: session.page.url()
    }));
  }

  // AI PROXY MODE CONTROL - НОВЫЕ МЕТОДЫ ДЛЯ УПРАВЛЕНИЯ РЕЖИМАМИ

  // Отслеживание режимов прокси для каждой сессии
  private proxyModes = new Map<string, 'decodo' | 'direct'>();

  // AI может включить DECODO режим для обхода блокировок
  async enableDecodoMode(sessionId: string): Promise<{success: boolean, message: string}> {
    try {
      console.log(`🔄 AI переключает сессию ${sessionId} на DECODO режим`);
      
      // Закрываем текущую сессию
      await this.closeSession(sessionId);
      
      // Устанавливаем режим на DECODO  
      this.proxyModes.set(sessionId, 'decodo');
      
      // Создаем новую сессию с DECODO прокси
      await this.createSession(sessionId);
      
      return {
        success: true, 
        message: 'DECODO proxy enabled - can access blocked sites'
      };
    } catch (error) {
      console.error(`❌ Ошибка переключения на DECODO:`, error);
      return {
        success: false,
        message: `Failed to enable DECODO: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
    }
  }

  // AI может включить прямое соединение если DECODO не работает
  async enableDirectMode(sessionId: string): Promise<{success: boolean, message: string}> {
    try {
      console.log(`🔄 AI переключает сессию ${sessionId} на прямое соединение`);
      
      // Закрываем текущую сессию
      await this.closeSession(sessionId);
      
      // Устанавливаем режим на прямой
      this.proxyModes.set(sessionId, 'direct');
      
      // Создаем сессию без прокси
      await this.createSessionWithoutProxy(sessionId);
      
      return {
        success: true,
        message: 'Direct mode enabled - bypassing proxy'
      };
    } catch (error) {
      console.error(`❌ Ошибка переключения на прямой режим:`, error);
      return {
        success: false,
        message: `Failed to enable direct mode: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
    }
  }

  // AI может проверить текущий статус прокси
  async getProxyStatus(sessionId: string): Promise<{success: boolean, message: string}> {
    try {
      const currentMode = this.proxyModes.get(sessionId) || 'unknown';
      const sessionExists = this.sessions.has(sessionId);
      
      let statusMessage = '';
      if (currentMode === 'decodo') {
        statusMessage = 'DECODO proxy active - can access blocked sites';
      } else if (currentMode === 'direct') {
        statusMessage = 'Direct mode active - no proxy';
      } else {
        statusMessage = 'Unknown proxy mode';
      }

      if (!sessionExists) {
        statusMessage += ' (session not created yet)';
      }

      console.log(`📊 Статус прокси для ${sessionId}: ${statusMessage}`);
      
      return {
        success: true,
        message: statusMessage
      };
    } catch (error) {
      console.error(`❌ Ошибка получения статуса прокси:`, error);
      return {
        success: false,
        message: `Failed to get proxy status: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
    }
  }

  // Обновленная логика создания сессии с учетом выбранного режима
  private getProxyConfigForMode(sessionId: string): any {
    const mode = this.proxyModes.get(sessionId);
    
    if (mode === 'direct') {
      console.log(`🔧 Создаем сессию ${sessionId} в прямом режиме (без прокси)`);
      return {};
    } else {
      // По умолчанию или режим 'decodo'
      return this.getProxyConfig();
    }
  }
}

export const playwrightService = new PlaywrightService();