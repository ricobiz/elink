import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useState } from "react";
import { RefreshCw, Camera, Download, Play, Pause, Terminal, FileImage, X } from "lucide-react";
import { Dialog, DialogContent, DialogTrigger, DialogTitle, DialogDescription, VisuallyHidden } from "@/components/ui/dialog";
import { useLanguage } from "@/hooks/useLanguage";
import { AutomationProgress } from "@/components/AutomationProgress";

interface EventBoardProps {
  activeSession: string | null;
  currentView: 'browser' | 'artifacts' | 'logs' | 'reports';
  onViewChange: (view: 'browser' | 'artifacts' | 'logs' | 'reports') => void;
  isMobile?: boolean;
  thinkingProcess?: any[];
  isThinking?: boolean;
}

interface Event {
  id: string;
  sessionId: string | null;
  route: string;
  method?: string;
  status: number;
  payload: any;
  responseText: string | null;
  timestamp: string;
  duration: number | null;
}

interface Artifact {
  id: string;
  type: string;
  filePath: string;
  sessionId: string;
  createdAt: string;
  metadata: any;
}

export default function EventBoard({ activeSession, currentView, onViewChange, isMobile = false, thinkingProcess = [], isThinking = false }: EventBoardProps) {
  const [isPaused, setIsPaused] = useState(false);
  const [url, setUrl] = useState("https://www.google.com");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const { t } = useLanguage();

  // Fetch events
  const { data: events = [], refetch: refetchEvents } = useQuery<Event[]>({
    queryKey: ['/api/events/recent?limit=20'],
    refetchInterval: isPaused ? false : 15000, // Reduced from 3000 to 15000 to fix NetworkError
    staleTime: 5000,
  });

  // Fetch artifacts (filtered by session)
  const { data: allArtifacts = [] } = useQuery<Artifact[]>({
    queryKey: ['/api/artifacts'],
    refetchInterval: 20000, // Reduced from 5000 to 20000 to fix NetworkError
    enabled: currentView === 'artifacts',
  });

  // Filter artifacts by active session
  const artifacts = allArtifacts.filter(artifact => 
    activeSession && artifact.sessionId === activeSession
  );

  // Fetch agent reports (events with payload.kind='agent_report')
  const { data: agentReports = [] } = useQuery<Event[]>({
    queryKey: ['/api/events/recent?limit=50'],
    refetchInterval: isPaused ? false : 20000, // Reduced from 3000 to 20000 to fix NetworkError
    enabled: currentView === 'reports',
    select: (data) => data
      .filter(event => 
        event.payload && 
        event.payload.kind === 'agent_report' && 
        (!activeSession || event.sessionId === activeSession)
      )
      .slice(0, 30), // Limit to last 30 reports
    staleTime: 5000,
  });

  // Quick screenshot function
  const takeScreenshot = async () => {
    if (!activeSession) {
      setError(t('events.session.required'));
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch(`/h/1/${activeSession}`);
      if (response.ok) {
        setTimeout(() => refetchEvents(), 1000);
      } else {
        setError(t('events.error.screenshot'));
      }
    } catch (err) {
      setError("Ошибка: " + (err instanceof Error ? err.message : 'Unknown'));
    } finally {
      setIsLoading(false);
    }
  };

  // Navigate to URL
  const navigate = async () => {
    if (!activeSession || !url) {
      setError(t('events.session.required') + ' ' + t('events.url.required'));
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const encodedUrl = encodeURIComponent(url);
      const response = await fetch(`/h/w/${activeSession}/${encodedUrl}`);
      
      if (response.ok) {
        setTimeout(() => takeScreenshot(), 2000);
      } else {
        setError(t('events.error.navigation'));
      }
    } catch (err) {
      setError("Ошибка: " + (err instanceof Error ? err.message : 'Unknown'));
    } finally {
      setIsLoading(false);
    }
  };

  const formatTime = (timestamp: string) => {
    return new Date(timestamp).toLocaleTimeString('ru-RU', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  };

  const getStatusColor = (status: number) => {
    if (status >= 200 && status < 300) return 'text-green-600 bg-green-100 dark:bg-green-900/30';
    if (status >= 400) return 'text-red-600 bg-red-100 dark:bg-red-900/30';
    return 'text-blue-600 bg-blue-100 dark:bg-blue-900/30';
  };

  const getEventIcon = (route: string) => {
    if (route.includes('/h/w/')) return '🌐'; // навигация
    if (route.includes('/h/1/')) return '📸'; // скриншот
    if (route.includes('/h/c/')) return '👆'; // клик
    if (route.includes('/h/t/')) return '⌨️'; // ввод текста
    if (route.includes('/h/s/')) return '📜'; // скролл
    if (route.includes('/h/health')) return '💚'; // здоровье системы
    if (route.includes('status')) return '📊'; // статус
    if (route.includes('sessions')) return '🎯'; // сессии
    if (route.includes('chat')) return '💬'; // чат с ИИ
    return '⚡'; // другие события
  };

  const getEventDescription = (route: string, method: string) => {
    if (route.includes('/h/w/')) return 'Навигация браузера';
    if (route.includes('/h/1/')) return 'Снимок экрана';
    if (route.includes('/h/c/')) return 'Клик мышью';
    if (route.includes('/h/t/')) return 'Ввод текста';
    if (route.includes('/h/s/')) return 'Прокрутка страницы';
    if (route.includes('/h/health')) return 'Проверка состояния';
    if (route.includes('status')) return 'Запрос статуса';
    if (route.includes('sessions')) return 'Управление сессией';
    if (route.includes('chat')) return 'Обработка ИИ';
    return `${method} запрос`;
  };

  const renderContent = () => {
    switch (currentView) {
      case 'artifacts':
        return (
          <div className="p-4 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">📁 {t('dashboard.files', 'Files and Artifacts')}</h2>
              <Button
                variant="outline"
                size="sm"
                onClick={() => refetchEvents()}
                className="flex items-center space-x-2"
                data-testid="button-refresh-artifacts"
              >
                <RefreshCw size={16} />
                <span>{t('events.refresh', 'Refresh')}</span>
              </Button>
            </div>
            
            {artifacts.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <FileImage size={48} className="mx-auto mb-4 opacity-50" />
                <span>{t('events.empty', 'No files to display')}</span>
              </div>
            ) : (
              <div className="space-y-3">
                {artifacts.map((artifact) => (
                  <div 
                    key={artifact.id}
                    className="p-4 border border-border rounded-lg bg-card hover:bg-card/80 transition-colors"
                  >
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex items-center space-x-2">
                        <FileImage size={20} />
                        <span className="font-medium text-sm">{artifact.type}</span>
                      </div>
                      {artifact.filePath && artifact.filePath.includes('screenshot') && (
                        <Dialog>
                          <DialogTrigger asChild>
                            <Button 
                              variant="secondary"
                              size="sm"
                              className="bg-blue-600 hover:bg-blue-700 text-white"
                              onClick={() => setSelectedImage(artifact.filePath)}
                              data-testid={`button-view-${artifact.id}`}
                            >
                              👁 Просмотр
                            </Button>
                          </DialogTrigger>
                          <DialogContent className="max-w-4xl">
                            <VisuallyHidden>
                              <DialogTitle>Просмотр скриншота</DialogTitle>
                              <DialogDescription>Скриншот из автоматизации браузера</DialogDescription>
                            </VisuallyHidden>
                            <img 
                              src={artifact.filePath}
                              alt="Скриншот"
                              className="w-full h-auto rounded-lg border"
                              onLoad={() => console.log('✅ Image loaded successfully:', artifact.filePath)}
                              onError={(e) => console.error('❌ Failed to load image:', artifact.filePath, e)}
                            />
                          </DialogContent>
                        </Dialog>
                      )}
                    </div>
                    
                    <div className="text-xs text-muted-foreground space-y-1">
                      <div>Путь: {artifact.filePath}</div>
                      <div>Сессия: {artifact.sessionId}</div>
                      <div>{formatTime(artifact.createdAt)}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        );

      case 'browser':
        return (
          <div className="p-4 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">🌐 {t('events.browser.control', 'Browser Control')}</h2>
              <Button
                variant="outline" 
                size="sm"
                onClick={takeScreenshot}
                disabled={isLoading || !activeSession}
                className="flex items-center space-x-2"
                data-testid="button-screenshot"
              >
                <Camera size={16} />
                <span>{t('events.screenshot', 'Screenshot')}</span>
              </Button>
            </div>
            
            <div className="space-y-3">
              {error && (
                <div className="p-3 bg-destructive/10 border border-destructive/20 rounded text-destructive text-sm">
                  {error}
                </div>
              )}
              
              <div className="text-sm text-muted-foreground">
                {activeSession ? (
                  <span>✅ {t('events.session.required', 'Session active')}: {activeSession}</span>
                ) : (
                  <span>⚠️ {t('events.session.required', 'No active browser session')}</span>
                )}
              </div>
              
              <div className="p-4 border border-dashed border-muted-foreground/30 rounded-lg text-center text-muted-foreground">
                <Camera size={32} className="mx-auto mb-2 opacity-50" />
                <p className="text-sm">{t('events.browser.control', 'Use chat commands to control browser')}</p>
                <p className="text-xs mt-1">Try: "Take a screenshot" or "Navigate to google.com"</p>
              </div>
            </div>
          </div>
        );

      case 'reports':
        return (
          <div className="p-4 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">🤖 Agent Reports</h2>
              <div className="flex items-center space-x-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setIsPaused(!isPaused)}
                  className="flex items-center space-x-2"
                  data-testid="button-pause-reports"
                >
                  {isPaused ? <Play size={16} /> : <Pause size={16} />}
                  <span>{isPaused ? 'Resume' : 'Pause'}</span>
                </Button>
                <span className="text-xs text-muted-foreground">
                  {agentReports.length} reports
                </span>
              </div>
            </div>
            
            <div className="space-y-2">
              {agentReports.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <div className="w-12 h-12 mx-auto mb-4 bg-blue-400/20 rounded-full flex items-center justify-center">
                    🤖
                  </div>
                  <div>
                    <p className="text-sm font-medium">No agent activity</p>
                    <p className="text-xs mt-1">Agent reports will appear here during execution</p>
                  </div>
                </div>
              ) : (
                <div className="space-y-2 max-h-[calc(100vh-12rem)] overflow-y-auto">
                  {agentReports.slice(-20).reverse().map((report, index) => (
                    <div 
                      key={report.id}
                      className="p-3 border border-border rounded bg-card hover:bg-card/80 transition-colors"
                    >
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center space-x-2">
                          <span className="text-lg">
                            {report.payload?.type === 'executing' ? '⚙️' :
                             report.payload?.type === 'completed' ? '✅' :
                             report.payload?.type === 'error' ? '❌' :
                             report.payload?.type === 'progress' ? '⚡' :
                             report.payload?.type === 'analyzing' ? '🧠' : '🤖'}
                          </span>
                          <div>
                            <div className="font-medium text-sm">
                              {report.payload?.type === 'executing' ? 'Executing' :
                               report.payload?.type === 'completed' ? 'Completed' :
                               report.payload?.type === 'error' ? 'Error' :
                               report.payload?.type === 'progress' ? 'Progress' :
                               report.payload?.type === 'analyzing' ? 'Analyzing' : 'Agent Report'}
                            </div>
                            <div className="text-xs text-muted-foreground">
                              [{formatTime(report.timestamp)}] 
                              {report.sessionId && (
                                <span className="ml-2">Session: {report.sessionId.slice(-8)}</span>
                              )}
                            </div>
                          </div>
                        </div>
                        {report.status && (
                          <span className={`px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(report.status)}`}>
                            {report.status}
                          </span>
                        )}
                      </div>
                      
                      <div className="text-sm text-foreground bg-muted p-2 rounded">
                        {report.payload?.content || report.responseText || 'Agent activity'}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        );

      case 'logs':
        return (
          <div className="p-4 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">📜 {t('events.title', 'Link Language Events')}</h2>
              <Button
                variant="outline"
                size="sm"
                onClick={() => refetchEvents()}
                className="flex items-center space-x-2"
                data-testid="button-refresh-logs"
              >
                <Terminal size={16} />
                <span>{t('events.refresh', 'Refresh Events')}</span>
              </Button>
            </div>
            
            <div className="space-y-2">
              {events.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Terminal size={48} className="mx-auto mb-4 opacity-50" />
                  <div>
                    <p className="text-sm font-medium">{t('events.empty', 'No events yet')}</p>
                    <p className="text-xs mt-1">{t('events.empty.desc', 'Browser automation events will appear here')}</p>
                  </div>
                </div>
              ) : (
                <div className="space-y-2 max-h-[calc(100vh-12rem)] overflow-y-auto">
                  {events.map((event) => (
                    <div 
                      key={event.id}
                      className="p-3 border border-border rounded bg-card hover:bg-card/80 transition-colors"
                    >
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center space-x-2">
                          <span className="text-lg">{getEventIcon(event.route)}</span>
                          <div>
                            <div className="font-medium text-sm">{getEventDescription(event.route, event.method || 'GET')}</div>
                            <div className="text-xs text-muted-foreground">[{formatTime(event.timestamp)}]</div>
                          </div>
                        </div>
                        <span className={`px-2 py-1 rounded text-xs font-mono ${getStatusColor(event.status)}`}>
                          {event.status}
                        </span>
                      </div>
                      
                      <div className="text-xs font-mono text-muted-foreground mb-1">
                        {event.route}
                      </div>
                      
                      {event.sessionId && (
                        <div className="text-xs text-blue-600 dark:text-blue-400">
                          Сессия: {event.sessionId}
                        </div>
                      )}
                      
                      {event.responseText && (
                        <div className="mt-2 text-xs text-muted-foreground bg-muted p-2 rounded">
                          <strong>Результат:</strong> {event.responseText.substring(0, 150)}
                          {event.responseText.length > 150 && '...'}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <div className="flex flex-col h-full bg-background">
      {/* Automation Progress Display */}
      {activeSession && (
        <div className="p-4 border-b border-border">
          <AutomationProgress sessionId={activeSession} />
        </div>
      )}
      
      {renderContent()}
    </div>
  );
}