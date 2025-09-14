import { useState, useRef, useCallback, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Brain, Settings } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";

interface ContextButtonProps {
  contextEnabled: boolean;
  subscriptionActive: boolean;
  isProcessing?: boolean;
  onToggleContext: () => void;
  onContextSettings?: () => void;
  className?: string;
}

export default function ContextButton({
  contextEnabled,
  subscriptionActive,
  isProcessing = false,
  onToggleContext,
  onContextSettings,
  className
}: ContextButtonProps) {
  const [isPressed, setIsPressed] = useState(false);
  const [showSettingsMenu, setShowSettingsMenu] = useState(false);
  const pressTimerRef = useRef<NodeJS.Timeout | null>(null);
  const longPressThreshold = 800; // ms for long press detection

  // Handle press start (all input types via pointer events)
  const handlePressStart = useCallback((e: React.PointerEvent) => {
    if (isProcessing) return;
    
    e.preventDefault();
    e.stopPropagation(); // Critical: prevent Radix interference
    setIsPressed(true);
    
    // Start long press timer
    pressTimerRef.current = setTimeout(() => {
      // Long press detected - show context settings menu
      setShowSettingsMenu(true);
      setIsPressed(false);
      
      // Haptic feedback if available
      if ('vibrate' in navigator) {
        navigator.vibrate(100);
      }
    }, longPressThreshold);
  }, [isProcessing, longPressThreshold]);

  // Handle press end (all input types via pointer events)
  const handlePressEnd = useCallback((e: React.PointerEvent) => {
    if (isProcessing) return;
    
    e.preventDefault();
    e.stopPropagation(); // Critical: prevent Radix interference
    setIsPressed(false);
    
    // Clear long press timer
    if (pressTimerRef.current) {
      clearTimeout(pressTimerRef.current);
      pressTimerRef.current = null;
      
      // Short press detected - toggle context (NEVER open menu)
      if (!showSettingsMenu) {
        onToggleContext();
      }
    }
  }, [isProcessing, onToggleContext, showSettingsMenu]);

  // Handle pointer leave/cancel (cancel press)
  const handlePressCancel = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation(); // Critical: prevent Radix interference
    setIsPressed(false);
    if (pressTimerRef.current) {
      clearTimeout(pressTimerRef.current);
      pressTimerRef.current = null;
    }
  }, []);

  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (pressTimerRef.current) {
        clearTimeout(pressTimerRef.current);
      }
    };
  }, []);

  // Reset settings menu state when context changes
  useEffect(() => {
    setShowSettingsMenu(false);
  }, [contextEnabled]);

  // Context status for display  
  const isActive = contextEnabled; // Allow demo activation without subscription
  const canInteract = !isProcessing; // Allow interaction without subscription for demo

  return (
    <div className="relative">
      {/* Main Context Button - completely independent from dropdown */}
      <Button
        variant="ghost"
        size="sm"
        disabled={isProcessing} // Only disable during processing, allow demo activation
        className={cn(
          // Base styles
          "relative transition-all duration-300 ease-out",
          "px-3 py-2 h-9 min-w-[3rem]",
          "border-2 border-transparent",
          "font-mono text-sm font-semibold tracking-wide",
          
          // Purple theme colors for inactive state
          !isActive && !isPressed && canInteract && [
            "bg-purple-100 hover:bg-purple-200",
            "text-purple-700 hover:text-purple-800",
            "dark:bg-purple-950 dark:hover:bg-purple-900",
            "dark:text-purple-300 dark:hover:text-purple-200"
          ],
          
          // Active state (context enabled) - glowing purple
          isActive && [
            "ctx-active", // CSS class for enhanced styling
            "bg-gradient-to-r from-purple-500 to-purple-600",
            "hover:from-purple-600 hover:to-purple-700",
            "text-white font-bold",
            "shadow-lg shadow-purple-500/50",
            "ring-2 ring-purple-400/50",
            "animate-pulse"
          ],
          
          // Pressed state
          isPressed && [
            "ctx-pressed", // CSS class for enhanced styling
            "scale-95 bg-purple-700 text-white",
            "shadow-inner shadow-purple-900/50"
          ],
          
          // Warning state for demo users (no subscription but can still use)
          !subscriptionActive && !isProcessing && [
            "ring-1 ring-yellow-400/50",
            "bg-yellow-50 dark:bg-yellow-950/30"
          ],
          
          // Processing state
          isProcessing && "opacity-50 cursor-wait",
          
          className
        )}
        onClick={(e) => {
          // Prevent any event bubbling
          e.preventDefault();
          e.stopPropagation();
        }}
        onPointerDown={handlePressStart}
        onPointerUp={handlePressEnd}
        onPointerLeave={handlePressCancel}
        onPointerCancel={handlePressCancel}
        data-testid="button-context"
        title={
          !subscriptionActive 
            ? "Demo mode - context enabled locally (hold for settings)" 
            : isActive 
              ? "Context enabled (click to disable, hold for settings)"
              : "Context disabled (click to enable, hold for settings)"
        }
      >
        <span className="relative z-10">
          ctx
        </span>
        
        {/* Animated background glow when active */}
        {isActive && (
          <div 
            className="absolute inset-0 bg-gradient-to-r from-purple-400 to-purple-600 rounded opacity-75 blur-sm -z-10 animate-pulse"
            style={{ animation: "pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite" }}
          />
        )}
        
        {/* Processing spinner overlay */}
        {isProcessing && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
          </div>
        )}
      </Button>

      {/* Dropdown Menu - completely separate, only opened by long press */}
      <DropdownMenu 
        open={showSettingsMenu} 
        onOpenChange={(open) => {
          // Only allow closing, never opening from Radix events
          if (!open) {
            setShowSettingsMenu(false);
          }
        }}
      >
        {/* Hidden trigger to satisfy Radix UI requirements */}
        <DropdownMenuTrigger asChild>
          <div style={{ display: 'none' }} />
        </DropdownMenuTrigger>
        
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuItem
            onClick={() => {
              onToggleContext();
              setShowSettingsMenu(false);
            }}
            className="flex items-center space-x-2"
          >
            <Brain className="w-4 h-4" />
            <span>{contextEnabled ? "Disable Context" : "Enable Context"}</span>
          </DropdownMenuItem>
          
          <DropdownMenuSeparator />
          
          <DropdownMenuItem
            onClick={() => {
              onContextSettings?.();
              setShowSettingsMenu(false);
            }}
            className="flex items-center space-x-2"
          >
            <Settings className="w-4 h-4" />
            <span>Context Settings</span>
          </DropdownMenuItem>
          
          <DropdownMenuSeparator />
          
          <DropdownMenuItem disabled className="text-xs text-muted-foreground">
            {isActive 
              ? "Context is saving chat history for AI continuity" 
              : "Context saves chat history across sessions"
            }
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}