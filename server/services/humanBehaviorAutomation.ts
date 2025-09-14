import { chromium, Browser, BrowserContext, Page } from 'playwright';
import type { 
  HumanBehaviorConfig, 
  HumanActionParams, 
  HumanActionResult, 
  HumanAction 
} from './humanBehaviorAutomation.d';

interface MousePosition {
  x: number;
  y: number;
}

interface BehaviorProfile {
  clickDelay: [number, number];
  typeSpeed: [number, number];
  mouseSpeed: number;
}

interface BehaviorProfiles {
  fast: BehaviorProfile;
  normal: BehaviorProfile;
  slow: BehaviorProfile;
}

interface HumanMouseMoveOptions {
  duration?: number;
  steps?: number;
}

interface HumanTypeOptions {
  clearFirst?: boolean;
  pasteChance?: number;
}

interface PauseTypes {
  micro: [number, number];
  normal: [number, number];
  reading: [number, number];
  thinking: [number, number];
}

/**
 * Human-like Browser Automation with Playwright
 * Mimics realistic user behavior patterns
 */
export class HumanBehaviorAutomation {
  public browser: Browser | null = null;
  public context: BrowserContext | null = null;
  public page: Page | null = null;
  public rng: () => number;
  public config: HumanBehaviorConfig;

  private mousePosition: MousePosition = { x: 0, y: 0 };
  private behaviorProfiles: BehaviorProfiles;
  private currentProfile: keyof BehaviorProfiles = 'normal';

  constructor(config?: Partial<HumanBehaviorConfig>) {
    this.config = {
      behaviorProfile: config?.behaviorProfile || 'normal',
      mouseSpeed: config?.mouseSpeed || 5,
      typingSpeed: config?.typingSpeed || 200,
      humanDelays: config?.humanDelays ?? true,
      headless: config?.headless ?? false,
      browserTimeout: config?.browserTimeout || 30000,
      stealthMode: config?.stealthMode ?? true,
      viewport: config?.viewport || { width: 1920, height: 1080 }
    };

    this.rng = Math.random;
    
    this.behaviorProfiles = {
      fast: { clickDelay: [50, 150], typeSpeed: [80, 120], mouseSpeed: 8 },
      normal: { clickDelay: [200, 500], typeSpeed: [150, 250], mouseSpeed: 5 },
      slow: { clickDelay: [800, 1500], typeSpeed: [300, 600], mouseSpeed: 2 }
    };

    this.currentProfile = this.config.behaviorProfile as keyof BehaviorProfiles;
  }

  async initBrowser(): Promise<boolean> {
    try {
      this.browser = await chromium.launch({
        headless: this.config.headless,
        timeout: this.config.browserTimeout,
        args: [
          '--disable-blink-features=AutomationControlled',
          '--disable-features=VizDisplayCompositor',
          '--disable-ipc-flooding-protection',
          '--no-first-run',
          '--disable-background-timer-throttling',
          '--disable-backgrounding-occluded-windows',
          '--disable-renderer-backgrounding'
        ]
      });

      this.context = await this.browser.newContext({
        viewport: this.config.viewport,
        userAgent: this.getRandomUserAgent(),
        locale: 'ru-RU',
        timezoneId: 'Europe/Moscow',
        permissions: ['geolocation', 'notifications'],
        colorScheme: 'light'
      });

      this.page = await this.context.newPage();

      if (this.config.stealthMode) {
        await this.injectStealthScripts();
      }

      // Initialize random mouse position
      this.mousePosition = {
        x: Math.random() * 800 + 100,
        y: Math.random() * 600 + 100
      };

      if (this.page) {
        await this.page.mouse.move(this.mousePosition.x, this.mousePosition.y);
      }

      return true;
    } catch (error) {
      console.error('[HumanBot] Browser initialization failed:', error);
      return false;
    }
  }

  private async injectStealthScripts(): Promise<void> {
    if (!this.page) return;

    await this.page.addInitScript(() => {
      // Remove webdriver property
      Object.defineProperty(navigator, 'webdriver', {
        get: () => undefined,
      });

      // Hide automation
      try {
        const proto = Object.getPrototypeOf(navigator) as any;
        if (proto && 'webdriver' in proto) {
          delete proto.webdriver;
        }
      } catch (e) {
        // Ignore if unable to access prototype
      }

      // Fix permissions API
      const originalQuery = window.navigator.permissions.query;
      window.navigator.permissions.query = (parameters: PermissionDescriptor) => {
        if (parameters.name === 'notifications') {
          return Promise.resolve({ 
            state: Notification.permission,
            name: 'notifications',
            onchange: null,
            addEventListener: () => {},
            removeEventListener: () => {},
            dispatchEvent: () => false
          } as unknown as PermissionStatus);
        }
        return originalQuery(parameters);
      };

      // Mock plugins
      Object.defineProperty(navigator, 'plugins', {
        get: () => new Array(5).fill(null).map((_, i) => ({ name: `Plugin${i}` })),
      });

      // Fix languages
      Object.defineProperty(navigator, 'languages', {
        get: () => ['ru-RU', 'ru', 'en-US', 'en'],
      });

      // Add noise to canvas fingerprint
      const getContext = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = function(contextId: any, options?: any): any {
        const context = getContext.call(this, contextId, options);
        
        if (contextId === '2d' && context) {
          const ctx = context as CanvasRenderingContext2D;
          const originalFillText = ctx.fillText;
          
          ctx.fillText = function(text: string, x: number, y: number, maxWidth?: number) {
            // Add micro-noise
            const noise = Math.random() * 0.0001;
            const noisyX = x + noise;
            const noisyY = y + noise;
            
            if (maxWidth !== undefined) {
              return originalFillText.call(this, text, noisyX, noisyY, maxWidth);
            }
            return originalFillText.call(this, text, noisyX, noisyY);
          };
        }
        
        return context;
      };
    });
  }

  private getRandomUserAgent(): string {
    const userAgents = [
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    ];
    return userAgents[Math.floor(Math.random() * userAgents.length)];
  }

  // Human-like mouse movement using Bezier curves
  private async humanMouseMove(targetX: number, targetY: number, options: HumanMouseMoveOptions = {}): Promise<void> {
    if (!this.page) throw new Error('Browser not initialized');

    const startX = this.mousePosition.x;
    const startY = this.mousePosition.y;

    const { duration = this.randomBetween(800, 1500), steps = 20 } = options;

    // Create Bezier curve for natural movement
    const controlPoint1X = startX + (targetX - startX) * 0.25 + this.randomBetween(-100, 100);
    const controlPoint1Y = startY + (targetY - startY) * 0.25 + this.randomBetween(-100, 100);
    const controlPoint2X = startX + (targetX - startX) * 0.75 + this.randomBetween(-100, 100);
    const controlPoint2Y = startY + (targetY - startY) * 0.75 + this.randomBetween(-100, 100);

    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      
      // Cubic Bezier curve
      const x = Math.pow(1 - t, 3) * startX +
                3 * Math.pow(1 - t, 2) * t * controlPoint1X +
                3 * (1 - t) * Math.pow(t, 2) * controlPoint2X +
                Math.pow(t, 3) * targetX;
                
      const y = Math.pow(1 - t, 3) * startY +
                3 * Math.pow(1 - t, 2) * t * controlPoint1Y +
                3 * (1 - t) * Math.pow(t, 2) * controlPoint2Y +
                Math.pow(t, 3) * targetY;

      // Add micro-jitter
      const jitterX = this.randomBetween(-2, 2);
      const jitterY = this.randomBetween(-2, 2);

      await this.page.mouse.move(x + jitterX, y + jitterY);
      
      // Vary movement speed
      const stepDelay = duration / steps + this.randomBetween(-20, 20);
      await this.sleep(stepDelay);
    }

    this.mousePosition = { x: targetX, y: targetY };
  }

  // Human-like click with pre-actions (internal implementation)
  private async performHumanClick(selector: string, options: HumanActionParams = {}): Promise<void> {
    if (!this.page) throw new Error('Browser not initialized');

    const element = await this.page.locator(selector).first();
    const box = await element.boundingBox();

    if (!box) {
      throw new Error(`Element ${selector} not found or not visible`);
    }

    // Random point inside element (not center)
    const clickX = box.x + box.width * (0.3 + Math.random() * 0.4);
    const clickY = box.y + box.height * (0.3 + Math.random() * 0.4);

    // 1. Move mouse to element
    await this.humanMouseMove(clickX, clickY);

    // 2. Pause before hover
    await this.sleep(this.randomBetween(50, 200));

    // 3. Hover for CSS effects
    await this.page.hover(selector);
    await this.sleep(this.randomBetween(100, 300));

    // 4. Sometimes micro-move before click
    if (Math.random() > 0.7) {
      const microMoveX = clickX + this.randomBetween(-5, 5);
      const microMoveY = clickY + this.randomBetween(-5, 5);
      await this.page.mouse.move(microMoveX, microMoveY);
      await this.sleep(this.randomBetween(50, 150));
    }

    // 5. Human click with variable duration
    const mouseDownDuration = this.randomBetween(80, 180);
    await this.page.mouse.down();
    await this.sleep(mouseDownDuration);
    await this.page.mouse.up();

    // 6. Pause after click (reaction time)
    const profile = this.behaviorProfiles[this.currentProfile];
    await this.sleep(this.randomBetween(...profile.clickDelay));
  }

  // Human-like text typing (internal implementation)
  private async performHumanType(selector: string, text: string, options: HumanTypeOptions = {}): Promise<void> {
    if (!this.page) throw new Error('Browser not initialized');

    const { clearFirst = true, pasteChance = 0.1 } = options;

    // Focus on field
    await this.performHumanClick(selector);
    await this.sleep(this.randomBetween(100, 300));

    if (clearFirst) {
      // Select all and delete
      await this.page.keyboard.press('Control+a');
      await this.sleep(this.randomBetween(50, 150));
      await this.page.keyboard.press('Delete');
      await this.sleep(this.randomBetween(100, 200));
    }

    // Sometimes paste entire text (like copying)
    if (text.length > 20 && Math.random() < pasteChance) {
      await this.pasteText(text);
      return;
    }

    // Type character by character with human pauses
    const profile = this.behaviorProfiles[this.currentProfile];

    for (let i = 0; i < text.length; i++) {
      const char = text[i];
      
      // Sometimes make mistakes and correct them
      if (Math.random() < 0.02 && i > 0) { // 2% chance
        await this.makeTypingMistake(char);
      }
      
      await this.page.keyboard.type(char);
      
      // Vary typing speed
      let delay = this.randomBetween(...profile.typeSpeed);
      
      // Pause after spaces and punctuation
      if (char === ' ') delay *= 1.5;
      if (['.', ',', '!', '?'].includes(char)) delay *= 2;
      
      await this.sleep(delay);
    }
  }

  private async makeTypingMistake(correctChar: string): Promise<void> {
    if (!this.page) return;

    // Type wrong character
    const wrongChars = 'qwertyuiopasdfghjklzxcvbnm';
    const wrongChar = wrongChars[Math.floor(Math.random() * wrongChars.length)];

    await this.page.keyboard.type(wrongChar);
    await this.sleep(this.randomBetween(200, 500)); // Realize mistake

    // Delete wrong character
    await this.page.keyboard.press('Backspace');
    await this.sleep(this.randomBetween(100, 200));

    // Type correct character
    await this.page.keyboard.type(correctChar);
  }

  private async pasteText(text: string): Promise<void> {
    if (!this.page) return;

    // Simulate clipboard paste
    await this.page.evaluate((text) => {
      navigator.clipboard.writeText(text);
    }, text);

    await this.sleep(this.randomBetween(100, 300));
    await this.page.keyboard.press('Control+v');
    await this.sleep(this.randomBetween(200, 500));
  }

  // Human-like scrolling (internal implementation)
  private async performHumanScroll(direction: 'up' | 'down' = 'down', distance?: number): Promise<void> {
    if (!this.page) throw new Error('Browser not initialized');

    const scrollAmount = distance || this.randomBetween(300, 800);
    const scrollSteps = Math.floor(scrollAmount / 100);

    for (let i = 0; i < scrollSteps; i++) {
      if (direction === 'down') {
        await this.page.mouse.wheel(0, 100);
      } else {
        await this.page.mouse.wheel(0, -100);
      }
      
      // Vary scroll speed
      await this.sleep(this.randomBetween(50, 150));
    }

    // Pause after scroll
    await this.sleep(this.randomBetween(300, 700));
  }

  // Simulate reading page (internal implementation)
  private async performSimulateReading(duration?: number): Promise<void> {
    if (!this.page) return;

    const readingTime = duration || this.randomBetween(2000, 5000);
    const startTime = Date.now();

    while (Date.now() - startTime < readingTime) {
      // Random micro-movements (like when reading)
      const currentX = this.mousePosition.x;
      const currentY = this.mousePosition.y;
      
      const newX = currentX + this.randomBetween(-50, 50);
      const newY = currentY + this.randomBetween(-30, 30);
      
      await this.page.mouse.move(newX, newY);
      this.mousePosition = { x: newX, y: newY };
      
      await this.sleep(this.randomBetween(500, 1500));
      
      // Sometimes small scroll
      if (Math.random() < 0.3) {
        await this.page.mouse.wheel(0, this.randomBetween(50, 150));
        await this.sleep(this.randomBetween(200, 500));
      }
    }
  }

  // Random human pauses between actions (internal implementation)
  private async performHumanPause(type: keyof PauseTypes = 'normal'): Promise<void> {
    const pauseTypes: PauseTypes = {
      micro: [50, 200],      // Micro-pauses
      normal: [500, 1500],   // Normal thinking
      reading: [2000, 5000], // Reading content
      thinking: [3000, 8000] // Deep thinking
    };

    const pauseRange = pauseTypes[type];
    if (pauseRange) {
      await this.sleep(this.randomBetween(...pauseRange));
    }
  }

  // Simulate action verification
  private async verifyAction(): Promise<boolean> {
    // Pause as if checking what happened
    await this.sleep(this.randomBetween(500, 1200));

    // Sometimes take screenshot for "verification"
    if (Math.random() < 0.1 && this.page) {
      await this.page.screenshot({ path: `/tmp/verify_${Date.now()}.png` });
    }

    return true;
  }

  // Utility methods
  randomBetween(min: number, max: number): number {
    return Math.floor(this.rng() * (max - min + 1)) + min;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  setBehaviorProfile(profile: keyof BehaviorProfiles): void {
    if (this.behaviorProfiles[profile]) {
      this.currentProfile = profile;
    }
  }

  getTypingDelay(): number {
    const profile = this.behaviorProfiles[this.currentProfile];
    return this.randomBetween(...profile.typeSpeed);
  }

  async randomDelay(min: number, max: number): Promise<void> {
    await this.sleep(this.randomBetween(min, max));
  }

  // Advanced commands with human-like behavior
  async executeHumanCommand(command: HumanAction): Promise<HumanActionResult> {
    // Add random pause before each action
    await this.performHumanPause('micro');

    try {
      switch (command.type) {
        case 'navigate':
          return await this.humanNavigate(command.params?.url || '');

        case 'screenshot':
          return await this.humanScreenshot();

        case 'click':
          return await this.humanClick(command.params || {});

        case 'type':
          return await this.humanType(command.params || {});

        case 'scroll':
          return await this.humanScroll(command.params || {});

        case 'wait_for':
          return await this.humanWaitFor(command.params || {});

        case 'eval_js':
          if (!this.page || !command.params?.code) {
            throw new Error('Page not initialized or code missing');
          }
          const evalResult = await this.page.evaluate(command.params.code);
          return { success: true, data: evalResult };

        case 'coords_click':
          return await this.humanCoordsClick(command.params || {});

        case 'get_url':
          const url = this.page?.url() || '';
          return { success: true, url };

        case 'get_title':
          const title = await this.page?.title() || '';
          return { success: true, title };

        case 'human_pause':
          return await this.humanPause(command.params || {});

        case 'simulate_reading':
          return await this.simulateReading(command.params);

        default:
          throw new Error(`Unknown command type: ${command.type}`);
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  // Individual command implementations matching the interface
  async humanNavigate(url: string): Promise<HumanActionResult> {
    if (!this.page || !url) {
      return { success: false, error: 'Page not initialized or URL missing' };
    }

    try {
      await this.page.goto(url, { 
        waitUntil: 'networkidle',
        timeout: this.config.browserTimeout 
      });
      await this.performSimulateReading();
      
      return { 
        success: true, 
        url: this.page.url(),
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Navigation failed'
      };
    }
  }

  async humanScreenshot(): Promise<HumanActionResult> {
    if (!this.page) {
      return { success: false, error: 'Page not initialized' };
    }

    try {
      await this.performHumanPause('micro');
      const screenshot = await this.page.screenshot({ 
        fullPage: false,
        type: 'png'
      });
      
      return { 
        success: true, 
        screenshot: screenshot.toString('base64'),
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Screenshot failed'
      };
    }
  }

  async humanClick(params: HumanActionParams): Promise<HumanActionResult> {
    try {
      if (params.selector) {
        await this.performHumanClick(params.selector, params);
      } else if (params.x !== undefined && params.y !== undefined) {
        await this.humanMouseMove(params.x, params.y);
        if (this.page) {
          await this.page.mouse.click(params.x, params.y);
        }
      } else {
        throw new Error('Either selector or coordinates required');
      }

      await this.verifyAction();
      return { 
        success: true,
        clicked: params.x !== undefined && params.y !== undefined 
          ? { x: params.x, y: params.y } 
          : undefined
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Click failed'
      };
    }
  }

  async humanType(params: HumanActionParams): Promise<HumanActionResult> {
    if (!params.selector || !params.text) {
      return { success: false, error: 'Selector and text required' };
    }

    try {
      await this.performHumanType(params.selector, params.text, params);
      return { 
        success: true,
        typed: params.text
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Type failed'
      };
    }
  }

  async humanTypeText(selector: string, text: string): Promise<void> {
    await this.performHumanType(selector, text);
  }

  async humanWaitFor(params: HumanActionParams): Promise<HumanActionResult> {
    if (!this.page || !params.selector) {
      return { success: false, error: 'Page not initialized or selector missing' };
    }

    try {
      await this.page.waitForSelector(params.selector, {
        timeout: params.timeout || 10000
      });
      await this.performHumanPause('micro');
      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Wait failed'
      };
    }
  }

  async humanScroll(params: HumanActionParams): Promise<HumanActionResult> {
    try {
      await this.performHumanScroll(params.direction as 'up' | 'down', params.distance);
      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Scroll failed'
      };
    }
  }

  async humanCoordsClick(params: HumanActionParams): Promise<HumanActionResult> {
    if (params.x === undefined || params.y === undefined) {
      return { success: false, error: 'Coordinates required' };
    }

    try {
      await this.humanMouseMove(params.x, params.y);
      if (this.page) {
        await this.page.mouse.click(params.x, params.y);
      }
      return { 
        success: true,
        clicked: { x: params.x, y: params.y }
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Coords click failed'
      };
    }
  }

  async humanPause(params: HumanActionParams): Promise<HumanActionResult> {
    try {
      const pauseType = (params.type as keyof PauseTypes) || 'normal';
      await this.performHumanPause(pauseType);
      return { 
        success: true,
        paused: params.duration || this.randomBetween(500, 1500)
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Pause failed'
      };
    }
  }

  async simulateReading(params?: HumanActionParams): Promise<HumanActionResult> {
    try {
      await this.performSimulateReading(params?.duration);
      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Reading simulation failed'
      };
    }
  }

  async setupHumanBehaviors(): Promise<void> {
    // Initialize any additional human behavior patterns
    console.log('[HumanBot] Human behaviors initialized');
  }

  async close(): Promise<void> {
    try {
      if (this.browser) {
        await this.browser.close();
        this.browser = null;
        this.context = null;
        this.page = null;
        console.log('[HumanBot] Browser closed');
      }
    } catch (error) {
      console.error('[HumanBot] Error closing browser:', error);
    }
  }

  static async cleanup(): Promise<void> {
    console.log('[HumanBot] Static cleanup completed');
  }
}

// Export for use in other modules
export default HumanBehaviorAutomation;