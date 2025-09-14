import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import EventBoard from "@/components/EventBoard";
import BrowserPreview from "@/components/BrowserPreview";
import AutomationSettings from "../components/AutomationSettings";
import { useSSE } from "@/hooks/useSSE";
import { useLanguage } from "@/hooks/useLanguage";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import { Link } from "wouter";

interface DashboardProps {
  activeSession: string;
  onSessionChange: (sessionId: string) => void;
  selectedModel: string;
  setSelectedModel: (model: string) => void;
}

export default function Dashboard({ 
  activeSession: propActiveSession,
  onSessionChange,
  selectedModel,
  setSelectedModel
}: DashboardProps) {
  const [localActiveSession, setLocalActiveSession] = useState<string | null>(null);
  
  // Use prop value if available, otherwise use local state
  const activeSession = propActiveSession || localActiveSession;
  const [currentView, setCurrentView] = useState<'browser' | 'artifacts' | 'logs' | 'reports' | 'settings'>('browser');
  const [isMobile, setIsMobile] = useState(false);
  const { t } = useLanguage();
  
  // Get active sessions from API
  const { data: sessions = [] } = useQuery<any[]>({
    queryKey: ['/api/sessions/active'],
    refetchInterval: 5000, // Refresh every 5 seconds
    staleTime: 1000, // Cache for 1 second
  });

  // Auto-select first active session if none selected and no prop provided
  useEffect(() => {
    if (Array.isArray(sessions) && sessions.length > 0 && !activeSession) {
      const sessionId = sessions[0].id;
      if (propActiveSession) {
        // If we have a prop, ignore this auto-selection
        return;
      }
      setLocalActiveSession(sessionId);
      onSessionChange?.(sessionId);
    }
  }, [sessions, activeSession, propActiveSession, onSessionChange]);
  
  // Read session from URL params on mount (optional override)
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const sessionParam = urlParams.get('session');
    if (sessionParam && !propActiveSession) {
      setLocalActiveSession(sessionParam);
      onSessionChange?.(sessionParam);
    }
  }, []);

  // Check if mobile
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768);
    };
    
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);
  
  // Subscribe to SSE events
  useSSE(activeSession);

  return (
    <div className="flex flex-col h-screen bg-background text-foreground">
      {/* Улучшенный хедер с отображением сессии */}
      <div className="border-b border-border p-4 bg-gradient-to-r from-card to-card/90">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center space-x-4">
            <h1 className="text-2xl font-bold text-foreground">
              {t('dashboard.title', 'Automation Dashboard')}
            </h1>
            {activeSession && (
              <div className="flex items-center space-x-2 px-3 py-1.5 bg-emerald-500/20 border border-emerald-400/30 rounded-lg">
                <div className="w-2 h-2 bg-emerald-400 rounded-full animate-pulse"></div>
                <span className="text-sm font-medium text-emerald-300">
                  {t('dashboard.session', 'Session')}: {activeSession}
                </span>
              </div>
            )}
          </div>
          
          <Link href="/">
            <Button 
              variant="outline" 
              size="default"
              className="border-blue-400/40 text-blue-300 hover:bg-blue-500/20 hover:border-blue-300/50 transition-all duration-300 shadow-lg hover:shadow-blue-500/20 group"
              data-testid="button-back-to-chat"
            >
              <ArrowLeft size={16} className="mr-2 group-hover:-translate-x-1 transition-transform duration-300" />
              <span className="font-semibold">{t('dashboard.back', 'Back to Chat')}</span>
            </Button>
          </Link>
        </div>
        
        <div className="flex space-x-2">
          <Button
            variant={currentView === 'browser' ? 'secondary' : 'ghost'}
            onClick={() => setCurrentView('browser')}
            data-testid="tab-browser"
            className="flex items-center space-x-2"
          >
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M4.083 9h1.946c.089-1.546.383-2.97.837-4.118A6.004 6.004 0 004.083 9zM10 2a8 8 0 100 16 8 8 0 000-16zm0 2c-.076 0-.232.032-.465.262-.238.234-.497.623-.737 1.182-.389.907-.673 2.142-.766 3.556h3.936c-.093-1.414-.377-2.649-.766-3.556-.24-.56-.5-.948-.737-1.182C10.232 4.032 10.076 4 10 4zm3.971 5c-.089-1.546-.383-2.97-.837-4.118A6.004 6.004 0 0115.917 9h-1.946zm-2.003 2H8.032c.093 1.414.377 2.649.766 3.556.24.56.5.948.737 1.182.233.23.389.262.465.262.076 0 .232-.032.465-.262.238-.234.498-.623.737-1.182.389-.907.673-2.142.766-3.556zm1.166 4.118c.454-1.147.748-2.572.837-4.118h1.946a6.004 6.004 0 01-2.783 4.118zm-6.268 0C6.412 13.97 6.118 12.546 6.03 11H4.083a6.004 6.004 0 002.783 4.118z" clipRule="evenodd" />
            </svg>
            <span>{t('dashboard.browser', 'Browser')}</span>
          </Button>
          <Button
            variant={currentView === 'artifacts' ? 'secondary' : 'ghost'}
            onClick={() => setCurrentView('artifacts')}
            data-testid="tab-artifacts"
            className="flex items-center space-x-2"
          >
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
              <path d="M4 3a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V5a2 2 0 00-2-2H4zm12 12H4l4-8 3 6 2-4 3 6z"/>
            </svg>
            <span>{t('dashboard.files', 'Files')}</span>
          </Button>
          <Button
            variant={currentView === 'logs' ? 'secondary' : 'ghost'}
            onClick={() => setCurrentView('logs')}
            data-testid="tab-logs"
            className="flex items-center space-x-2"
          >
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M3 4a1 1 0 011-1h12a1 1 0 011 1v2a1 1 0 01-1 1H4a1 1 0 01-1-1V4zm0 4a1 1 0 011-1h12a1 1 0 011 1v2a1 1 0 01-1 1H4a1 1 0 01-1-1V8zm0 4a1 1 0 011-1h12a1 1 0 011 1v2a1 1 0 01-1 1H4a1 1 0 01-1-1v-2z" clipRule="evenodd" />
            </svg>
            <span>{t('dashboard.logs', 'Logs')}</span>
          </Button>
          <Button
            variant={currentView === 'reports' ? 'secondary' : 'ghost'}
            onClick={() => setCurrentView('reports')}
            data-testid="tab-reports"
            className="flex items-center space-x-2"
          >
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z" clipRule="evenodd" />
            </svg>
            <span>🤖 Agent Reports</span>
          </Button>
          <Button
            variant={currentView === 'settings' ? 'secondary' : 'ghost'}
            onClick={() => setCurrentView('settings')}
            data-testid="tab-settings"
            className="flex items-center space-x-2"
          >
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M11.49 3.17c-.38-1.56-2.6-1.56-2.98 0a1.532 1.532 0 01-2.286.948c-1.372-.836-2.942.734-2.106 2.106.54.886.061 2.042-.947 2.287-1.561.379-1.561 2.6 0 2.978a1.532 1.532 0 01.947 2.287c-.836 1.372.734 2.942 2.106 2.106a1.532 1.532 0 012.287.947c.379 1.561 2.6 1.561 2.978 0a1.533 1.533 0 012.287-.947c1.372.836 2.942-.734 2.106-2.106a1.533 1.533 0 01.947-2.287c1.561-.379 1.561-2.6 0-2.978a1.532 1.532 0 01-.947-2.287c.836-1.372-.734-2.942-2.106-2.106a1.532 1.532 0 01-2.287-.947zM10 13a3 3 0 100-6 3 3 0 000 6z" clipRule="evenodd" />
            </svg>
            <span>{t('dashboard.settings', 'Settings')}</span>
          </Button>
        </div>
      </div>

      {/* Основной контент */}
      <div className="flex-1 overflow-auto">
        {currentView === 'browser' ? (
          <BrowserPreview activeSession={activeSession} />
        ) : currentView === 'settings' ? (
          <AutomationSettings />
        ) : (
          <EventBoard 
            activeSession={activeSession}
            currentView={currentView}
            onViewChange={setCurrentView}
            isMobile={isMobile}
          />
        )}
      </div>
    </div>
  );
}
