export interface HumanBehaviorConfig {
  behaviorProfile: string;
  mouseSpeed: number;
  typingSpeed: number;
  humanDelays: boolean;
  headless: boolean;
  browserTimeout: number;
  stealthMode: boolean;
  viewport: {
    width: number;
    height: number;
  };
}

export interface HumanActionParams {
  url?: string;
  selector?: string;
  text?: string;
  x?: number;
  y?: number;
  clearFirst?: boolean;
  timeout?: number;
  direction?: 'up' | 'down' | 'to_element';
  distance?: number;
  code?: string;
  type?: 'micro' | 'normal' | 'reading' | 'thinking';
  duration?: number;
}

export interface HumanActionResult {
  success: boolean;
  url?: string;
  title?: string;
  screenshot?: string;
  timestamp?: string;
  clicked?: { x: number; y: number };
  typed?: string;
  paused?: number;
  duration?: number;
  error?: string;
  data?: any; // For JavaScript evaluation results and other data
}

export interface HumanAction {
  type: string;
  params?: HumanActionParams;
}

export class HumanBehaviorAutomation {
  public browser: any;
  public page: any;
  public context: any;
  public rng: () => number;
  public config: HumanBehaviorConfig;

  constructor();
  
  initBrowser(): Promise<boolean>;
  setupHumanBehaviors(): Promise<void>;
  executeHumanCommand(action: HumanAction): Promise<HumanActionResult>;
  
  humanNavigate(url: string): Promise<HumanActionResult>;
  humanScreenshot(): Promise<HumanActionResult>;
  humanClick(params: HumanActionParams): Promise<HumanActionResult>;
  humanType(params: HumanActionParams): Promise<HumanActionResult>;
  humanTypeText(selector: string, text: string): Promise<void>;
  humanMouseMove(targetX: number, targetY: number): Promise<void>;
  humanWaitFor(params: HumanActionParams): Promise<HumanActionResult>;
  humanScroll(params: HumanActionParams): Promise<HumanActionResult>;
  humanCoordsClick(params: HumanActionParams): Promise<HumanActionResult>;
  humanPause(params: HumanActionParams): Promise<HumanActionResult>;
  simulateReading(params?: HumanActionParams): Promise<HumanActionResult>;
  
  getTypingDelay(): number;
  randomBetween(min: number, max: number): number;
  randomDelay(min: number, max: number): Promise<void>;
  close(): Promise<void>;
  
  static cleanup(): Promise<void>;
}