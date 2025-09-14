import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Search, Star, ChevronDown } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";

interface Model {
  id: string;
  name: string;
  provider: string;
  description: string;
  context?: number;
}

interface ModelSelectorProps {
  selectedModel: string;
  onModelChange: (model: string) => void;
  sessionId?: string;
}

export default function ModelSelector({ selectedModel, onModelChange, sessionId }: ModelSelectorProps) {
  const [models, setModels] = useState<Model[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const queryClient = useQueryClient();
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Запрос списка моделей
  const { data: modelsData } = useQuery({
    queryKey: ['/api/chat/models'],
    refetchOnWindowFocus: false,
    refetchOnMount: false,
    staleTime: 5 * 60 * 1000, // 5 минут
  });

  // Мутация для установки модели по умолчанию
  const setDefaultModelMutation = useMutation({
    mutationFn: async ({ modelId, sessionId }: { modelId: string; sessionId: string }) => {
      return apiRequest(`/api/sessions/${sessionId}/default-model`, 'POST', { modelId });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/sessions'] });
    },
  });

  // Загрузка и установка моделей
  useEffect(() => {
    if (modelsData && typeof modelsData === 'object' && 'models' in modelsData && Array.isArray(modelsData.models)) {
      setModels(modelsData.models);
      
      // Auto-select default model if none selected
      if (!selectedModel && modelsData.models.length > 0) {
        const defaultModel = modelsData.models.find((m: Model) => m.id === 'openai/gpt-4o-mini') || modelsData.models[0];
        onModelChange(defaultModel.id);
      }
    }
  }, [modelsData, selectedModel, onModelChange]);

  // Закрытие по клику вне
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [isOpen]);

  // Фильтрация моделей по поисковому запросу
  const filteredModels = models.filter(model => 
    model.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    model.id.toLowerCase().includes(searchTerm.toLowerCase()) ||
    model.provider.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const currentModel = models.find(model => model.id === selectedModel);

  const handleSetDefault = async (modelId: string) => {
    if (!sessionId) return;
    setDefaultModelMutation.mutate({ modelId, sessionId });
  };

  const handleModelSelect = (modelId: string) => {
    onModelChange(modelId);
    setIsOpen(false);
    setSearchTerm("");
  };

  return (
    <div className="relative" ref={dropdownRef}>
      {/* Компактное отображение модели */}
      <div 
        className="flex items-center space-x-2 cursor-pointer hover:opacity-80 transition-opacity"
        onClick={() => setIsOpen(!isOpen)}
        data-testid="select-model"
        title="Нажмите для смены модели"
      >
        <span className="text-xs text-muted-foreground">Модель:</span>
        <span className="text-sm font-medium text-white">
          {currentModel?.name?.split(' ')[0] || selectedModel.split('/').pop()}
        </span>
        <ChevronDown 
          className={`h-3 w-3 opacity-50 transition-transform ${isOpen ? 'rotate-180' : ''}`}
        />
      </div>

      {/* Кастомный выпадающий список */}
      {isOpen && (
        <div className="absolute top-full left-0 z-50 w-[300px] max-w-sm bg-[#2d2d2d] border-2 border-gray-600 shadow-xl text-white rounded-md mt-1">
          {/* Поиск */}
          <div className="p-2 border-b border-gray-600">
            <div className="relative">
              <Search size={16} className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                placeholder="Поиск моделей..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 text-sm h-8 bg-[#3d3d3d] border border-gray-500 text-white placeholder-gray-400 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                data-testid="input-search-models"
                autoFocus
              />
            </div>
          </div>
          
          {/* Список моделей */}
          <div className="max-h-72 overflow-y-auto">
            {filteredModels.length === 0 ? (
              <div className="p-4 text-center text-gray-400 text-sm">
                {searchTerm ? `Не найдено моделей по запросу "${searchTerm}"` : 'Модели не найдены'}
              </div>
            ) : (
              filteredModels.map((model) => (
                <div 
                  key={model.id} 
                  className={`py-2 px-3 hover:bg-[#404040] cursor-pointer text-white ${
                    selectedModel === model.id ? 'bg-[#404040]' : ''
                  }`}
                  onClick={() => handleModelSelect(model.id)}
                >
                  <div className="space-y-1 w-full">
                    <div className="flex items-start justify-between gap-2">
                      <span className="font-medium text-sm leading-tight">{model.name}</span>
                      <div className="flex items-center space-x-1 flex-shrink-0">
                        {model.id.includes('free') && (
                          <span className="text-xs text-green-600 px-1 py-0.5 bg-green-100 rounded">
                            FREE
                          </span>
                        )}
                        <span className="text-xs text-gray-400 px-1 py-0.5 bg-gray-700 rounded">
                          {model.provider}
                        </span>
                      </div>
                    </div>
                    <p className="text-xs text-gray-400 leading-tight">
                      {model.description}
                    </p>
                    {model.context && (
                      <p className="text-xs text-gray-400 opacity-75">
                        Контекст: {model.context.toLocaleString()} токенов
                      </p>
                    )}
                    
                    {/* Кнопка "Установить по умолчанию" */}
                    {sessionId && (
                      <div className="pt-1">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleSetDefault(model.id);
                          }}
                          disabled={setDefaultModelMutation.isPending}
                          className="text-xs h-6 px-2 bg-slate-700 hover:bg-slate-600 text-white border-slate-600"
                          data-testid={`button-set-default-${model.id}`}
                        >
                          <Star size={12} className="mr-1" />
                          {setDefaultModelMutation.isPending ? 'Сохранение...' : 'По умолчанию'}
                        </Button>
                      </div>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}