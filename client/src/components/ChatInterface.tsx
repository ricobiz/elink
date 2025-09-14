import { useState, useRef, useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { useSSE } from "@/hooks/useSSE";
import { apiRequest } from "@/lib/queryClient";
import { BarChart3, X, Mic, MicOff, Paperclip, Bot, MessageCircle, Trash2, ChevronDown, ChevronUp, Brain, Play, Pause, Send, Circle, CheckCircle2 } from "lucide-react";
import { useLocation } from "wouter";
import { useLanguage } from "@/hooks/useLanguage";
import ChatMessage from "./ChatMessage";
import ModelSelector from "./ModelSelector";
import EventBoard from "./EventBoard";
// import ContextButton from "./ContextButton"; // TEMPORARILY DISABLED - causing React hooks error

interface ChatInterfaceProps {
  activeSession: string | null;
  onSessionChange: (sessionId: string) => void;
  automationMode?: boolean;
  setAutomationMode?: (mode: boolean) => void;
  selectedModel?: string;
  setSelectedModel?: (model: string) => void;
  onThinkingChange?: (isThinking: boolean) => void;
  isPaused?: boolean;
  handlePauseToggle?: () => void;
  isThinking?: boolean;
  isProcessing?: boolean;
  onProcessingChange?: (processing: boolean) => void;
}

interface Message {
  id: string;
  type: 'user' | 'ai' | 'system';
  content: string;
  timestamp: Date;
  metadata?: any;
  artifacts?: any[];
}

export default function ChatInterface({ 
  activeSession, 
  onSessionChange,
  automationMode: propAutomationMode = true,
  setAutomationMode: propSetAutomationMode,
  selectedModel: propSelectedModel = 'openai/gpt-4o-mini',
  setSelectedModel: propSetSelectedModel,
  onThinkingChange,
  isPaused: propIsPaused,
  handlePauseToggle: propHandlePauseToggle,
  isThinking: propIsThinking,
  isProcessing: propIsProcessing,
  onProcessingChange
}: ChatInterfaceProps) {
  const [location, setLocation] = useLocation();
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputText, setInputText] = useState("");
  const selectedModel = propSelectedModel || 'openai/gpt-4o-mini';
  const setSelectedModel = propSetSelectedModel || (() => {});
  const automationMode = propAutomationMode ?? true;
  const setAutomationMode = propSetAutomationMode || (() => {});
  // Use prop values if available, otherwise use local state
  const [localIsProcessing, setLocalIsProcessing] = useState(false);
  const [localIsThinking, setLocalIsThinking] = useState(false);
  const [localIsPaused, setLocalIsPaused] = useState(false);
  
  const isProcessing = propIsProcessing !== undefined ? propIsProcessing : localIsProcessing;
  const setIsProcessing = onProcessingChange || setLocalIsProcessing;
  const isThinking = propIsThinking !== undefined ? propIsThinking : localIsThinking;
  const setIsThinking = (thinking: boolean) => {
    if (propIsThinking === undefined) {
      setLocalIsThinking(thinking);
    }
    if (onThinkingChange) {
      onThinkingChange(thinking);
    }
  };
  const isPaused = propIsPaused !== undefined ? propIsPaused : localIsPaused;
  const handlePauseToggle = propHandlePauseToggle || (() => setLocalIsPaused(prev => !prev));
  
  const [showEventBoard, setShowEventBoard] = useState(false);
  const [eventBoardView, setEventBoardView] = useState<'browser' | 'artifacts' | 'logs' | 'reports'>('browser');
  const [isRecording, setIsRecording] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [sessionInput, setSessionInput] = useState('');
  const [thinkingProcess, setThinkingProcess] = useState<any[]>([]); // Процесс думания ИИ
  const [showThinkingDetails, setShowThinkingDetails] = useState(false);
  const [textareaHeight, setTextareaHeight] = useState('auto');
  const [contextEnabled, setContextEnabled] = useState(false); // Context state
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const recognitionRef = useRef<any>(null);
  const bottomPanelRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();
  const { language, t } = useLanguage();
  const queryClient = useQueryClient();

  // Setup SSE for real-time updates
  useSSE(activeSession);
  
  // Listen for clear session events from top navigation
  useEffect(() => {
    const handleClearSession = () => {
      clearChatMutation.mutate();
    };
    
    window.addEventListener('clearSession', handleClearSession);
    return () => window.removeEventListener('clearSession', handleClearSession);
  }, []);

  // Load messages from database for active session - SSE handles real-time updates
  const { data: savedMessages, isLoading: messagesLoading } = useQuery({
    queryKey: ['/api/chat/messages', activeSession],
    enabled: !!activeSession,
    refetchInterval: false, // Отключен - SSE обновляет сообщения в real-time
    staleTime: 10000, // Кешируем на 10 секунд
    refetchIntervalInBackground: false,
  });

  // Load user subscription status for context feature
  const { data: authData } = useQuery({
    queryKey: ['/api/auth/me'],
    staleTime: 30000, // Cache for 30 seconds
  });

  // Load session data to get context status
  const { data: sessionData } = useQuery({
    queryKey: ['/api/sessions', activeSession],
    enabled: !!activeSession,
    staleTime: 10000,
  });

  // Load artifacts count for badge
  const { data: allArtifacts = [] } = useQuery<any[]>({
    queryKey: ['/api/artifacts'],
    refetchInterval: 5000,
    staleTime: 1000,
  });

  // Filter artifacts by active session and get count
  const sessionArtifacts = allArtifacts.filter((artifact: any) => 
    !activeSession || artifact.sessionId === activeSession
  );
  const artifactCount = sessionArtifacts.length;

  // Set loaded messages when they arrive - filter out system messages
  useEffect(() => {
    if (savedMessages && Array.isArray(savedMessages) && savedMessages.length > 0) {
      const allMessages = savedMessages.map((msg: any) => {
        // Clean metadata by removing artifacts to prevent duplication in UI
        const cleanMetadata = msg.metadata ? { ...msg.metadata } : {};
        delete cleanMetadata.artifacts;
        
        return {
          id: msg.id,
          type: (msg.type === 'user' ? 'user' : msg.type === 'system' ? 'system' : 'ai') as 'user' | 'ai' | 'system',
          content: msg.content,
          timestamp: new Date(msg.timestamp),
          metadata: cleanMetadata,
          artifacts: [] // Don't load artifacts for old messages to prevent UI duplication
        };
      });
      
      // Separate system messages (thinking process) from user/ai chat
      const chatMessages = allMessages.filter(msg => msg.type !== 'system');
      const systemMessages = allMessages.filter(msg => msg.type === 'system');
      
      setMessages(chatMessages);
      // Limit thinking process to 200 entries to prevent memory leaks
      setThinkingProcess(systemMessages.slice(-200));
      
      // Check if AI is currently thinking
      const lastSystemMsg = systemMessages[systemMessages.length - 1];
      setIsThinking(lastSystemMsg?.metadata?.type === 'analyzing' || lastSystemMsg?.metadata?.type === 'action_executing');
    } else if (activeSession && !messagesLoading) {
      setMessages([]);
      setThinkingProcess([]);
      setIsThinking(false);
    }
  }, [savedMessages, activeSession, messagesLoading]);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Sync context state from session data
  useEffect(() => {
    if (sessionData && typeof sessionData === 'object' && sessionData !== null && 'contextEnabled' in sessionData) {
      const typedSessionData = sessionData as { contextEnabled?: boolean };
      if (typedSessionData.contextEnabled !== undefined) {
        setContextEnabled(typedSessionData.contextEnabled);
      }
    }
  }, [sessionData]);

  // Notify parent component when thinking state changes
  useEffect(() => {
    if (onThinkingChange) {
      onThinkingChange(isThinking || isProcessing);
    }
  }, [isThinking, isProcessing, onThinkingChange]);

  // Context toggle mutation
  const contextToggleMutation = useMutation({
    mutationFn: async (enabled: boolean) => {
      if (!activeSession) throw new Error('No active session');
      return apiRequest(`/api/sessions/${activeSession}/context`, 'PATCH', { enabled });
    },
    onSuccess: (data: any) => {
      setContextEnabled(data.contextEnabled);
      queryClient.invalidateQueries({ queryKey: ['/api/sessions', activeSession] });
      toast({
        title: data.contextEnabled ? 'Context Enabled' : 'Context Disabled',
        description: data.contextEnabled 
          ? 'Chat context will be saved for AI continuity' 
          : 'Chat context saving disabled',
      });
    },
    onError: (error: any) => {
      if (error.response?.status === 403) {
        toast({
          title: 'Subscription Required',
          description: 'Active subscription needed to enable context saving',
          variant: 'destructive',
        });
      } else {
        toast({
          title: 'Context Toggle Failed',
          description: error.message || 'Failed to update context setting',
          variant: 'destructive',
        });
      }
    },
  });

  // Mock subscription toggle for testing
  const subscriptionToggleMutation = useMutation({
    mutationFn: () => apiRequest('/api/subscription/mock-activate', 'POST'),
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ['/api/auth/me'] });
      toast({
        title: data.subscription?.active ? 'Subscription Activated' : 'Subscription Deactivated',
        description: data.subscription?.active 
          ? 'You now have access to premium features including context saving' 
          : 'Premium features are now disabled',
      });
    },
  });

  // VisualViewport API для надежного поднятия поля над клавиатурой на Android
  useEffect(() => {
    // Feature detection: проверяем поддержку VisualViewport API
    if (typeof window !== 'undefined' && 'visualViewport' in window && window.visualViewport) {
      const visualViewport = window.visualViewport;
      
      const updateKeyboardHeight = () => {
        if (window.innerWidth >= 768) return; // Только для мобильных устройств
        
        // Вычисляем высоту клавиатуры
        const keyboardHeight = visualViewport.height < window.innerHeight
          ? window.innerHeight - visualViewport.height
          : 0;
        
        // Устанавливаем CSS переменную для динамической высоты клавиатуры
        document.documentElement.style.setProperty('--kb-height', `${keyboardHeight}px`);
        
        // Применяем класс для активации трансформации
        if (keyboardHeight > 0) {
          document.body.classList.add('keyboard-active');
        } else {
          document.body.classList.remove('keyboard-active');
        }
      };
      
      // Подписываемся на изменения размеров viewport
      visualViewport.addEventListener('resize', updateKeyboardHeight);
      visualViewport.addEventListener('scroll', updateKeyboardHeight);
      
      // Инициализация
      updateKeyboardHeight();
      
      return () => {
        visualViewport.removeEventListener('resize', updateKeyboardHeight);
        visualViewport.removeEventListener('scroll', updateKeyboardHeight);
        document.body.classList.remove('keyboard-active');
        document.documentElement.style.removeProperty('--kb-height');
      };
    } else {
      // Fallback для устройств без поддержки VisualViewport API
      console.warn('VisualViewport API not supported, using fallback keyboard detection');
      
      const handleViewportChange = () => {
        if (window.innerWidth >= 768) return;
        
        // Простая эвристика: если viewport стал значительно меньше, клавиатура открыта
        const heightDiff = window.innerHeight - (window.visualViewport?.height || window.innerHeight);
        if (heightDiff > 150) { // Предполагаем, что клавиатура больше 150px
          document.documentElement.style.setProperty('--kb-height', `${heightDiff}px`);
          document.body.classList.add('keyboard-active');
        } else {
          document.documentElement.style.setProperty('--kb-height', '0px');
          document.body.classList.remove('keyboard-active');
        }
      };
      
      window.addEventListener('resize', handleViewportChange);
      return () => {
        window.removeEventListener('resize', handleViewportChange);
        document.body.classList.remove('keyboard-active');
        document.documentElement.style.removeProperty('--kb-height');
      };
    }
  }, []);

  // Initialize speech recognition
  useEffect(() => {
    if (typeof window !== 'undefined' && 'webkitSpeechRecognition' in window) {
      const SpeechRecognition = (window as any).webkitSpeechRecognition || (window as any).SpeechRecognition;
      recognitionRef.current = new SpeechRecognition();
      recognitionRef.current.continuous = false;
      recognitionRef.current.interimResults = false;
      recognitionRef.current.lang = language === 'ru' ? 'ru-RU' : 'en-US';

      recognitionRef.current.onresult = (event: any) => {
        const transcript = event.results[0][0].transcript;
        setInputText(prev => prev + (prev ? ' ' : '') + transcript);
        setIsRecording(false);
      };

      recognitionRef.current.onerror = (event: any) => {
        console.error('Speech recognition error:', event.error);
        setIsRecording(false);
        toast({
          title: t('voice.error.title'),
          description: t('voice.error.desc'),
          variant: "destructive"
        });
      };

      recognitionRef.current.onend = () => {
        setIsRecording(false);
      };
    }
  }, [toast, language, t]);

  const processMessageMutation = useMutation({
    mutationFn: async ({ message, files, automationMode }: { message: string, files: File[], automationMode: boolean }) => {
      if (!activeSession) {
        throw new Error(t('error.no.session'));
      }
      
      // Create FormData for files
      const formData = new FormData();
      formData.append('message', message);
      formData.append('model', selectedModel);
      formData.append('sessionId', activeSession);
      formData.append('automationMode', automationMode.toString()); // Передаем режим автоматизации
      
      files.forEach((file, index) => {
        formData.append(`files`, file);
      });
      
      const response = await fetch('/api/chat/process', {
        method: 'POST',
        body: formData,
      });
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      return response.json();
    },
    onMutate: (message) => {
      setIsProcessing(true);
    },
    onSuccess: (data) => {
      const aiMessage: Message = {
        id: data.aiMessage.id,
        type: 'ai',
        content: data.aiMessage.content,
        timestamp: new Date(data.aiMessage.timestamp),
        metadata: data.aiMessage.metadata,
        artifacts: [] // Убираем artifacts из чата - они будут показываться в отдельной вкладке
      };
      setMessages(prev => [...prev, aiMessage]);
      
      // Show toast notification for new artifacts with clickable Dashboard link
      if (data.artifacts && data.artifacts.length > 0) {
        const fileCount = data.artifacts.length;
        const fileText = fileCount === 1 ? 'файл' : (fileCount < 5 ? 'файла' : 'файлов');
        
        toast({
          title: `📎 ${fileCount} ${fileText} создано`,
          description: "Нажмите здесь, чтобы открыть файлы",
          action: (
            <Button 
              variant="outline" 
              size="sm"
              onClick={() => {
                setShowEventBoard(true);
                setEventBoardView('artifacts');
              }}
              data-testid="button-open-files"
            >
              Файлы
            </Button>
          ),
          duration: 5000, // Show for 5 seconds
        });
        
        // Invalidate artifacts cache to refresh the list
        queryClient.invalidateQueries({ queryKey: ['/api/artifacts'] });
      }
      
      setIsProcessing(false);
    },
    onError: (error: any) => {
      setIsProcessing(false);
      toast({
        title: t('error.message.process'),
        description: error.message || t('error.message.process.desc'),
        variant: "destructive"
      });
    }
  });

  const createSessionMutation = useMutation({
    mutationFn: async (customSessionId?: string) => {
      const body = customSessionId ? { sessionId: customSessionId } : {};
      const response = await apiRequest('POST', '/api/sessions', body);
      return response.json();
    },
    onSuccess: (data) => {
      onSessionChange(data.id);
      toast({
        title: t('success.session.created'),
        description: `ID: ${data.id}`,
      });
    },
    onError: (error: any) => {
      toast({
        title: t('error.session.create'),
        description: error.message || t('error.session.create.desc'),
        variant: "destructive"
      });
    }
  });

  const clearChatMutation = useMutation({
    mutationFn: async () => {
      if (!activeSession) throw new Error('No active session');
      const response = await apiRequest('DELETE', `/api/chat/messages/${activeSession}`, {});
      return response.json();
    },
    onSuccess: () => {
      setMessages([]);
      toast({
        title: t('success.chat.cleared'),
        description: t('success.chat.cleared.desc'),
      });
    },
    onError: (error: any) => {
      toast({
        title: t('error.clear.chat'),
        description: error.message || t('error.clear.chat.desc'),
        variant: "destructive"
      });
    }
  });

  const handleSendMessage = () => {
    // Enforcement gating - block actions when paused or automation is off
    if (isPaused) {
      toast({
        title: "Действие заблокировано",
        description: "Снимите паузу, чтобы отправить сообщение",
        variant: "destructive"
      });
      return;
    }
    
    if (!automationMode) {
      toast({
        title: "Автоматизация отключена", 
        description: "Включите автоматизацию для отправки сообщений",
        variant: "destructive"
      });
      return;
    }
    
    const messageToSend = inputText.trim();
    if (!messageToSend && selectedFiles.length === 0) return;
    
    setInputText("");
    const filesToSend = [...selectedFiles];
    setSelectedFiles([]);

    if (!activeSession) {
      try {
        createSessionMutation.mutate(undefined, {
          onSuccess: () => {
            setTimeout(() => {
              processMessageMutation.mutate({ message: messageToSend, files: filesToSend, automationMode });
            }, 100);
          },
          onError: () => {
            setIsProcessing(false);
          }
        });
        return;
      } catch (error) {
        setIsProcessing(false);
        toast({
          title: t('error.session.create'),
          description: t('error.session.create.desc'),
          variant: "destructive"
        });
        return;
      }
    }

    const userMessage: Message = {
      id: Date.now().toString(),
      type: 'user',
      content: messageToSend,
      timestamp: new Date(),
    };
    setMessages(prev => [...prev, userMessage]);
    setIsProcessing(true);

    processMessageMutation.mutate({ message: messageToSend, files: filesToSend, automationMode });
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const handleVoiceRecording = () => {
    if (!recognitionRef.current) {
      toast({
        title: t('voice.unavailable.title'),
        description: t('voice.unavailable.desc'),
        variant: "destructive"
      });
      return;
    }

    if (isRecording) {
      recognitionRef.current.stop();
      setIsRecording(false);
    } else {
      recognitionRef.current.start();
      setIsRecording(true);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    setSelectedFiles(prev => [...prev, ...files]);
  };

  const handleRemoveFile = (index: number) => {
    setSelectedFiles(prev => prev.filter((_, i) => i !== index));
  };

  const handleQuickComment = (comment: string) => {
    const userMessage: Message = {
      id: Date.now().toString(),
      type: 'user',
      content: comment,
      timestamp: new Date(),
    };
    setMessages(prev => [...prev, userMessage]);
    
    // Сразу отправляем комментарий как обычное сообщение для координации ИИ
    processMessageMutation.mutate({ message: comment, files: [], automationMode });
  };


  return (
    <div className="flex h-full bg-background text-foreground">
      {/* Main Chat Area */}
      <div className={`flex flex-col ${showEventBoard ? 'md:w-2/3' : 'w-full'} transition-all duration-300 min-h-0`}>
        
        {/* Top Panel with Model Selector and View Mode Toggle */}
        <div className="flex items-center justify-between p-2 border-b border-border bg-background/50">
          <div className="flex items-center space-x-3">
            <ModelSelector
              selectedModel={selectedModel}
              onModelChange={setSelectedModel}
            />
            
          </div>
        </div>

        {/* Chat View */}
        <div className="flex-1 overflow-y-auto pb-24">
          <div className="px-3 md:px-4 py-2 space-y-3 md:space-y-4 min-h-full">
            {messages.length === 0 ? (
              <div className="absolute bottom-4 right-4 text-right text-muted-foreground">
                <p className="text-xs opacity-60">
                  {activeSession ? 'Введите сообщение для начала' : 'Создайте сессию'}
                </p>
              </div>
            ) : (
              // Show only chat messages (user/ai, no system messages)
              messages
                .filter(message => message.type !== 'system' && !message.metadata?.isAutomationLog)
                .map((message, index, filteredMessages) => {
                  // Определяем последнее AI сообщение в отфильтрованном массиве
                  const isLastAiMessage = message.type === 'ai' && index === filteredMessages.length - 1;
                  
                  return (
                    <ChatMessage 
                      key={message.id} 
                      message={message}
                      isThinking={isLastAiMessage && (isThinking || isProcessing)}
                      isLatestAiMessage={isLastAiMessage}
                    />
                  );
                })
            )}
            
            {isProcessing && (
              <div className="flex items-center space-x-2 text-muted-foreground">
                <div className="w-2 h-2 bg-primary rounded-full animate-pulse"></div>
                <div className="w-2 h-2 bg-primary rounded-full animate-pulse delay-75"></div>
                <div className="w-2 h-2 bg-primary rounded-full animate-pulse delay-150"></div>
                <span className="text-sm">{t('chat.processing')}</span>
              </div>
            )}
            
            <div ref={messagesEndRef} />
          </div>
        </div>

        
        {/* Mobile-optimized Input area */}
        <div className="p-3 md:p-4 border-t border-border bg-card mobile-input-container">
          {/* Selected Files Display */}
          {selectedFiles.length > 0 && (
            <div className="mb-3 flex flex-wrap gap-2">
              {selectedFiles.map((file, index) => (
                <div key={index} className="flex items-center gap-2 bg-muted rounded-lg px-3 py-1 text-sm">
                  <Paperclip size={14} />
                  <span className="truncate max-w-32">{file.name}</span>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleRemoveFile(index)}
                    className="h-auto p-1"
                  >
                    <X size={12} />
                  </Button>
                </div>
              ))}
            </div>
          )}

          {/* Quick Comments for AI coordination - only show during processing */}
          {isProcessing && (
            <div className="mb-3 p-3 bg-orange-50 dark:bg-orange-900/20 rounded-lg border border-orange-200 dark:border-orange-800">
              <div className="text-sm text-orange-800 dark:text-orange-200 mb-2 font-medium">
                {t('coordination.title')}
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleQuickComment(t('quick.stop'))}
                  className="text-xs min-h-[32px] px-3 overflow-hidden"
                >
                  {t('coordination.stop')}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleQuickComment(t('quick.continue'))}
                  className="text-xs min-h-[32px] px-3 overflow-hidden"
                >
                  {t('coordination.continue')}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleQuickComment(t('quick.different'))}
                  className="text-xs min-h-[32px] px-3 overflow-hidden"
                >
                  {t('coordination.different')}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleQuickComment(t('quick.screenshot'))}
                  className="text-xs min-h-[32px] px-3 overflow-hidden"
                >
                  {t('coordination.screenshot')}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleQuickComment(t('quick.check'))}
                  className="text-xs min-h-[32px] px-3 overflow-hidden"
                >
                  {t('coordination.check')}
                </Button>
              </div>
            </div>
          )}

          {/* Компактная нижняя панель с улучшенным UX */}
          <div 
            ref={bottomPanelRef}
            className="bottom-chat-panel fixed bottom-0 left-0 right-0 bg-gradient-to-t from-card to-card/95 border-t border-border/60 backdrop-blur-sm z-[110] pb-safe shadow-lg"
            style={{
              paddingBottom: 'max(env(safe-area-inset-bottom), env(keyboard-inset-height, 0px))'
            }}
          >
            <div className="flex items-center gap-3 px-3 py-2">
              
              {/* 1. ЛЕВЫЙ КРАЙ - Chat Navigation Button */}
              <Button
                variant="outline"
                size="tallIcon"
                onClick={() => {
                  if (location !== "/") setLocation("/");
                }}
                className={`rounded-lg transition-all duration-300 overflow-hidden shrink-0 ${
                  location === "/" 
                    ? "text-blue-400 bg-blue-500/20 border-blue-400/30 shadow-lg" 
                    : "text-slate-400 hover:text-blue-300 hover:bg-blue-600/10 border-slate-600"
                }`}
                data-testid="nav-chat-bottom"
                title="Чат"
              >
                <MessageCircle size={18} className="shrink-0" />
              </Button>

              {/* 2. ЛЕВАЯ ВЕРТИКАЛЬНАЯ ГРУППА - Files и Voice */}
              <div className="flex flex-col gap-1 shrink-0">
                <Button
                  variant="outline"
                  size="tiny"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    fileInputRef.current?.click();
                  }}
                  className="overflow-hidden"
                  data-testid="button-attach-file"
                  title="Прикрепить файл"
                >
                  <Paperclip size={12} className="shrink-0" />
                </Button>
                
                <Button
                  variant={isRecording ? "default" : "outline"}
                  size="tiny"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    handleVoiceRecording();
                  }}
                  disabled={isProcessing}
                  className={`overflow-hidden ${
                    isRecording ? 'bg-red-500 hover:bg-red-600 animate-pulse' : ''
                  }`}
                  data-testid="button-voice-record"
                  title={isRecording ? "Остановить запись" : "Голосовой ввод"}
                >
                  {isRecording ? <MicOff size={12} className="shrink-0" /> : <Mic size={12} className="shrink-0" />}
                </Button>
              </div>

              {/* 3. ЦЕНТР - Поле ввода с треугольничком отправки */}
              <div className="flex-1 min-w-0">
                <div className="relative">
                  <textarea
                    ref={textareaRef}
                    value={inputText}
                    onChange={(e) => {
                      setInputText(e.target.value);
                      if (textareaRef.current) {
                        textareaRef.current.style.height = 'auto';
                        const scrollHeight = textareaRef.current.scrollHeight;
                        // Рассчитываем точную высоту для 3 строк: line-height * 3 + padding
                        const lineHeight = 20; // примерно для text-sm
                        const paddingVertical = 12; // py-3
                        const maxHeight = lineHeight * 3 + paddingVertical * 2;
                        textareaRef.current.style.height = Math.min(scrollHeight, maxHeight) + 'px';
                        textareaRef.current.style.overflowY = scrollHeight > maxHeight ? 'auto' : 'hidden';
                      }
                    }}
                    onKeyPress={handleKeyPress}
                    onFocus={(e) => {
                      // Улучшенное поведение клавиатуры на мобильных
                      if (window.innerWidth < 768) {
                        document.body.classList.add('keyboard-visible');
                        
                        // Для fixed элементов scrollIntoView не работает на Android
                        // Используем прямое управление через наш bottomPanelRef
                        setTimeout(() => {
                          if (bottomPanelRef.current) {
                            // Убеждаемся, что панель видима над клавиатурой
                            const rect = bottomPanelRef.current.getBoundingClientRect();
                            const viewportHeight = window.visualViewport?.height || window.innerHeight;
                            
                            if (rect.bottom > viewportHeight) {
                              // Если панель скрыта за клавиатурой, поднимаем её
                              const adjustment = rect.bottom - viewportHeight + 20; // +20px буфер
                              bottomPanelRef.current.style.transform = `translateY(-${adjustment}px)`;
                            }
                          }
                        }, 100);
                      }
                    }}
                    onBlur={() => {
                      // Убираем класс при потере фокуса и сбрасываем позицию
                      document.body.classList.remove('keyboard-visible');
                      if (bottomPanelRef.current) {
                        bottomPanelRef.current.style.transform = '';
                      }
                    }}
                    placeholder={activeSession ? t('chat.input.placeholder') : t('chat.input.placeholder.nosession')}
                    disabled={isProcessing || isPaused}
                    className="w-full resize-none pr-10 pl-3 py-3 text-sm border border-input bg-background rounded-md focus:outline-none focus:ring-1 focus:ring-ring min-h-[52px] leading-5"
                    rows={1}
                    data-testid="input-chat-message"
                    style={{
                      maxHeight: '76px' // 3 строки: 20px * 3 + 12px * 2 padding
                    }}
                  />
                  
                  {/* Accessibility улучшенная кнопка отправки с минимальным touch area */}
                  <button
                    type="button"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      if ((!inputText.trim() && selectedFiles.length === 0) || isProcessing || isPaused) return;
                      handleSendMessage();
                    }}
                    disabled={(!inputText.trim() && selectedFiles.length === 0) || isProcessing || isPaused}
                    className={`absolute right-1 top-1/2 transform -translate-y-1/2 min-w-[44px] min-h-[44px] w-10 h-10 rounded-full flex items-center justify-center transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-opacity-50 ${
                      (!inputText.trim() && selectedFiles.length === 0) || isProcessing || isPaused || !automationMode
                        ? 'opacity-30 cursor-not-allowed'
                        : 'hover:bg-blue-100/50 dark:hover:bg-blue-900/30 opacity-70 hover:opacity-100 active:scale-95'
                    }`}
                    data-testid="button-send-message"
                    title="Отправить сообщение (Enter)"
                    aria-label="Отправить сообщение"
                  >
                    <svg 
                      width="16" 
                      height="16" 
                      viewBox="0 0 24 24" 
                      fill="none"
                      className="text-blue-600 dark:text-blue-400"
                    >
                      <path 
                        d="M7 17L17 7M17 7H7M17 7V17" 
                        stroke="currentColor" 
                        strokeWidth="2" 
                        strokeLinecap="round" 
                        strokeLinejoin="round"
                        transform="rotate(-45 12 12)"
                      />
                    </svg>
                  </button>
                </div>
              </div>

              {/* 4. ПРАВАЯ ВЕРТИКАЛЬНАЯ ГРУППА - Context и Agent */}
              <div className="flex flex-col space-y-1">
                {/* Context кнопка с поддержкой короткого/долгого нажатия - TEMPORARILY DISABLED */}
                {/* <ContextButton
                  contextEnabled={contextEnabled}
                  subscriptionActive={authData && typeof authData === 'object' && authData !== null && 'subscription' in authData && (authData as any).subscription?.active || false}
                  isProcessing={contextToggleMutation.isPending || !activeSession}
                  onToggleContext={() => {
                    const hasSubscription = authData && typeof authData === 'object' && authData !== null && 'subscription' in authData && (authData as any).subscription?.active;
                    if (!hasSubscription) {
                      // For demo - toggle subscription first
                      subscriptionToggleMutation.mutate();
                    } else {
                      contextToggleMutation.mutate(!contextEnabled);
                    }
                  }}
                  onContextSettings={() => {
                    // TODO: Implement context settings modal
                    toast({
                      title: "Context Settings",
                      description: "Context settings panel coming soon!",
                    });
                  }}
                  className="h-8 w-12 text-xs"
                /> */}
                
                {/* Agent кнопка (снизу, синяя) */}
                <Button
                  variant="outline"
                  size="tiny"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setAutomationMode(!automationMode);
                  }}
                  className={`px-2 font-medium transition-all duration-300 overflow-hidden ${
                    automationMode 
                      ? 'bg-blue-600 hover:bg-blue-700 text-white border-blue-400 shadow-lg shadow-blue-500/50' 
                      : 'bg-gray-700 hover:bg-gray-600 text-gray-200 border-gray-600'
                  }`}
                  style={{
                    boxShadow: automationMode ? '0 0 10px rgba(59, 130, 246, 0.4)' : 'none',
                    animation: automationMode ? 'pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite' : 'none'
                  }}
                  data-testid="button-agent-mode"
                  title={automationMode ? "Режим агента включен (нажмите чтобы выключить)" : "Режим чата (нажмите чтобы включить агента)"}
                >
                  {automationMode ? 'A' : 'C'}
                </Button>
              </div>

              {/* 5. ПРАВЫЙ КРАЙ - Dashboard Navigation Button (узкая но высокая) */}
              <Button
                variant="outline"
                size="tallIcon"
                onClick={() => {
                  if (location !== "/dashboard") setLocation("/dashboard");
                }}
                className={`rounded-lg transition-all duration-300 overflow-hidden ${
                  location === "/dashboard" 
                    ? "text-emerald-400 bg-emerald-500/20 border-emerald-400/30 shadow-lg" 
                    : "text-slate-400 hover:text-emerald-300 hover:bg-emerald-600/10 border-slate-600"
                }`}
                data-testid="nav-dashboard-bottom"
                title="Файлы"
              >
                <Bot size={18} className="shrink-0" />
              </Button>

            </div>
          </div>

          {/* Hidden File Input */}
          <input
            ref={fileInputRef}
            type="file"
            multiple
            onChange={handleFileSelect}
            className="hidden"
            accept="image/*,text/*,.pdf,.doc,.docx"
          />
        </div>
      </div>

      {/* Event Board - Responsive */}
      {showEventBoard && (
        <>
          {/* Desktop Side Panel */}
          <div className="hidden md:block w-1/3 border-l border-border bg-card">
            <div className="flex items-center justify-between p-4 border-b border-border">
              <h2 className="text-lg font-semibold">{t('view.events')}</h2>
              <Button 
                variant="ghost" 
                size="sm" 
                onClick={() => setShowEventBoard(false)}
                data-testid="button-close-events"
              >
                <X size={16} />
              </Button>
            </div>
            <div className="h-[calc(100vh-8rem)] flex flex-col">
              <EventBoard 
                activeSession={activeSession} 
                currentView={eventBoardView}
                onViewChange={setEventBoardView}
                thinkingProcess={thinkingProcess}
                isThinking={isThinking || isProcessing}
              />
            </div>
          </div>
          
          {/* Mobile Modal Overlay */}
          <div className="md:hidden fixed inset-0 bg-black/50 z-50 flex">
            <div className="bg-card w-full max-w-sm ml-auto border-l border-border flex flex-col">
              <div className="flex items-center justify-between p-4 border-b border-border">
                <h2 className="text-lg font-semibold">{t('view.events')}</h2>
                <Button 
                  variant="ghost" 
                  size="sm" 
                  onClick={() => setShowEventBoard(false)}
                  data-testid="button-close-events-mobile"
                >
                  <X size={16} />
                </Button>
              </div>
              <div className="flex-1 min-h-0 flex flex-col">
                <EventBoard 
                  activeSession={activeSession} 
                  currentView={eventBoardView}
                  onViewChange={setEventBoardView}
                  isMobile={true}
                  thinkingProcess={thinkingProcess}
                  isThinking={isThinking || isProcessing}
                />
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
