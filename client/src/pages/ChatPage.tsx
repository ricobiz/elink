import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import ChatInterface from "@/components/ChatInterface";

interface ChatPageProps {
  activeSession?: string;
  onSessionChange?: (sessionId: string) => void;
  automationMode?: boolean;
  setAutomationMode?: (mode: boolean) => void;
  selectedModel?: string;
  setSelectedModel?: (model: string) => void;
  onThinkingChange?: (isThinking: boolean) => void;
}

export default function ChatPage({ 
  activeSession: propActiveSession, 
  onSessionChange: propOnSessionChange,
  automationMode: propAutomationMode,
  setAutomationMode: propSetAutomationMode,
  selectedModel,
  setSelectedModel,
  onThinkingChange
}: ChatPageProps = {}) {
  const [localActiveSession, setLocalActiveSession] = useState<string>("");
  const [localAutomationMode, setLocalAutomationMode] = useState<boolean>(true);
  const [isPaused, setIsPaused] = useState<boolean>(false);
  const [isThinking, setIsThinking] = useState<boolean>(false);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const { toast } = useToast();
  
  // Use prop values if available, otherwise use local state
  const activeSession = propActiveSession ?? localActiveSession;
  const setActiveSession = propOnSessionChange ?? setLocalActiveSession;
  const automationMode = propAutomationMode ?? localAutomationMode;
  const setAutomationMode = propSetAutomationMode ?? setLocalAutomationMode;
  
  // Handle pause toggle function with proper side-effects
  const handlePauseToggle = () => {
    if (isPaused) {
      // Resuming
      setIsPaused(false);
      setIsThinking(false);
      toast({
        title: "Процесс возобновлен",
        description: "ИИ продолжит обработку",
      });
    } else {
      // Pausing
      setIsPaused(true);
      setIsThinking(false);
      setIsProcessing(false);
      toast({
        title: "Процесс приостановлен",
        description: "Все ИИ операции остановлены",
        variant: "default"
      });
    }
  };
  
  // Handle thinking change from ChatInterface
  const handleThinkingChange = (thinking: boolean) => {
    setIsThinking(thinking);
    if (onThinkingChange) {
      onThinkingChange(thinking);
    }
  };

  const { data: sessions = [] } = useQuery<any[]>({
    queryKey: ['/api/sessions/active'],
    refetchInterval: false, // Отключен - используем SSE для real-time обновлений
    staleTime: 30000, // Кешируем на 30 секунд
  });

  // Auto-select first active session
  useEffect(() => {
    if (Array.isArray(sessions) && sessions.length > 0 && !activeSession) {
      setActiveSession(sessions[0].id);
    }
  }, [sessions, activeSession]);

  return (
    <div className="w-full h-full">
      <ChatInterface 
        activeSession={activeSession}
        onSessionChange={setActiveSession}
        automationMode={automationMode}
        setAutomationMode={setAutomationMode}
        selectedModel={selectedModel}
        setSelectedModel={setSelectedModel}
        onThinkingChange={handleThinkingChange}
        isPaused={isPaused}
        handlePauseToggle={handlePauseToggle}
        isThinking={isThinking}
        isProcessing={isProcessing}
        onProcessingChange={setIsProcessing}
      />
    </div>
  );
}