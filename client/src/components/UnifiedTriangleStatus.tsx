import { useEffect, useState, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { Settings, Square } from "lucide-react";
import CompactMenu from "./CompactMenu";

interface UnifiedTriangleStatusProps {
  activeSession?: string;
  selectedModel?: string;
  automationMode?: boolean;
  isThinking?: boolean;
  onStopAutomation?: () => void;
}

interface ServiceStatus {
  name: string;
  status: 'operational' | 'degraded' | 'down';
  endpoint: string;
  lastCheck: Date;
  responseTime?: number;
  error?: string;
  metadata?: any;
}

export default function UnifiedTriangleStatus({ 
  activeSession, 
  selectedModel = 'openai/gpt-4o-mini',
  automationMode = true,
  isThinking = false,
  onStopAutomation
}: UnifiedTriangleStatusProps) {
  const [isBlinking, setIsBlinking] = useState<{context: boolean, ai: boolean, automation: boolean, unified: boolean}>({
    context: false,
    ai: false,
    automation: false,
    unified: false
  });

  // Drag state management
  const [dragState, setDragState] = useState({
    isDragging: false,
    position: { x: 0, y: 0 },
    startPosition: { x: 0, y: 0 },
    offset: { x: 0, y: 0 },
    hasMoved: false
  });

  // Menu state management
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [menuPosition, setMenuPosition] = useState({ x: 0, y: 0 });
  const triangleRef = useRef<HTMLDivElement>(null);

  // Load health status for service checks
  const { data: healthData } = useQuery({
    queryKey: ['/api/status/health'],
    refetchInterval: 5000, // Update every 5 seconds
    staleTime: 1000,
  });

  // Load user subscription status
  const { data: authData } = useQuery({
    queryKey: ['/api/auth/me'],
    staleTime: 30000, // Cache for 30 seconds
  });

  // Load session data for context status
  const { data: sessionData } = useQuery({
    queryKey: ['/api/sessions', activeSession],
    enabled: !!activeSession,
    staleTime: 10000,
  });

  // Calculate statuses
  const services: ServiceStatus[] = (healthData as any)?.services || [];
  
  // Context Status (Blue sector - left)
  const subscriptionActive = (authData as any)?.subscription?.active === true;
  const sessionContextEnabled = (sessionData as any)?.contextEnabled === true;
  const contextStatus = subscriptionActive && sessionContextEnabled;

  // AI Model Status (Green sector - right)  
  const aiService = services.find(s => s.name === 'OpenRouter');
  const aiStatus = aiService?.status === 'operational' && Boolean(selectedModel);

  // Automation Status (Orange sector - bottom)
  const browserService = services.find(s => s.name === 'Browser');
  const automationStatus = browserService?.status === 'operational' && automationMode;

  // Unified Status - all three sectors active
  const allActive = contextStatus && aiStatus && automationStatus;

  // Blinking animation on status changes
  useEffect(() => {
    setIsBlinking(prev => ({ ...prev, context: true }));
    const timer = setTimeout(() => setIsBlinking(prev => ({ ...prev, context: false })), 500);
    return () => clearTimeout(timer);
  }, [contextStatus]);

  useEffect(() => {
    setIsBlinking(prev => ({ ...prev, ai: true }));
    const timer = setTimeout(() => setIsBlinking(prev => ({ ...prev, ai: false })), 500);
    return () => clearTimeout(timer);
  }, [aiStatus]);

  useEffect(() => {
    setIsBlinking(prev => ({ ...prev, automation: true }));
    const timer = setTimeout(() => setIsBlinking(prev => ({ ...prev, automation: false })), 500);
    return () => clearTimeout(timer);
  }, [automationStatus]);

  useEffect(() => {
    setIsBlinking(prev => ({ ...prev, unified: true }));
    const timer = setTimeout(() => setIsBlinking(prev => ({ ...prev, unified: false })), 800);
    return () => clearTimeout(timer);
  }, [allActive]);

  // Mouse event handlers for dragging and clicking
  const handleMouseDown = (e: React.MouseEvent) => {
    if (!allActive) return; // Only allow interaction when all sectors are active
    
    e.preventDefault();
    const startX = e.clientX - dragState.position.x;
    const startY = e.clientY - dragState.position.y;
    
    setDragState(prev => ({
      ...prev,
      isDragging: true,
      startPosition: { x: startX, y: startY },
      offset: { x: startX, y: startY },
      hasMoved: false
    }));
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!dragState.isDragging || !allActive) return;
    
    e.preventDefault();
    const newX = e.clientX - dragState.offset.x;
    const newY = e.clientY - dragState.offset.y;
    
    // Mark as moved if there's significant movement (more than 5px)
    const movement = Math.abs(newX - dragState.position.x) + Math.abs(newY - dragState.position.y);
    if (movement > 5) {
      setDragState(prev => ({
        ...prev,
        position: { x: newX, y: newY },
        hasMoved: true
      }));
    }
  };

  const handleMouseUp = (e: React.MouseEvent) => {
    if (!dragState.isDragging) return;
    
    // If no significant movement occurred, treat as click
    if (!dragState.hasMoved && allActive) {
      handleTriangleClick(e);
    }
    
    setDragState(prev => ({
      ...prev,
      isDragging: false,
      hasMoved: false
    }));
    
    // Smooth return animation to original position with delay
    setTimeout(() => {
      setDragState(prev => ({
        ...prev,
        position: { x: 0, y: 0 }
      }));
    }, 200);
  };

  // Handle click to open menu
  const handleTriangleClick = (e: React.MouseEvent) => {
    if (!allActive || isMenuOpen) return;
    
    // Calculate menu position relative to triangle
    if (triangleRef.current) {
      const rect = triangleRef.current.getBoundingClientRect();
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top;
      
      setMenuPosition({ 
        x: centerX, 
        y: centerY 
      });
      setIsMenuOpen(true);
    }
  };

  // Close menu handler
  const handleCloseMenu = () => {
    setIsMenuOpen(false);
  };

  // Touch event handlers for mobile support
  const handleTouchStart = (e: React.TouchEvent) => {
    if (!allActive) return;
    
    e.preventDefault();
    const touch = e.touches[0];
    const startX = touch.clientX - dragState.position.x;
    const startY = touch.clientY - dragState.position.y;
    
    setDragState(prev => ({
      ...prev,
      isDragging: true,
      startPosition: { x: startX, y: startY },
      offset: { x: startX, y: startY }
    }));
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!dragState.isDragging || !allActive) return;
    
    e.preventDefault();
    const touch = e.touches[0];
    const newX = touch.clientX - dragState.offset.x;
    const newY = touch.clientY - dragState.offset.y;
    
    setDragState(prev => ({
      ...prev,
      position: { x: newX, y: newY }
    }));
  };

  const handleTouchEnd = () => {
    if (!dragState.isDragging) return;
    
    setDragState(prev => ({
      ...prev,
      isDragging: false
    }));
    
    // Smooth return animation to original position with delay
    setTimeout(() => {
      setDragState(prev => ({
        ...prev,
        position: { x: 0, y: 0 }
      }));
    }, 200);
  };

  // Global event listeners for mouse events outside component
  useEffect(() => {
    if (dragState.isDragging) {
      const handleGlobalMouseMove = (e: MouseEvent) => {
        if (!allActive) return;
        
        const newX = e.clientX - dragState.offset.x;
        const newY = e.clientY - dragState.offset.y;
        
        setDragState(prev => ({
          ...prev,
          position: { x: newX, y: newY }
        }));
      };

      const handleGlobalMouseUp = () => {
        setDragState(prev => ({
          ...prev,
          isDragging: false,
          hasMoved: false
        }));
        
        // Smooth return animation to original position with delay
        setTimeout(() => {
          setDragState(prev => ({
            ...prev,
            position: { x: 0, y: 0 }
          }));
        }, 200);
      };

      document.addEventListener('mousemove', handleGlobalMouseMove);
      document.addEventListener('mouseup', handleGlobalMouseUp);
      
      return () => {
        document.removeEventListener('mousemove', handleGlobalMouseMove);
        document.removeEventListener('mouseup', handleGlobalMouseUp);
      };
    }
  }, [dragState.isDragging, dragState.offset.x, dragState.offset.y, allActive]);

  const getSectorColor = (sectorType: 'context' | 'ai' | 'automation', isActive: boolean) => {
    const colors = {
      context: {
        active: '#60a5fa', // blue-400
        inactive: '#1e40af', // blue-700
        glow: 'rgba(59,130,246,0.8)'
      },
      ai: {
        active: '#4ade80', // green-400
        inactive: '#15803d', // green-700
        glow: 'rgba(34,197,94,0.8)'
      },
      automation: {
        active: '#fb923c', // orange-400
        inactive: '#c2410c', // orange-700
        glow: 'rgba(251,146,60,0.8)'
      }
    };

    return colors[sectorType][isActive ? 'active' : 'inactive'];
  };

  const getSectorGlow = (sectorType: 'context' | 'ai' | 'automation') => {
    const colors = {
      context: 'rgba(59,130,246,0.8)',
      ai: 'rgba(34,197,94,0.8)',
      automation: 'rgba(251,146,60,0.8)'
    };
    return colors[sectorType];
  };

  const getTooltip = (type: 'context' | 'ai' | 'automation') => {
    switch (type) {
      case 'context':
        if (!subscriptionActive) return 'Subscription required for context';
        if (!sessionContextEnabled) return 'Context disabled';
        return contextStatus ? 'Context active' : 'Context inactive';
      case 'ai':
        if (!aiService) return 'AI service checking...';
        if (aiService.status !== 'operational') return `AI service: ${aiService.status}`;
        return aiStatus ? `AI ready: ${selectedModel?.split('/')[1] || selectedModel}` : 'AI model not selected';
      case 'automation':
        if (!browserService) return 'Browser service checking...';
        if (browserService.status !== 'operational') return `Browser service: ${browserService.status}`;
        return automationStatus ? 'Automation ready' : 'Automation disabled';
    }
  };

  return (
    <>
      <div className="flex items-center justify-center" data-testid="unified-triangle-status">
        <div 
          ref={triangleRef}
          className={`relative transition-transform duration-300 ${
            allActive 
              ? (dragState.isDragging 
                  ? 'cursor-grabbing scale-110' 
                  : 'cursor-pointer hover:scale-105')
              : 'cursor-default'
          }`}
          style={{
            transform: `translate(${dragState.position.x}px, ${dragState.position.y}px)`,
            transition: dragState.isDragging ? 'none' : 'transform 0.5s cubic-bezier(0.4, 0, 0.2, 1)'
          }}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
          data-testid="triangle-container"
        >
        {/* Conditional render: Thinking gear or Triangle */}
        {isThinking ? (
          // Spinning gear when AI is thinking + Stop button
          <div className="flex items-center justify-center space-x-2">
            <Settings 
              size={28}
              className={`transition-all duration-300 animate-spin text-blue-400 ${
                allActive 
                  ? (dragState.isDragging
                      ? 'drop-shadow-[0_0_20px_rgba(59,130,246,1)] scale-125 brightness-110' 
                      : 'drop-shadow-[0_0_12px_rgba(59,130,246,0.8)] scale-110')
                  : 'drop-shadow-[0_0_4px_rgba(100,116,139,0.3)]'
              }`}
              data-testid="thinking-gear"
            />
            
            {/* Stop button - only show when automation is active */}
            {automationMode && onStopAutomation && (
              <div className="group relative">
                <button
                  onClick={(e) => {
                    e.stopPropagation(); // Prevent triggering drag/click events
                    onStopAutomation();
                  }}
                  className="flex items-center justify-center w-6 h-6 bg-red-500 hover:bg-red-600 active:bg-red-700 text-white rounded transition-all duration-200 hover:scale-110 focus:outline-none focus:ring-2 focus:ring-red-400 focus:ring-offset-2 focus:ring-offset-gray-800"
                  title="Stop automation"
                  data-testid="button-stop-automation"
                  aria-label="Stop automation"
                >
                  <Square 
                    size={12}
                    className="fill-current"
                  />
                </button>
                
                {/* Tooltip */}
                <div className="absolute -top-10 left-1/2 transform -translate-x-1/2 bg-gray-900 text-white text-xs px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-50">
                  Stop automation
                </div>
              </div>
            )}
          </div>
        ) : (
          // Main SVG Triangle
          <svg 
            width="32" 
            height="28" 
            viewBox="0 0 32 28" 
            className={`transition-all duration-300 ${
              allActive 
                ? (dragState.isDragging
                    ? 'drop-shadow-[0_0_20px_rgba(147,197,253,1)] scale-125 brightness-110' 
                    : 'drop-shadow-[0_0_12px_rgba(147,197,253,0.8)] scale-110 animate-pulse')
                : 'drop-shadow-[0_0_4px_rgba(100,116,139,0.3)]'
            } ${
              isBlinking.unified && allActive ? 'animate-pulse' : ''
            }`}
            data-testid="triangle-unified"
          >
            {/* Define gradients for glow effects */}
            <defs>
              <radialGradient id="contextGlow" cx="50%" cy="50%" r="50%">
                <stop offset="0%" stopColor={getSectorGlow('context')} stopOpacity="0.8"/>
                <stop offset="100%" stopColor={getSectorGlow('context')} stopOpacity="0.1"/>
              </radialGradient>
              <radialGradient id="aiGlow" cx="50%" cy="50%" r="50%">
                <stop offset="0%" stopColor={getSectorGlow('ai')} stopOpacity="0.8"/>
                <stop offset="100%" stopColor={getSectorGlow('ai')} stopOpacity="0.1"/>
              </radialGradient>
              <radialGradient id="automationGlow" cx="50%" cy="50%" r="50%">
                <stop offset="0%" stopColor={getSectorGlow('automation')} stopOpacity="0.8"/>
                <stop offset="100%" stopColor={getSectorGlow('automation')} stopOpacity="0.1"/>
              </radialGradient>
              
              {/* Unified glow when all active */}
              <radialGradient id="unifiedGlow" cx="50%" cy="50%" r="70%">
                <stop offset="0%" stopColor="rgba(147,197,253,0.9)" stopOpacity="0.8"/>
                <stop offset="50%" stopColor="rgba(34,197,94,0.6)" stopOpacity="0.4"/>
                <stop offset="100%" stopColor="rgba(251,146,60,0.6)" stopOpacity="0.1"/>
              </radialGradient>
            </defs>

            {/* Background glow circle when all active */}
            {allActive && (
              <circle 
                cx="16" 
                cy="14" 
                r="17" 
                fill="url(#unifiedGlow)" 
                className={`opacity-60 ${isBlinking.unified ? 'animate-pulse' : ''}`}
              />
            )}
            
            {/* Left Sector - Context (Blue) */}
            <path
              d="M 16 20 L 5 4 L 16 10 Z"
              fill={getSectorColor('context', contextStatus)}
              stroke="rgba(51,65,85,0.8)"
              strokeWidth="0.5"
              className={`transition-all duration-300 cursor-pointer hover:brightness-110 ${
                contextStatus 
                  ? 'drop-shadow-[0_0_8px_rgba(59,130,246,0.6)]' 
                  : 'opacity-60'
              } ${
                isBlinking.context ? 'animate-pulse scale-105' : ''
              }`}
              data-testid="sector-context"
            />
            
            {/* Right Sector - AI Model (Green) */}
            <path
              d="M 16 20 L 16 10 L 27 4 Z"
              fill={getSectorColor('ai', aiStatus)}
              stroke="rgba(51,65,85,0.8)"
              strokeWidth="0.5"
              className={`transition-all duration-300 cursor-pointer hover:brightness-110 ${
                aiStatus 
                  ? 'drop-shadow-[0_0_8px_rgba(34,197,94,0.6)]' 
                  : 'opacity-60'
              } ${
                isBlinking.ai ? 'animate-pulse scale-105' : ''
              }`}
              data-testid="sector-ai"
            />
            
            {/* Bottom Sector - Automation (Orange) */}
            <path
              d="M 5 4 L 16 10 L 27 4 Z"
              fill={getSectorColor('automation', automationStatus)}
              stroke="rgba(51,65,85,0.8)"
              strokeWidth="0.5"
              className={`transition-all duration-300 cursor-pointer hover:brightness-110 ${
                automationStatus 
                  ? 'drop-shadow-[0_0_8px_rgba(251,146,60,0.6)]' 
                  : 'opacity-60'
              } ${
                isBlinking.automation ? 'animate-pulse scale-105' : ''
              }`}
              data-testid="sector-automation"
            />
            
            {/* Central connection point */}
            <circle 
              cx="16" 
              cy="10" 
              r="1" 
              fill="rgba(100,116,139,0.8)"
              className="transition-all duration-300"
            />
          </svg>
        )}
        
        {/* Tooltip areas - invisible overlays for hover */}
        <div className="absolute inset-0">
          {/* Context tooltip area (left sector) */}
          <div 
            className="absolute top-1 left-0 w-6 h-8 group cursor-pointer"
            style={{ clipPath: 'polygon(50% 0%, 0% 100%, 50% 80%)' }}
          >
            <div className="absolute -top-10 left-1/2 transform -translate-x-1/2 bg-gray-900 text-white text-xs px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-50">
              {getTooltip('context')}
            </div>
          </div>
          
          {/* AI tooltip area (right sector) */}
          <div 
            className="absolute top-1 right-0 w-6 h-8 group cursor-pointer"
            style={{ clipPath: 'polygon(50% 0%, 100% 100%, 50% 80%)' }}
          >
            <div className="absolute -top-10 left-1/2 transform -translate-x-1/2 bg-gray-900 text-white text-xs px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-50">
              {getTooltip('ai')}
            </div>
          </div>
          
          {/* Automation tooltip area (bottom sector) */}
          <div 
            className="absolute bottom-0 left-1/2 transform -translate-x-1/2 w-8 h-4 group cursor-pointer"
            style={{ clipPath: 'polygon(0% 0%, 50% 100%, 100% 0%)' }}
          >
            <div className="absolute -top-10 left-1/2 transform -translate-x-1/2 bg-gray-900 text-white text-xs px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-50">
              {getTooltip('automation')}
            </div>
          </div>
        </div>
        
        {/* Unified status indicator - small dot at top when all active */}
        {allActive && (
          <div 
            className={`absolute -top-1 left-1/2 transform -translate-x-1/2 w-2 h-2 bg-white rounded-full border border-blue-300 ${
              isBlinking.unified ? 'animate-ping' : 'animate-pulse'
            }`}
            data-testid="unified-indicator"
          />
        )}
        </div>
      </div>
      
      {/* Compact Menu */}
      <CompactMenu
        isOpen={isMenuOpen}
        onClose={handleCloseMenu}
        position={menuPosition}
        activeSession={activeSession ?? null}
        selectedModel={selectedModel}
        automationMode={automationMode}
      />
    </>
  );
}