import { useState, useEffect } from "react";
import { useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";

interface CoordinateInputProps {
  activeSession: string | null;
}

interface CoordinateState {
  stageA: { x: number; y: number } | null;
  stageB: { x: number; y: number } | null;
  mode: 'staging' | 'oneshot';
  ready: boolean;
}

export default function CoordinateInput({ activeSession }: CoordinateInputProps) {
  const [coordinates, setCoordinates] = useState<CoordinateState>({
    stageA: null,
    stageB: null,
    mode: 'staging',
    ready: false,
  });
  const [oneshotX, setOneshotX] = useState("");
  const [oneshotY, setOneshotY] = useState("");
  const { toast } = useToast();

  const executeCommandMutation = useMutation({
    mutationFn: async (command: string) => {
      const response = await apiRequest('POST', '/api/execute', { command });
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Command Executed", 
        description: "Check the event board for results",
      });
    },
  });

  const setStageA = () => {
    if (!activeSession) return;
    
    const x = Math.floor(Math.random() * 800) + 100; // Mock coordinate
    setCoordinates(prev => ({
      ...prev,
      stageA: { x, y: 0 },
      ready: !!(prev.stageB && { x, y: 0 })
    }));
    
    executeCommandMutation.mutate(`/h/A/${x}/${activeSession}`);
  };

  const setStageB = () => {
    if (!activeSession) return;
    
    const y = Math.floor(Math.random() * 600) + 100; // Mock coordinate  
    setCoordinates(prev => ({
      ...prev,
      stageB: { x: 0, y },
      ready: !!(prev.stageA && { x: 0, y })
    }));
    
    executeCommandMutation.mutate(`/h/B/${y}/${activeSession}`);
  };

  const executeClick = () => {
    if (!activeSession) return;
    
    if (coordinates.mode === 'staging') {
      if (!coordinates.ready) {
        toast({
          title: "Coordinates Not Ready",
          description: "Set both A and B stages first",
          variant: "destructive",
        });
        return;
      }
      executeCommandMutation.mutate(`/h/C/${activeSession}`);
    } else {
      // One-shot mode
      const x = parseInt(oneshotX);
      const y = parseInt(oneshotY);
      
      if (isNaN(x) || isNaN(y)) {
        toast({
          title: "Invalid Coordinates",
          description: "Enter valid X and Y coordinates",
          variant: "destructive",
        });
        return;
      }
      
      executeCommandMutation.mutate(`/h/C/${x}/${y}/${activeSession}`);
    }
  };

  const clearCoordinates = () => {
    setCoordinates({
      stageA: null,
      stageB: null,
      mode: coordinates.mode,
      ready: false,
    });
    setOneshotX("");
    setOneshotY("");
  };

  return (
    <div className="p-4">
      <h3 className="text-sm font-medium mb-3">Coordinate Input (Morse v3)</h3>
      
      {/* Mode Selection */}
      <div className="mb-3">
        <div className="flex space-x-1 p-1 bg-muted rounded-md">
          <Button
            variant={coordinates.mode === 'staging' ? 'default' : 'ghost'}
            size="sm"
            className="flex-1 text-xs"
            onClick={() => setCoordinates(prev => ({ ...prev, mode: 'staging' }))}
            data-testid="button-mode-staging"
          >
            Staging (A→B→C)
          </Button>
          <Button
            variant={coordinates.mode === 'oneshot' ? 'default' : 'ghost'}
            size="sm" 
            className="flex-1 text-xs"
            onClick={() => setCoordinates(prev => ({ ...prev, mode: 'oneshot' }))}
            data-testid="button-mode-oneshot"
          >
            One-shot C(x,y)
          </Button>
        </div>
      </div>

      {coordinates.mode === 'staging' ? (
        <>
          {/* Coordinate Display */}
          <div className="mb-3 space-y-2">
            <div className="flex justify-between text-xs">
              <span className="text-muted-foreground">Stage A:</span>
              <span className="font-mono" data-testid="text-stage-a">
                {coordinates.stageA ? `${coordinates.stageA.x}` : "—"}
              </span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-muted-foreground">Stage B:</span>
              <span className="font-mono" data-testid="text-stage-b">
                {coordinates.stageB ? `${coordinates.stageB.y}` : "—"}
              </span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-muted-foreground">Ready:</span>
              <span className={`font-mono ${coordinates.ready ? 'text-success' : 'text-muted-foreground'}`} data-testid="text-ready">
                {coordinates.ready ? 'true' : 'false'}
              </span>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="grid grid-cols-3 gap-1 text-xs mb-2">
            <Button 
              variant="secondary"
              size="sm"
              onClick={setStageA}
              disabled={!activeSession || executeCommandMutation.isPending}
              data-testid="button-stage-a"
            >
              A
            </Button>
            <Button 
              variant="secondary"
              size="sm"
              onClick={setStageB}
              disabled={!activeSession || executeCommandMutation.isPending}
              data-testid="button-stage-b"
            >
              B
            </Button>
            <Button 
              onClick={executeClick}
              size="sm"
              disabled={!activeSession || !coordinates.ready || executeCommandMutation.isPending}
              data-testid="button-click"
            >
              C
            </Button>
            <Button 
              variant="secondary"
              size="sm"
              disabled={!activeSession}
              data-testid="button-double"
            >
              Double
            </Button>
            <Button 
              variant="secondary"
              size="sm"
              disabled={!activeSession}
              data-testid="button-right"
            >
              Right
            </Button>
            <Button 
              variant="secondary"
              size="sm"
              disabled={!activeSession}
              data-testid="button-drag"
            >
              Drag
            </Button>
          </div>
        </>
      ) : (
        <>
          {/* One-shot coordinate input */}
          <div className="mb-3 space-y-2">
            <div className="flex space-x-2">
              <Input
                type="number"
                placeholder="X"
                value={oneshotX}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setOneshotX(e.target.value)}
                className="flex-1 text-xs font-mono"
                data-testid="input-oneshot-x"
              />
              <Input
                type="number"
                placeholder="Y"
                value={oneshotY}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setOneshotY(e.target.value)}
                className="flex-1 text-xs font-mono"
                data-testid="input-oneshot-y"
              />
            </div>
            <Button 
              onClick={executeClick}
              size="sm"
              className="w-full"
              disabled={!activeSession || !oneshotX || !oneshotY || executeCommandMutation.isPending}
              data-testid="button-oneshot-click"
            >
              Click ({oneshotX || "?"}, {oneshotY || "?"})
            </Button>
          </div>
        </>
      )}

      {/* Clear Button */}
      <Button 
        variant="outline" 
        size="sm"
        className="w-full"
        onClick={clearCoordinates}
        data-testid="button-clear-coordinates"
      >
        Clear Coordinates
      </Button>
    </div>
  );
}
