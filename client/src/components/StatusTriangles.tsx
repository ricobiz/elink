import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";

interface StatusTrianglesProps {
  activeSession?: string;
  selectedModel?: string;
  automationMode?: boolean;
  contextEnabled?: boolean;
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

export default function StatusTriangles({ 
  activeSession, 
  selectedModel = 'openai/gpt-4o-mini',
  automationMode = true,
  contextEnabled = false
}: StatusTrianglesProps) {
  const [isBlinking, setIsBlinking] = useState<{blue: boolean, green: boolean, orange: boolean}>({
    blue: false,
    green: false,
    orange: false
  });

  // Load health status for service checks
  const { data: healthData } = useQuery({
    queryKey: ['/api/status/health'],
    refetchInterval: 30000, // Update every 30 seconds to reduce Redis stress
    staleTime: 10000,
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
  
  // Blue Triangle: Context + Subscription Status
  const subscriptionActive = (authData as any)?.subscription?.active === true;
  const sessionContextEnabled = (sessionData as any)?.contextEnabled === true;
  const blueStatus = subscriptionActive && sessionContextEnabled && contextEnabled;

  // Green Triangle: AI Model Status (check if OpenRouter service is operational)
  const aiService = services.find(s => s.name === 'OpenRouter');
  const greenStatus = aiService?.status === 'operational' && Boolean(selectedModel);

  // Orange Triangle: Automation + Browser Status
  const browserService = services.find(s => s.name === 'Browser');
  const orangeStatus = browserService?.status === 'operational' && automationMode;

  // Blinking animation on status changes
  useEffect(() => {
    setIsBlinking(prev => ({ ...prev, blue: true }));
    const timer = setTimeout(() => setIsBlinking(prev => ({ ...prev, blue: false })), 500);
    return () => clearTimeout(timer);
  }, [blueStatus]);

  useEffect(() => {
    setIsBlinking(prev => ({ ...prev, green: true }));
    const timer = setTimeout(() => setIsBlinking(prev => ({ ...prev, green: false })), 500);
    return () => clearTimeout(timer);
  }, [greenStatus]);

  useEffect(() => {
    setIsBlinking(prev => ({ ...prev, orange: true }));
    const timer = setTimeout(() => setIsBlinking(prev => ({ ...prev, orange: false })), 500);
    return () => clearTimeout(timer);
  }, [orangeStatus]);

  const getTriangleClass = (isActive: boolean, color: 'blue' | 'green' | 'orange', isBlinking: boolean) => {
    const baseClass = `
      w-0 h-0
      border-l-[4px] border-l-transparent
      border-r-[4px] border-r-transparent
      border-b-[7px]
      transition-all duration-300 ease-in-out
    `;

    const colors = {
      blue: {
        active: 'border-b-blue-400 drop-shadow-[0_0_6px_rgba(59,130,246,0.8)]',
        inactive: 'border-b-blue-600 opacity-40'
      },
      green: {
        active: 'border-b-green-400 drop-shadow-[0_0_6px_rgba(34,197,94,0.8)]',
        inactive: 'border-b-green-600 opacity-40'
      },
      orange: {
        active: 'border-b-orange-400 drop-shadow-[0_0_6px_rgba(251,146,60,0.8)]',
        inactive: 'border-b-orange-600 opacity-40'
      }
    };

    const colorClass = isActive ? colors[color].active : colors[color].inactive;
    const blinkClass = isBlinking ? 'animate-pulse scale-110' : '';

    return `${baseClass} ${colorClass} ${blinkClass}`;
  };

  const getTooltip = (type: 'blue' | 'green' | 'orange') => {
    switch (type) {
      case 'blue':
        if (!subscriptionActive) return 'Subscription required for context';
        if (!sessionContextEnabled && !contextEnabled) return 'Context disabled';
        return blueStatus ? 'Context active' : 'Context inactive';
      case 'green':
        if (!aiService) return 'AI service checking...';
        if (aiService.status !== 'operational') return `AI service: ${aiService.status}`;
        return greenStatus ? `AI ready: ${selectedModel?.split('/')[1] || selectedModel}` : 'AI model not selected';
      case 'orange':
        if (!browserService) return 'Browser service checking...';
        if (browserService.status !== 'operational') return `Browser service: ${browserService.status}`;
        return orangeStatus ? 'Automation ready' : 'Automation disabled';
    }
  };

  return (
    <div className="flex items-center space-x-3" data-testid="status-triangles">
      {/* Blue Triangle - Context/Subscription */}
      <div className="relative group">
        <div
          className={getTriangleClass(blueStatus, 'blue', isBlinking.blue)}
          style={{
            filter: blueStatus 
              ? 'drop-shadow(0 0 6px rgba(59,130,246,0.8))' 
              : 'none'
          }}
          data-testid="triangle-context"
        />
        <div className="absolute -top-8 left-1/2 transform -translate-x-1/2 bg-gray-900 text-white text-xs px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-50">
          {getTooltip('blue')}
        </div>
      </div>

      {/* Green Triangle - AI Model */}
      <div className="relative group">
        <div
          className={getTriangleClass(greenStatus, 'green', isBlinking.green)}
          style={{
            filter: greenStatus 
              ? 'drop-shadow(0 0 6px rgba(34,197,94,0.8))' 
              : 'none'
          }}
          data-testid="triangle-ai"
        />
        <div className="absolute -top-8 left-1/2 transform -translate-x-1/2 bg-gray-900 text-white text-xs px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-50">
          {getTooltip('green')}
        </div>
      </div>

      {/* Orange Triangle - Automation/Browser */}
      <div className="relative group">
        <div
          className={getTriangleClass(orangeStatus, 'orange', isBlinking.orange)}
          style={{
            filter: orangeStatus 
              ? 'drop-shadow(0 0 6px rgba(251,146,60,0.8))' 
              : 'none'
          }}
          data-testid="triangle-automation"
        />
        <div className="absolute -top-8 left-1/2 transform -translate-x-1/2 bg-gray-900 text-white text-xs px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-50">
          {getTooltip('orange')}
        </div>
      </div>
    </div>
  );
}