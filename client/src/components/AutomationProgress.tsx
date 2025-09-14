import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Play, Square, RotateCcw, ArrowRight, Loader2, CheckCircle, XCircle, Clock } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface AutomationProgressProps {
  sessionId: string;
}

interface AutomationStatus {
  found: boolean;
  sessionId: string;
  automation: {
    status: 'idle' | 'started' | 'planning' | 'executing' | 'observing' | 'checking' | 'completed' | 'failed' | 'stopped';
    goal: string | null;
    progress: {
      currentStep: number;
      totalSteps: number;
      stepDescription: string;
      completedSteps: number;
    } | null;
    currentAction: string | null;
    lastUpdate: string | null;
    error: string | null;
    canStart: boolean;
    canResume: boolean;
    canStop: boolean;
  };
  message?: string;
}

interface LoopProgress {
  sessionId: string;
  status: string;
  goal: string;
  progress: {
    currentStep: number;
    totalSteps: number;
    stepDescription: string;
    completedSteps: number;
  };
  lastUpdate: string;
  error?: string;
}

export function AutomationProgress({ sessionId }: AutomationProgressProps) {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  // Get automation status
  const { data: automationStatus, isLoading } = useQuery<AutomationStatus>({
    queryKey: ['/api/automation/status', sessionId],
    enabled: !!sessionId,
    refetchInterval: 5000, // Poll every 5 seconds
  });

  // Get live progress data from SSE events
  const progressData = queryClient.getQueryData<LoopProgress>(['/api/automation/progress', sessionId]);

  // Use either SSE progress data or automation status data
  const currentStatus = progressData?.status || automationStatus?.automation.status;
  const currentProgress = progressData?.progress || automationStatus?.automation.progress;
  const currentGoal = progressData?.goal || automationStatus?.automation.goal;
  const currentError = progressData?.error || automationStatus?.automation.error;

  // Start automation mutation
  const startMutation = useMutation({
    mutationFn: async ({ goal, options }: { goal: string; options?: any }) => {
      return apiRequest('/api/automation/start', 'POST', { sessionId, goal, options });
    },
    onSuccess: () => {
      toast({
        title: "🤖 Automation Started",
        description: "AI automation has been started for this session",
      });
      queryClient.invalidateQueries({ queryKey: ['/api/automation/status', sessionId] });
    },
    onError: (error: any) => {
      toast({
        title: "❌ Failed to Start",
        description: error.message || "Failed to start automation",
        variant: "destructive",
      });
    },
  });

  // Resume automation mutation
  const resumeMutation = useMutation({
    mutationFn: async () => {
      return apiRequest('/api/automation/resume', 'POST', { sessionId });
    },
    onSuccess: () => {
      toast({
        title: "▶️ Automation Resumed",
        description: "Automation has been resumed",
      });
      queryClient.invalidateQueries({ queryKey: ['/api/automation/status', sessionId] });
    },
    onError: (error: any) => {
      toast({
        title: "❌ Failed to Resume",
        description: error.message || "Failed to resume automation",
        variant: "destructive",
      });
    },
  });

  // Stop automation mutation
  const stopMutation = useMutation({
    mutationFn: async () => {
      return apiRequest('/api/automation/stop', 'POST', { sessionId });
    },
    onSuccess: () => {
      toast({
        title: "⏹️ Automation Stopped",
        description: "Automation has been stopped",
      });
      queryClient.invalidateQueries({ queryKey: ['/api/automation/status', sessionId] });
    },
    onError: (error: any) => {
      toast({
        title: "❌ Failed to Stop",
        description: error.message || "Failed to stop automation",
        variant: "destructive",
      });
    },
  });

  // Continue automation mutation
  const continueMutation = useMutation({
    mutationFn: async () => {
      return apiRequest('/api/automation/continue', 'POST', { sessionId });
    },
    onSuccess: () => {
      toast({
        title: "🔄 Automation Continued",
        description: "Automation has been continued",
      });
      queryClient.invalidateQueries({ queryKey: ['/api/automation/status', sessionId] });
    },
    onError: (error: any) => {
      toast({
        title: "❌ Failed to Continue",
        description: error.message || "Failed to continue automation",
        variant: "destructive",
      });
    },
  });

  const handleStart = () => {
    const goal = "Продолжить выполнение текущей задачи"; // Default goal
    startMutation.mutate({ goal });
  };

  const handleResume = () => {
    resumeMutation.mutate();
  };

  const handleStop = () => {
    stopMutation.mutate();
  };

  const handleContinue = () => {
    continueMutation.mutate();
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed':
        return <CheckCircle className="h-4 w-4 text-green-500" />;
      case 'failed':
        return <XCircle className="h-4 w-4 text-red-500" />;
      case 'stopped':
        return <Square className="h-4 w-4 text-gray-500" />;
      case 'idle':
        return <Clock className="h-4 w-4 text-gray-400" />;
      default:
        return <Loader2 className="h-4 w-4 text-blue-500 animate-spin" />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed':
        return 'bg-green-500';
      case 'failed':
        return 'bg-red-500';
      case 'stopped':
        return 'bg-gray-500';
      case 'idle':
        return 'bg-gray-400';
      default:
        return 'bg-blue-500';
    }
  };

  const getProgressPercentage = () => {
    if (!currentProgress) return 0;
    if (currentProgress.totalSteps === 0) return 0;
    return Math.round((currentProgress.completedSteps / currentProgress.totalSteps) * 100);
  };

  if (isLoading) {
    return (
      <Card className="w-full">
        <CardContent className="p-4">
          <div className="flex items-center space-x-2">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span className="text-sm text-muted-foreground">Loading automation status...</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Don't show if no automation status and no active progress
  if (!automationStatus?.found && !progressData && !automationStatus?.automation.canStart) {
    return null;
  }

  return (
    <Card className="w-full" data-testid="automation-progress-card">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg flex items-center space-x-2">
            <span>🤖 AI Automation</span>
            {currentStatus && (
              <Badge variant="secondary" className={`${getStatusColor(currentStatus)} text-white`}>
                <div className="flex items-center space-x-1">
                  {getStatusIcon(currentStatus)}
                  <span className="capitalize">{currentStatus}</span>
                </div>
              </Badge>
            )}
          </CardTitle>
          
          <div className="flex items-center space-x-2">
            {automationStatus?.automation.canStart && (
              <Button
                size="sm"
                onClick={handleStart}
                disabled={startMutation.isPending}
                data-testid="button-start-automation"
              >
                {startMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-1" />
                ) : (
                  <Play className="h-4 w-4 mr-1" />
                )}
                Start
              </Button>
            )}
            
            {automationStatus?.automation.canResume && (
              <Button
                size="sm"
                onClick={handleResume}
                disabled={resumeMutation.isPending}
                data-testid="button-resume-automation"
              >
                {resumeMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-1" />
                ) : (
                  <RotateCcw className="h-4 w-4 mr-1" />
                )}
                Resume
              </Button>
            )}
            
            {currentStatus && !['completed', 'failed', 'stopped', 'idle'].includes(currentStatus) && (
              <Button
                size="sm"
                variant="outline"
                onClick={handleContinue}
                disabled={continueMutation.isPending}
                data-testid="button-continue-automation"
              >
                {continueMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-1" />
                ) : (
                  <ArrowRight className="h-4 w-4 mr-1" />
                )}
                Continue
              </Button>
            )}
            
            {automationStatus?.automation.canStop && (
              <Button
                size="sm"
                variant="destructive"
                onClick={handleStop}
                disabled={stopMutation.isPending}
                data-testid="button-stop-automation"
              >
                {stopMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-1" />
                ) : (
                  <Square className="h-4 w-4 mr-1" />
                )}
                Stop
              </Button>
            )}
          </div>
        </div>
      </CardHeader>
      
      <CardContent className="space-y-4">
        {currentGoal && (
          <div>
            <div className="text-sm font-medium text-muted-foreground mb-1">Goal:</div>
            <div className="text-sm" data-testid="text-automation-goal">{currentGoal}</div>
          </div>
        )}
        
        {currentProgress && (
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="font-medium">Progress</span>
              <span className="text-muted-foreground">
                {currentProgress.completedSteps} / {currentProgress.totalSteps} steps
              </span>
            </div>
            
            <Progress
              value={getProgressPercentage()}
              className="h-2"
              data-testid="progress-automation"
            />
            
            <div className="text-sm text-muted-foreground" data-testid="text-step-description">
              {currentProgress.stepDescription}
            </div>
          </div>
        )}
        
        {currentError && (
          <div className="p-3 bg-red-50 dark:bg-red-950 rounded-md">
            <div className="text-sm text-red-600 dark:text-red-400" data-testid="text-automation-error">
              <strong>Error:</strong> {currentError}
            </div>
          </div>
        )}
        
        {automationStatus?.message && !currentGoal && (
          <div className="text-sm text-muted-foreground italic" data-testid="text-automation-message">
            {automationStatus.message}
          </div>
        )}
      </CardContent>
    </Card>
  );
}