import { useQuery } from "@tanstack/react-query";
import { DetailedStatusIndicator } from "./StatusIndicator";

interface SidebarProps {
  currentView: 'events' | 'browser' | 'artifacts' | 'logs';
  onViewChange: (view: 'events' | 'browser' | 'artifacts' | 'logs') => void;
  isMobile?: boolean;
}

export default function Sidebar({ currentView, onViewChange, isMobile = false }: SidebarProps) {

  return (
    <div className="w-64 bg-sidebar border-r border-sidebar-border flex flex-col">
      {/* Logo and Title */}
      <div className="p-4 border-b border-sidebar-border">
        <div className="flex items-center space-x-3">
          <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center">
            <i className="fas fa-link text-primary-foreground text-sm"></i>
          </div>
          <div>
            <h1 className="text-lg font-semibold text-sidebar-foreground">EIROS</h1>
            <p className="text-xs text-muted-foreground">БД, OpenRouter, Browser, Sessions</p>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <div className="flex-1 p-4">
        <div className="text-xs text-muted-foreground mb-3 uppercase tracking-wide">Сессия: sess_6</div>
        <nav className="space-y-1">
          <button 
            onClick={() => onViewChange('events')}
            className={`flex items-center space-x-3 px-3 py-2 rounded-md w-full text-left transition-colors ${
              currentView === 'events' 
                ? 'bg-slate-600 text-white' 
                : 'text-muted-foreground hover:text-foreground hover:bg-slate-700'
            }`}
            data-testid="nav-dashboard"
          >
            <span>📋</span>
            <span>События</span>
          </button>
          
          <button 
            onClick={() => onViewChange('browser')}
            className={`flex items-center space-x-3 px-3 py-2 rounded-md w-full text-left transition-colors ${
              currentView === 'browser'
                ? 'bg-slate-600 text-white' 
                : 'text-muted-foreground hover:text-foreground hover:bg-slate-700'
            }`}
            data-testid="nav-browser"
          >
            <span>🌐</span>
            <span>Браузер</span>
          </button>
          
          <button 
            onClick={() => onViewChange('artifacts')}
            className={`flex items-center space-x-3 px-3 py-2 rounded-md w-full text-left transition-colors ${
              currentView === 'artifacts' 
                ? 'bg-slate-600 text-white' 
                : 'text-muted-foreground hover:text-foreground hover:bg-slate-700'
            }`}
            data-testid="nav-artifacts"
          >
            <span>📁</span>
            <span>Файлы</span>
          </button>
          
          <button 
            onClick={() => onViewChange('logs')}
            className={`flex items-center space-x-3 px-3 py-2 rounded-md w-full text-left transition-colors ${
              currentView === 'logs' 
                ? 'bg-slate-600 text-white' 
                : 'text-muted-foreground hover:text-foreground hover:bg-slate-700'
            }`}
            data-testid="nav-events"
          >
            <span>📜</span>
            <span>Логи</span>
          </button>
          
        </nav>

        {/* System Status */}
        <div className="mt-6">
          <DetailedStatusIndicator />
        </div>
      </div>

      {/* Version Info */}
      <div className="p-4 border-t border-sidebar-border">
        <div className="text-xs text-muted-foreground text-center">
          <div>Добро пожаловать в EIROS AI</div>
          <div className="mt-1">Говорите со мной простым языком</div>
        </div>
      </div>
    </div>
  );
}
