import { useState, useEffect } from "react";
import { useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";

interface BrowserPreviewProps {
  activeSession: string | null;
}

export default function BrowserPreview({ activeSession }: BrowserPreviewProps) {
  const [currentUrl, setCurrentUrl] = useState("https://example.com");
  const [mousePosition, setMousePosition] = useState({ x: 320, y: 240 });
  const [browserStats, setBrowserStats] = useState({
    loadTime: "1.2s",
    elementCount: 247,
    viewport: "1024×768"
  });
  const { toast } = useToast();

  const executeCommandMutation = useMutation({
    mutationFn: async (command: string) => {
      const response = await apiRequest('POST', '/api/execute', { command });
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Action Executed",
        description: "Check the event board for results",
      });
    },
  });

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = Math.round((e.clientX - rect.left) / rect.width * 1024);
    const y = Math.round((e.clientY - rect.top) / rect.height * 768);
    setMousePosition({ x, y });
  };

  const executeQuickAction = (action: string) => {
    if (!activeSession) {
      toast({
        title: "No Active Session",
        description: "Create a session first",
        variant: "destructive",
      });
      return;
    }

    const commands: Record<string, string> = {
      screenshot: `/h/1/${activeSession}`,
      scrollTop: `/h/2/${activeSession}`, // Mock scroll command
      getTitle: `/h/encode/${activeSession}/get page title`,
      getUrl: `/h/encode/${activeSession}/get current url`,
    };

    if (commands[action]) {
      executeCommandMutation.mutate(commands[action]);
    }
  };

  return (
    <div className="w-80 bg-card border-l border-border flex flex-col">
      {/* Browser Control Header */}
      <div className="p-4 border-b border-border">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold">Browser Control</h3>
          <div className="text-xs text-muted-foreground">
            Сессия: {activeSession || 'Нет'}
          </div>
        </div>
      </div>

      {/* URL Bar */}
      <div className="p-4 border-b border-border">
        <div className="flex items-center space-x-2">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => executeQuickAction('back')}
            disabled={!activeSession}
            data-testid="button-back"
          >
            <i className="fas fa-arrow-left text-xs"></i>
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => executeQuickAction('refresh')}
            disabled={!activeSession}
            data-testid="button-refresh"
          >
            <i className="fas fa-redo text-xs"></i>
          </Button>
          <Input
            type="text" 
            value={currentUrl}
            onChange={(e) => setCurrentUrl(e.target.value)}
            className="flex-1 text-xs font-mono"
            data-testid="input-url"
          />
        </div>
      </div>

      {/* Browser Viewport Preview */}
      <div className="flex-1 p-4 space-y-4">
        <div 
          className="aspect-[4/3] bg-muted border border-border rounded-lg overflow-hidden relative cursor-crosshair"
          style={{
            backgroundImage: `
              linear-gradient(to right, hsl(222, 13%, 19%) 1px, transparent 1px),
              linear-gradient(to bottom, hsl(222, 13%, 19%) 1px, transparent 1px)
            `,
            backgroundSize: '20px 20px'
          }}
          onMouseMove={handleMouseMove}
          data-testid="browser-viewport"
        >
          {/* Mock browser content */}
          <img 
            src="https://images.unsplash.com/photo-1551650975-87deedd944c3?ixlib=rb-4.0.3&ixid=MnwxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8&auto=format&fit=crop&w=1024&h=768" 
            alt="Browser viewport showing a website interface"
            className="w-full h-full object-cover opacity-60"
          />
          
          {/* Coordinate Overlay */}
          <div className="absolute inset-0 pointer-events-none">
            {/* Cross-hair for current mouse position */}
            <div 
              className="absolute w-full h-px bg-primary opacity-50" 
              style={{ top: `${(mousePosition.y / 768) * 100}%` }}
            />
            <div 
              className="absolute h-full w-px bg-primary opacity-50" 
              style={{ left: `${(mousePosition.x / 1024) * 100}%` }}
            />
            
            {/* Coordinate display */}
            <div className="absolute top-2 left-2 bg-background/90 text-foreground px-2 py-1 rounded text-xs font-mono">
              <span data-testid="mouse-x">{mousePosition.x}</span>, <span data-testid="mouse-y">{mousePosition.y}</span>
            </div>
            
            {/* Action marker */}
            <div 
              className="absolute w-3 h-3 border-2 border-accent rounded-full"
              style={{ 
                top: `calc(${(mousePosition.y / 768) * 100}% - 6px)`, 
                left: `calc(${(mousePosition.x / 1024) * 100}% - 6px)` 
              }}
            />
          </div>
        </div>
      </div>

      {/* Browser Stats */}
      <div className="p-4 border-t border-border">
        <div className="space-y-2 text-xs">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Page Load:</span>
            <span className="font-mono text-success" data-testid="stat-load-time">{browserStats.loadTime}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Elements:</span>
            <span className="font-mono" data-testid="stat-element-count">{browserStats.elementCount}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Viewport:</span>
            <span className="font-mono" data-testid="stat-viewport">{browserStats.viewport}</span>
          </div>
        </div>
      </div>

      {/* Quick MCP Actions */}
      <div className="p-4 border-t border-border">
        <h4 className="text-sm font-medium mb-3">Quick MCP Actions</h4>
        <div className="grid grid-cols-2 gap-2">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => executeQuickAction('screenshot')}
            disabled={!activeSession || executeCommandMutation.isPending}
            data-testid="button-quick-screenshot"
          >
            Screenshot
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => executeQuickAction('scrollTop')}
            disabled={!activeSession || executeCommandMutation.isPending}
            data-testid="button-scroll-top"
          >
            Scroll Top
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => executeQuickAction('getTitle')}
            disabled={!activeSession || executeCommandMutation.isPending}
            data-testid="button-get-title"
          >
            Get Title
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => executeQuickAction('getUrl')}
            disabled={!activeSession || executeCommandMutation.isPending}
            data-testid="button-get-url"
          >
            Get URL
          </Button>
        </div>
      </div>
    </div>
  );
}
