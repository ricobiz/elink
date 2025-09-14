import { useState, useRef, useEffect } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { useLanguage } from "@/hooks/useLanguage";
import { Mic, MicOff, Send, X } from "lucide-react";

interface CompactMenuProps {
  isOpen: boolean;
  onClose: () => void;
  position: { x: number; y: number };
  activeSession: string | null;
  selectedModel?: string;
  automationMode?: boolean;
}

export default function CompactMenu({
  isOpen,
  onClose,
  position,
  activeSession,
  selectedModel = 'openai/gpt-4o-mini',
  automationMode = true
}: CompactMenuProps) {
  const [inputText, setInputText] = useState("");
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const recognitionRef = useRef<any>(null);
  const { toast } = useToast();
  const { language, t } = useLanguage();
  const queryClient = useQueryClient();

  // Auto-focus input when menu opens
  useEffect(() => {
    if (isOpen && inputRef.current) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [isOpen]);

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

  // Handle click outside to close menu
  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        onClose();
      }
    };

    const handleEscKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscKey);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscKey);
    };
  }, [isOpen, onClose]);

  // Send message mutation
  const processMessageMutation = useMutation({
    mutationFn: async ({ message }: { message: string }) => {
      if (!activeSession) {
        throw new Error(t('error.no.session'));
      }
      
      const formData = new FormData();
      formData.append('message', message);
      formData.append('model', selectedModel);
      formData.append('sessionId', activeSession);
      formData.append('automationMode', automationMode.toString());
      
      const response = await fetch('/api/chat/process', {
        method: 'POST',
        body: formData,
      });
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      return response.json();
    },
    onMutate: () => {
      setIsProcessing(true);
    },
    onSuccess: (data) => {
      // Invalidate queries to refresh the chat
      queryClient.invalidateQueries({ queryKey: ['/api/chat/messages', activeSession] });
      queryClient.invalidateQueries({ queryKey: ['/api/artifacts'] });
      
      // Show success feedback
      toast({
        title: "✓ Command Sent",
        description: "AI is processing your request",
      });
      
      // Clear input and close menu
      setInputText("");
      onClose();
      setIsProcessing(false);
    },
    onError: (error: any) => {
      setIsProcessing(false);
      toast({
        title: t('error.message.process'),
        description: error.message || t('error.message.process.desc'),
        variant: "destructive",
      });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim() || isProcessing) return;
    
    processMessageMutation.mutate({ message: inputText.trim() });
  };

  const toggleRecording = () => {
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
      try {
        recognitionRef.current.start();
        setIsRecording(true);
      } catch (error) {
        console.error('Speech recognition start error:', error);
        toast({
          title: t('voice.error.title'),
          description: t('voice.error.desc'),
          variant: "destructive"
        });
      }
    }
  };

  if (!isOpen) return null;

  return (
    <div 
      ref={menuRef}
      className="fixed z-50 w-80 bg-gray-900 border border-gray-700 rounded-lg shadow-2xl p-4 transition-all duration-300 ease-out"
      style={{
        left: `${position.x}px`,
        top: `${position.y}px`,
        transform: 'translate(-50%, -100%) translateY(-10px)',
        background: 'linear-gradient(135deg, rgba(15,23,42,0.95) 0%, rgba(30,41,59,0.95) 100%)',
        backdropFilter: 'blur(10px)',
        border: '1px solid rgba(59,130,246,0.3)',
        boxShadow: '0 0 30px rgba(59,130,246,0.2), 0 8px 32px rgba(0,0,0,0.3)'
      }}
      data-testid="compact-menu"
    >
      {/* Close button */}
      <Button
        variant="ghost"
        size="sm"
        className="absolute top-2 right-2 h-6 w-6 p-0 text-gray-400 hover:text-white hover:bg-gray-700"
        onClick={onClose}
        data-testid="button-close-menu"
      >
        <X className="h-3 w-3" />
      </Button>

      {/* Header */}
      <div className="mb-3">
        <h3 className="text-sm font-medium text-white flex items-center gap-2">
          <div className="w-2 h-2 bg-blue-400 rounded-full animate-pulse" />
          Quick Command
        </h3>
        <p className="text-xs text-gray-400 mt-1">
          Send command to AI (Session: {activeSession?.slice(-6) || 'none'})
        </p>
      </div>

      {/* Input form */}
      <form onSubmit={handleSubmit} className="space-y-3">
        <div className="relative">
          <Input
            ref={inputRef}
            type="text"
            placeholder={t('chat.input.placeholder')}
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            disabled={isProcessing}
            className="pr-20 bg-gray-800 border-gray-600 text-white placeholder-gray-400 focus:border-blue-500 focus:ring-blue-500/20"
            data-testid="input-command"
          />
          
          {/* Voice button */}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className={`absolute right-10 top-1/2 transform -translate-y-1/2 h-6 w-6 p-0 transition-colors ${
              isRecording 
                ? 'text-red-400 hover:text-red-300 animate-pulse' 
                : 'text-gray-400 hover:text-white'
            }`}
            onClick={toggleRecording}
            disabled={isProcessing}
            data-testid="button-voice"
          >
            {isRecording ? <MicOff className="h-3 w-3" /> : <Mic className="h-3 w-3" />}
          </Button>

          {/* Send button */}
          <Button
            type="submit"
            variant="ghost"
            size="sm"
            className="absolute right-1 top-1/2 transform -translate-y-1/2 h-6 w-6 p-0 text-blue-400 hover:text-blue-300 disabled:opacity-50"
            disabled={!inputText.trim() || isProcessing}
            data-testid="button-send"
          >
            <Send className="h-3 w-3" />
          </Button>
        </div>

        {/* Status indicators */}
        <div className="flex items-center justify-between text-xs text-gray-500">
          <div className="flex items-center gap-2">
            {isRecording && (
              <span className="text-red-400 animate-pulse">🎤 Recording...</span>
            )}
            {isProcessing && (
              <span className="text-blue-400 animate-pulse">⚡ Processing...</span>
            )}
          </div>
          
          <div className="flex items-center gap-2">
            <span>Model: {selectedModel?.split('/')[1] || 'default'}</span>
            {automationMode && (
              <span className="text-orange-400">🤖 Auto</span>
            )}
          </div>
        </div>
      </form>

      {/* Triangle indicator pointing to the triangle status */}
      <div 
        className="absolute bottom-0 left-1/2 transform -translate-x-1/2 translate-y-full"
        style={{
          width: 0,
          height: 0,
          borderLeft: '8px solid transparent',
          borderRight: '8px solid transparent',
          borderTop: '8px solid rgba(59,130,246,0.3)',
        }}
      />
    </div>
  );
}