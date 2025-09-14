import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Settings, Save, RotateCcw, Bot } from "lucide-react";

interface AutomationModelConfig {
  id: string;
  planningModel: string;
  executionModel: string; 
  completionModel: string;
  fallbackModel: string;
  isGlobal: boolean;
  isActive: boolean;
  updatedAt: string;
}

interface OpenRouterModel {
  id: string;
  name: string;
  context_length: number;
  pricing: {
    prompt: string;
    completion: string;
  };
}

export default function AutomationSettings() {
  const { toast } = useToast();
  const [configForm, setConfigForm] = useState({
    planningModel: '',
    executionModel: '',
    completionModel: '',
    fallbackModel: ''
  });

  // Get available models from OpenRouter
  const { data: modelsData, isLoading: modelsLoading } = useQuery<{ data: OpenRouterModel[] }>({
    queryKey: ['/api/automation/models'],
    staleTime: 300000 // Cache for 5 minutes
  });

  // Get current automation configuration
  const { data: configData, isLoading: configLoading } = useQuery<{ config: AutomationModelConfig }>({
    queryKey: ['/api/automation/config'],
    staleTime: 30000 // Cache for 30 seconds
  });

  // Update configuration mutation
  const updateConfigMutation = useMutation({
    mutationFn: (config: typeof configForm) => 
      apiRequest('PUT', '/api/automation/config', config),
    onSuccess: () => {
      toast({
        title: "Settings Updated",
        description: "Automation model configuration has been saved successfully.",
        variant: "default"
      });
      queryClient.invalidateQueries({ queryKey: ['/api/automation/config'] });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update automation settings.",
        variant: "destructive"
      });
    }
  });

  // Reset to defaults mutation
  const resetConfigMutation = useMutation({
    mutationFn: () => 
      apiRequest('POST', '/api/automation/config/reset', {}),
    onSuccess: () => {
      toast({
        title: "Settings Reset",
        description: "Automation configuration has been reset to defaults.",
        variant: "default"
      });
      queryClient.invalidateQueries({ queryKey: ['/api/automation/config'] });
    },
    onError: (error: any) => {
      toast({
        title: "Error", 
        description: error.message || "Failed to reset automation settings.",
        variant: "destructive"
      });
    }
  });

  // Update form when config is loaded
  useEffect(() => {
    if (configData?.config) {
      setConfigForm({
        planningModel: configData.config.planningModel,
        executionModel: configData.config.executionModel,
        completionModel: configData.config.completionModel,
        fallbackModel: configData.config.fallbackModel
      });
    }
  }, [configData]);

  const handleSave = () => {
    updateConfigMutation.mutate(configForm);
  };

  const handleReset = () => {
    resetConfigMutation.mutate();
  };

  const models = modelsData?.data || [];
  const popularModels = models.filter(model => 
    model.id.includes('gpt-4') || 
    model.id.includes('claude') || 
    model.id.includes('gemini') ||
    model.id.includes('llama')
  ).slice(0, 20); // Show top 20 popular models

  if (modelsLoading || configLoading) {
    return (
      <div className="p-6 flex items-center justify-center">
        <div className="text-center">
          <Bot className="w-8 h-8 animate-spin mx-auto mb-2" />
          <p>Loading automation settings...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div className="flex items-center space-x-3">
        <Settings className="w-6 h-6" />
        <h1 className="text-2xl font-bold">Automation Model Configuration</h1>
      </div>
      
      <p className="text-muted-foreground">
        Configure different AI models for various automation tasks. Each task type can use a specialized model for optimal performance.
      </p>

      <Card data-testid="card-automation-config">
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <Bot className="w-5 h-5" />
            <span>Model Assignment</span>
          </CardTitle>
          <CardDescription>
            Assign specific OpenRouter models to different phases of automation tasks.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Planning Model */}
          <div className="space-y-2">
            <label className="text-sm font-medium">Planning Model</label>
            <p className="text-xs text-muted-foreground">Model used for creating automation plans and strategies</p>
            <Select 
              value={configForm.planningModel} 
              onValueChange={(value) => setConfigForm(prev => ({ ...prev, planningModel: value }))}
            >
              <SelectTrigger data-testid="select-planning-model">
                <SelectValue placeholder="Select planning model" />
              </SelectTrigger>
              <SelectContent>
                {popularModels.map((model) => (
                  <SelectItem key={model.id} value={model.id}>
                    {model.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Execution Model */}
          <div className="space-y-2">
            <label className="text-sm font-medium">Execution Model</label>
            <p className="text-xs text-muted-foreground">Model used for analyzing and executing automation steps</p>
            <Select 
              value={configForm.executionModel} 
              onValueChange={(value) => setConfigForm(prev => ({ ...prev, executionModel: value }))}
            >
              <SelectTrigger data-testid="select-execution-model">
                <SelectValue placeholder="Select execution model" />
              </SelectTrigger>
              <SelectContent>
                {popularModels.map((model) => (
                  <SelectItem key={model.id} value={model.id}>
                    {model.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Completion Model */}
          <div className="space-y-2">
            <label className="text-sm font-medium">Completion Model</label>
            <p className="text-xs text-muted-foreground">Model used for checking goal completion and validation</p>
            <Select 
              value={configForm.completionModel} 
              onValueChange={(value) => setConfigForm(prev => ({ ...prev, completionModel: value }))}
            >
              <SelectTrigger data-testid="select-completion-model">
                <SelectValue placeholder="Select completion model" />
              </SelectTrigger>
              <SelectContent>
                {popularModels.map((model) => (
                  <SelectItem key={model.id} value={model.id}>
                    {model.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Fallback Model */}
          <div className="space-y-2">
            <label className="text-sm font-medium">Fallback Model</label>
            <p className="text-xs text-muted-foreground">Backup model used when primary models are unavailable</p>
            <Select 
              value={configForm.fallbackModel} 
              onValueChange={(value) => setConfigForm(prev => ({ ...prev, fallbackModel: value }))}
            >
              <SelectTrigger data-testid="select-fallback-model">
                <SelectValue placeholder="Select fallback model" />
              </SelectTrigger>
              <SelectContent>
                {popularModels.map((model) => (
                  <SelectItem key={model.id} value={model.id}>
                    {model.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Action Buttons */}
          <div className="flex space-x-3 pt-4">
            <Button 
              onClick={handleSave}
              disabled={updateConfigMutation.isPending}
              data-testid="button-save-config"
              className="flex items-center space-x-2"
            >
              <Save className="w-4 h-4" />
              <span>{updateConfigMutation.isPending ? 'Saving...' : 'Save Configuration'}</span>
            </Button>
            
            <Button 
              variant="outline"
              onClick={handleReset}
              disabled={resetConfigMutation.isPending}
              data-testid="button-reset-config"
              className="flex items-center space-x-2"
            >
              <RotateCcw className="w-4 h-4" />
              <span>{resetConfigMutation.isPending ? 'Resetting...' : 'Reset to Defaults'}</span>
            </Button>
          </div>

          {/* Current Configuration Display */}
          {configData?.config && (
            <div className="mt-6 p-4 bg-muted rounded-lg">
              <h4 className="text-sm font-medium mb-2">Current Configuration</h4>
              <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                <div><strong>Planning:</strong> {configData.config.planningModel}</div>
                <div><strong>Execution:</strong> {configData.config.executionModel}</div>
                <div><strong>Completion:</strong> {configData.config.completionModel}</div>
                <div><strong>Fallback:</strong> {configData.config.fallbackModel}</div>
              </div>
              <div className="text-xs text-muted-foreground mt-2">
                Last updated: {new Date(configData.config.updatedAt).toLocaleString()}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}