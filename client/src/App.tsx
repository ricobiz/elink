import { useState, useEffect } from "react";
import { Route, Router, Switch, useLocation } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { ThemeProvider } from "@/components/theme-provider";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import UnifiedTriangleStatus from "@/components/UnifiedTriangleStatus";
import { LanguageProvider, useLanguage } from "@/hooks/useLanguage";
import ChatPage from "@/pages/ChatPage";
import Dashboard from "@/pages/dashboard";
import NotFound from "@/pages/not-found";
import ModelSelector from "@/components/ModelSelector";
import { Globe, HelpCircle, Trash2, Bot, MessageCircle, Copy, Check, ChevronUp, ChevronDown, Menu, ArrowRight, X } from "lucide-react";

// Helper functions for session number formatting
const extractSessionNumber = (sessionId: string): string => {
  if (!sessionId) return '';
  return sessionId.startsWith('sess_') ? sessionId.slice(5) : sessionId;
};

const formatSessionId = (sessionNumber: string): string => {
  if (!sessionNumber) return '';
  return sessionNumber.startsWith('sess_') ? sessionNumber : `sess_${sessionNumber}`;
};

const isValidSessionNumber = (value: string): boolean => {
  return /^\d+$/.test(value) && value.length > 0;
};

function MobileNavigation({ 
  activeSession, 
  onSessionChange,
  automationMode,
  setAutomationMode,
  selectedModel,
  setSelectedModel,
  onClearSession,
  isThinking = false,
  isCollapsed = false,
  onCollapseChange
}: { 
  activeSession: string, 
  onSessionChange: (sessionId: string) => void,
  automationMode: boolean,
  setAutomationMode: (mode: boolean) => void,
  selectedModel: string,
  setSelectedModel: (model: string) => void,
  onClearSession: () => void,
  isThinking?: boolean,
  isCollapsed?: boolean,
  onCollapseChange?: (collapsed: boolean) => void
}) {
  const [location, setLocation] = useLocation();
  const { language, setLanguage, t } = useLanguage();
  const [sessionInput, setSessionInput] = useState('');
  const [copiedSession, setCopiedSession] = useState(false);
  const [isEditingSession, setIsEditingSession] = useState(false);
  const [editSessionValue, setEditSessionValue] = useState('');
  // Mobile nav: isCollapsed state moved to parent AppRouter component
  const { toast } = useToast();

  const handleCopySession = async () => {
    if (!activeSession) return;
    
    const sessionNumber = extractSessionNumber(activeSession);
    
    try {
      await navigator.clipboard.writeText(sessionNumber);
      setCopiedSession(true);
      toast({
        title: "Session copied",
        description: `Session number "${sessionNumber}" copied to clipboard`,
      });
      setTimeout(() => setCopiedSession(false), 2000);
    } catch (err) {
      toast({
        title: "Copy failed",
        description: "Failed to copy session number",
        variant: "destructive",
      });
    }
  };

  const handleStartEditingSession = () => {
    if (!activeSession) return;
    setEditSessionValue(extractSessionNumber(activeSession));
    setIsEditingSession(true);
  };

  const handleSaveSessionEdit = () => {
    // Only change session and show toast if session number is actually different
    if (isDifferentSession) {
      onSessionChange(formatSessionId(editSessionValue));
      toast({
        title: "Session changed",
        description: `Switched to session ${editSessionValue}`,
      });
    }
    // Always exit edit mode
    setIsEditingSession(false);
    setEditSessionValue('');
  };

  const handleCancelSessionEdit = () => {
    setIsEditingSession(false);
    setEditSessionValue('');
  };

  const handleSessionEditKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSaveSessionEdit();
    } else if (e.key === 'Escape') {
      handleCancelSessionEdit();
    }
  };

  // Check if the entered session number is different from current
  const isDifferentSession = editSessionValue && 
    isValidSessionNumber(editSessionValue) && 
    editSessionValue !== extractSessionNumber(activeSession);
  
  return (
    <>
      {/* Mobile header - Fixed with higher z-index */}
      <div className={`fixed top-0 left-0 right-0 md:hidden border-b bg-card/95 backdrop-blur-sm z-[90] transition-all duration-300 ${
        isCollapsed ? 'transform -translate-y-full opacity-0' : 'transform translate-y-0 opacity-100'
      }`}>
        <div className="w-full flex items-center p-2">
          {/* Left section - Status */}
          <div className="flex items-center space-x-1 flex-1">
            <UnifiedTriangleStatus 
              activeSession={activeSession}
              selectedModel={selectedModel}
              automationMode={automationMode}
              isThinking={isThinking}
              onStopAutomation={() => setAutomationMode(false)}
            />
          </div>
          
          {/* Center section - Active session display */}
          <div className="flex items-center space-x-2 mx-2">
            {activeSession ? (
              isEditingSession ? (
                <div className="flex items-center space-x-1">
                  <Input
                    value={editSessionValue}
                    onChange={(e) => {
                      const value = e.target.value;
                      if (value === '' || /^\d+$/.test(value)) {
                        setEditSessionValue(value);
                      }
                    }}
                    onKeyDown={handleSessionEditKeyDown}
                    className="h-8 w-20 text-xs px-2 text-blue-400 bg-blue-950/20 border border-blue-500/30 rounded"
                    placeholder="Session"
                    autoFocus
                    data-testid="input-session-edit-mobile"
                  />
                  {isDifferentSession && (
                    <Button
                      onClick={handleSaveSessionEdit}
                      size="sm"
                      variant="default"
                      className="h-8 w-8 p-0 bg-green-600 hover:bg-green-700 border-green-500 text-white"
                      title={`Go to session ${editSessionValue}`}
                      data-testid="button-confirm-session-mobile"
                    >
                      <ArrowRight size={12} />
                    </Button>
                  )}
                  <Button
                    onClick={handleCancelSessionEdit}
                    size="sm"
                    variant="ghost"
                    className="h-8 w-8 p-0 text-gray-400 hover:text-gray-300 hover:bg-gray-800/50"
                    title="Cancel editing"
                    data-testid="button-cancel-session-mobile"
                  >
                    <X size={12} />
                  </Button>
                </div>
              ) : (
                <Button
                  onClick={handleStartEditingSession}
                  onDoubleClick={handleCopySession}
                  size="sm"
                  variant="ghost"
                  className="h-8 px-2 text-xs text-blue-400 hover:text-blue-300 hover:bg-blue-950/20 border border-blue-500/30 rounded"
                  title="Click to edit, double-click to copy"
                  data-testid="button-session-edit-mobile"
                >
                  <span className="mr-1">Session: {extractSessionNumber(activeSession)}</span>
                  {copiedSession ? (
                    <Check size={12} className="text-green-400" />
                  ) : (
                    <Copy size={12} />
                  )}
                </Button>
              )
            ) : (
              <div className="text-xs text-muted-foreground">No session</div>
            )}
          </div>

          {/* Right section - Controls */}
          <div className="flex items-center space-x-1">
            {/* Clear Session */}
            {activeSession && (
              <Button
                onClick={onClearSession}
                size="sm"
                variant="outline"
                className="h-8 w-8 p-0 text-red-400 hover:text-red-300 border-red-400"
                title="Очистить сессию"
                data-testid="button-clear-session-mobile"
              >
                <Trash2 size={12} />
              </Button>
            )}
            
            {/* Collapse/Expand Toggle */}
            <Button
              onClick={() => onCollapseChange?.(!isCollapsed)}
              size="sm"
              variant="ghost"
              className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground"
              title={isCollapsed ? "Show navigation panel" : "Hide navigation panel"}
              data-testid="button-toggle-nav-mobile"
            >
              <ChevronUp size={12} className={`transition-transform duration-200 ${isCollapsed ? 'rotate-180' : ''}`} />
            </Button>
          </div>
        </div>
      </div>
    </>
  );
}

function DesktopNavigation({
  activeSession,
  onSessionChange,
  automationMode,
  setAutomationMode,
  selectedModel,
  setSelectedModel,
  onClearSession,
  isThinking = false,
  isCollapsed = false,
  onCollapseChange
}: {
  activeSession: string,
  onSessionChange: (sessionId: string) => void,
  automationMode: boolean,
  setAutomationMode: (mode: boolean) => void,
  selectedModel: string,
  setSelectedModel: (model: string) => void,
  onClearSession: () => void,
  isThinking?: boolean,
  isCollapsed?: boolean,
  onCollapseChange?: (collapsed: boolean) => void
}) {
  const [location, setLocation] = useLocation();
  const { language, setLanguage, t } = useLanguage();
  const [sessionInput, setSessionInput] = useState('');
  const [copiedSession, setCopiedSession] = useState(false);
  const [isEditingSession, setIsEditingSession] = useState(false);
  const [editSessionValue, setEditSessionValue] = useState('');
  // Desktop nav: isCollapsed state moved to parent AppRouter component
  const { toast } = useToast();

  const handleCopySession = async () => {
    if (!activeSession) return;
    
    const sessionNumber = extractSessionNumber(activeSession);
    
    try {
      await navigator.clipboard.writeText(sessionNumber);
      setCopiedSession(true);
      toast({
        title: "Session copied",
        description: `Session number "${sessionNumber}" copied to clipboard`,
      });
      setTimeout(() => setCopiedSession(false), 2000);
    } catch (err) {
      toast({
        title: "Copy failed",
        description: "Failed to copy session number",
        variant: "destructive",
      });
    }
  };

  const handleStartEditingSession = () => {
    if (!activeSession) return;
    setEditSessionValue(extractSessionNumber(activeSession));
    setIsEditingSession(true);
  };

  const handleSaveSessionEdit = () => {
    // Only change session and show toast if session number is actually different
    if (isDifferentSession) {
      onSessionChange(formatSessionId(editSessionValue));
      toast({
        title: "Session changed",
        description: `Switched to session ${editSessionValue}`,
      });
    }
    // Always exit edit mode
    setIsEditingSession(false);
    setEditSessionValue('');
  };

  const handleCancelSessionEdit = () => {
    setIsEditingSession(false);
    setEditSessionValue('');
  };

  const handleSessionEditKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSaveSessionEdit();
    } else if (e.key === 'Escape') {
      handleCancelSessionEdit();
    }
  };

  // Check if the entered session number is different from current
  const isDifferentSession = editSessionValue && 
    isValidSessionNumber(editSessionValue) && 
    editSessionValue !== extractSessionNumber(activeSession);
  
  return (
    <nav className={`fixed top-0 left-0 right-0 hidden md:flex items-center p-3 border-b bg-card/95 backdrop-blur-sm z-[90] transition-all duration-300 ${
      isCollapsed ? 'transform -translate-y-full opacity-0' : 'transform translate-y-0 opacity-100'
    }`}>
      <div className="w-full flex items-center">
        {/* Left section - Main controls */}
        <div className="flex items-center space-x-3 flex-1">
          <UnifiedTriangleStatus 
            activeSession={activeSession}
            selectedModel={selectedModel}
            automationMode={automationMode}
            isThinking={isThinking}
            onStopAutomation={() => setAutomationMode(false)}
          />
          
          {/* ModelSelector компонент с поиском */}
          <ModelSelector 
            selectedModel={selectedModel}
            onModelChange={setSelectedModel}
            sessionId={activeSession}
          />
          
          {/* Session Input */}
          <div className="flex items-center space-x-1">
            <span className="text-xs text-slate-400">Session:</span>
            <Input
              placeholder="19"
              value={sessionInput}
              onChange={(e) => {
                const value = e.target.value;
                // Only allow digits
                if (value === '' || /^\d+$/.test(value)) {
                  setSessionInput(value);
                }
              }}
              className="h-7 w-16 text-xs px-2 bg-slate-700 border-slate-600 text-white"
              onKeyDown={(e) => {
                if (e.key === 'Enter' && e.currentTarget.value.trim()) {
                  const sessionNumber = e.currentTarget.value.trim();
                  if (isValidSessionNumber(sessionNumber)) {
                    onSessionChange(formatSessionId(sessionNumber));
                    setSessionInput('');
                  }
                }
              }}
              data-testid="input-session-create-desktop"
            />
          </div>
        </div>

        {/* Center section - Active session display */}
        <div className="flex items-center space-x-2 mx-4">
          {activeSession ? (
            isEditingSession ? (
              <div className="flex items-center space-x-1">
                <Input
                  value={editSessionValue}
                  onChange={(e) => {
                    const value = e.target.value;
                    if (value === '' || /^\d+$/.test(value)) {
                      setEditSessionValue(value);
                    }
                  }}
                  onKeyDown={handleSessionEditKeyDown}
                  className="h-7 w-24 text-xs px-2 text-blue-400 bg-blue-950/20 border border-blue-500/30 rounded"
                  placeholder="Session"
                  autoFocus
                  data-testid="input-session-edit-desktop"
                />
                {isDifferentSession && (
                  <Button
                    onClick={handleSaveSessionEdit}
                    size="sm"
                    variant="default"
                    className="h-7 w-7 p-0 bg-green-600 hover:bg-green-700 border-green-500 text-white"
                    title={`Go to session ${editSessionValue}`}
                    data-testid="button-confirm-session-desktop"
                  >
                    <ArrowRight size={12} />
                  </Button>
                )}
                <Button
                  onClick={handleCancelSessionEdit}
                  size="sm"
                  variant="ghost"
                  className="h-7 w-7 p-0 text-gray-400 hover:text-gray-300 hover:bg-gray-800/50"
                  title="Cancel editing"
                  data-testid="button-cancel-session-desktop"
                >
                  <X size={12} />
                </Button>
              </div>
            ) : (
              <Button
                onClick={handleStartEditingSession}
                onDoubleClick={handleCopySession}
                size="sm"
                variant="ghost"
                className="h-7 px-2 text-xs text-blue-400 hover:text-blue-300 hover:bg-blue-950/20 border border-blue-500/30 rounded"
                title="Click to edit, double-click to copy"
                data-testid="button-session-edit-desktop"
              >
                <span className="mr-1">Session: {extractSessionNumber(activeSession)}</span>
                {copiedSession ? (
                  <Check size={12} className="text-green-400" />
                ) : (
                  <Copy size={12} />
                )}
              </Button>
            )
          ) : (
            <div className="text-xs text-muted-foreground">No session</div>
          )}
        </div>

        {/* Right section - Controls */}
        <div className="flex items-center space-x-2">
          {/* Clear Session */}
          {activeSession && (
            <Button
              onClick={onClearSession}
              size="sm"
              variant="outline"
              className="h-6 w-6 p-0 text-red-400 hover:text-red-300 border-red-400"
              title="Очистить сессию"
              data-testid="button-clear-session-desktop"
            >
              <Trash2 size={12} />
            </Button>
          )}
          
          {/* Collapse/Expand Toggle */}
          <Button
            onClick={() => onCollapseChange?.(!isCollapsed)}
            size="sm"
            variant="ghost"
            className="h-6 w-6 p-0 text-muted-foreground hover:text-foreground"
            title={isCollapsed ? "Show navigation panel" : "Hide navigation panel"}
            data-testid="button-toggle-nav-desktop"
          >
            <ChevronUp size={12} className={`transition-transform duration-200 ${isCollapsed ? 'rotate-180' : ''}`} />
          </Button>
        </div>
      </div>
    </nav>
  );
}

function AppRouter() {
  const [location, setLocation] = useLocation();
  const [isMobile, setIsMobile] = useState(false);
  const [activeSession, setActiveSession] = useState<string>("");
  const [automationMode, setAutomationMode] = useState(true);
  const [selectedModel, setSelectedModel] = useState('openai/gpt-4o-mini');
  const [isThinking, setIsThinking] = useState(false);
  const [isNavCollapsed, setIsNavCollapsed] = useState(false);
  const { language, setLanguage, t } = useLanguage();
  
  const handleClearSession = () => {
    // This will be connected to the chat page's clear function
    window.dispatchEvent(new CustomEvent('clearSession'));
  };

  const handleThinkingChange = (thinking: boolean) => {
    setIsThinking(thinking);
  };

  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768);
    };
    
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // Mobile Keyboard Handling
  useEffect(() => {
    if (!isMobile) return;

    const handleKeyboardShow = () => {
      document.body.classList.add('keyboard-open');
      if (window.visualViewport) {
        const keyboardHeight = window.innerHeight - window.visualViewport.height;
        document.documentElement.style.setProperty('--kb-inset', `${keyboardHeight}px`);
      }
    };

    const handleKeyboardHide = () => {
      document.body.classList.remove('keyboard-open');
      document.documentElement.style.setProperty('--kb-inset', '0px');
    };

    const handleVisualViewportChange = () => {
      if (window.visualViewport) {
        const currentHeight = window.visualViewport.height;
        const windowHeight = window.innerHeight;
        
        if (currentHeight < windowHeight * 0.75) {
          handleKeyboardShow();
        } else {
          handleKeyboardHide();
        }
      }
    };

    // Focus/blur detection as fallback
    const handleFocusIn = (e: FocusEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        setTimeout(handleKeyboardShow, 300);
      }
    };

    const handleFocusOut = () => {
      setTimeout(handleKeyboardHide, 300);
    };

    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', handleVisualViewportChange);
    }
    document.addEventListener('focusin', handleFocusIn);
    document.addEventListener('focusout', handleFocusOut);

    return () => {
      if (window.visualViewport) {
        window.visualViewport.removeEventListener('resize', handleVisualViewportChange);
      }
      document.removeEventListener('focusin', handleFocusIn);
      document.removeEventListener('focusout', handleFocusOut);
      document.body.classList.remove('keyboard-open');
      document.documentElement.style.setProperty('--kb-inset', '0px');
    };
  }, [isMobile]);



  return (
    <div className="flex flex-col min-h-dvh bg-background pb-safe">
      <Router>
        {isMobile ? (
          <MobileNavigation 
            activeSession={activeSession}
            onSessionChange={setActiveSession}
            automationMode={automationMode}
            setAutomationMode={setAutomationMode}
            selectedModel={selectedModel}
            setSelectedModel={setSelectedModel}
            onClearSession={handleClearSession}
            isThinking={isThinking}
            isCollapsed={isNavCollapsed}
            onCollapseChange={setIsNavCollapsed}
          />
        ) : (
          <DesktopNavigation 
            activeSession={activeSession}
            onSessionChange={setActiveSession}
            automationMode={automationMode}
            setAutomationMode={setAutomationMode}
            selectedModel={selectedModel}
            setSelectedModel={setSelectedModel}
            onClearSession={handleClearSession}
            isThinking={isThinking}
            isCollapsed={isNavCollapsed}
            onCollapseChange={setIsNavCollapsed}
          />
        )}
        
        {/* Persistent Expand Button - Always accessible when nav is collapsed */}
        {isNavCollapsed && (
          <Button
            onClick={() => setIsNavCollapsed(false)}
            size="sm"
            variant="outline"
            className="fixed top-2 left-2 z-[95] h-8 w-8 p-0 bg-card/95 backdrop-blur-sm border-primary/50 hover:border-primary text-primary hover:text-primary hover:bg-primary/10 shadow-lg transition-all duration-300 animate-in fade-in-0 slide-in-from-left-2"
            title="Show navigation panel"
            data-testid={isMobile ? "button-expand-nav-persistent-mobile" : "button-expand-nav-persistent-desktop"}
          >
            {isMobile ? (
              <Menu size={14} className="shrink-0" />
            ) : (
              <ChevronDown size={14} className="shrink-0" />
            )}
          </Button>
        )}
        <main className={`flex-1 transition-all duration-300 ${
          isMobile 
            ? `pb-24 ${isNavCollapsed ? 'pt-2' : 'pt-14'} px-2` 
            : `pb-4 ${isNavCollapsed ? 'pt-2' : 'pt-20'} px-4`
        } pb-safe overflow-hidden`}>
          <Switch>
            <Route path="/">
              <ChatPage 
                activeSession={activeSession}
                onSessionChange={setActiveSession}
                automationMode={automationMode}
                setAutomationMode={setAutomationMode}
                selectedModel={selectedModel}
                setSelectedModel={setSelectedModel}
                onThinkingChange={handleThinkingChange}
              />
            </Route>
            <Route path="/dashboard">
              <Dashboard 
                activeSession={activeSession} 
                onSessionChange={setActiveSession}
                selectedModel={selectedModel}
                setSelectedModel={setSelectedModel}
              />
            </Route>
            <Route component={NotFound} />
          </Switch>
        </main>
        
        {/* Bottom Navigation Bar - Fixed with higher z-index - Hidden on Chat page since ChatInterface has its own */}
        <div className={`fixed bottom-0 left-0 right-0 bg-gradient-to-t from-card to-card/95 border-t border-border/60 backdrop-blur-sm z-[100] pb-safe keyboard-adjusted shadow-lg ${location === '/' ? 'hidden' : ''}`}>
          <div className="flex items-center justify-between px-4 py-4">
            {/* Левая часть - главная навигация */}
            <div className="flex items-center justify-center flex-1 space-x-8">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => location !== "/" && setLocation("/")}
                className={`flex flex-col items-center p-3 rounded-xl transition-all duration-300 min-h-[56px] min-w-[76px] overflow-hidden shadow-lg ${
                  location === "/" 
                    ? "text-blue-300 bg-gradient-to-b from-blue-500/20 to-blue-600/10 border-2 border-blue-400/30 shadow-blue-500/20 scale-105" 
                    : "text-slate-300 hover:text-blue-200 hover:bg-gradient-to-b hover:from-blue-600/10 hover:to-blue-700/5 hover:border hover:border-blue-500/20 hover:shadow-blue-500/10 hover:scale-105"
                }`}
                data-testid="nav-chat-mobile"
              >
                <div className="relative">
                  <MessageCircle size={24} className="shrink-0 drop-shadow-sm" />
                  {location === "/" && (
                    <div className="absolute -top-1 -right-1 w-2 h-2 bg-blue-400 rounded-full animate-pulse"></div>
                  )}
                </div>
                <span className="text-xs mt-1.5 font-semibold truncate tracking-wide">{t('nav.chat')}</span>
              </Button>
              
              <Button
                variant="ghost"
                size="sm"
                onClick={() => location !== "/dashboard" && setLocation("/dashboard")}
                className={`flex flex-col items-center p-3 rounded-xl transition-all duration-300 min-h-[56px] min-w-[76px] overflow-hidden shadow-lg ${
                  location === "/dashboard" 
                    ? "text-emerald-300 bg-gradient-to-b from-emerald-500/20 to-emerald-600/10 border-2 border-emerald-400/30 shadow-emerald-500/20 scale-105" 
                    : "text-slate-300 hover:text-emerald-200 hover:bg-gradient-to-b hover:from-emerald-600/10 hover:to-emerald-700/5 hover:border hover:border-emerald-500/20 hover:shadow-emerald-500/10 hover:scale-105"
                }`}
                data-testid="nav-dashboard-mobile"
              >
                <div className="relative">
                  <Bot size={24} className="shrink-0 drop-shadow-sm" />
                  {location === "/dashboard" && (
                    <div className="absolute -top-1 -right-1 w-2 h-2 bg-emerald-400 rounded-full animate-pulse"></div>
                  )}
                </div>
                <span className="text-xs mt-1.5 font-semibold truncate tracking-wide">{t('nav.dashboard')}</span>
              </Button>
            </div>
            
            {/* Правая часть - утилиты */}
            <div className="flex items-center space-x-2">
              {/* Language Toggle */}
              <Button
                onClick={() => setLanguage(language === 'en' ? 'ru' : 'en')}
                size="sm"
                variant="ghost"
                className="min-h-[32px] min-w-[32px] p-2 text-xs rounded-full overflow-hidden"
                title={language === 'en' ? 'Switch to Russian' : 'Переключить на английский'}
                data-testid="button-language-toggle"
              >
                <span className="text-xs font-medium shrink-0">{language.toUpperCase()}</span>
              </Button>
              
            </div>
          </div>
        </div>

        
      </Router>
    </div>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider defaultTheme="dark" storageKey="eiros-ui-theme">
        <LanguageProvider>
          <TooltipProvider>
            <Toaster />
            <AppRouter />
          </TooltipProvider>
        </LanguageProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

export default App;
