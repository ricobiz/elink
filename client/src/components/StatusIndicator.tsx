import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";

interface StatusIndicatorProps {
  size?: 'sm' | 'md' | 'lg';
  showLabels?: boolean;
  compact?: boolean;
}

interface InstanceStatus {
  id: string;
  name: string;
  status: 'running' | 'paused' | 'stopped';
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

export default function StatusIndicator({ size = 'md', showLabels = true, compact = false }: StatusIndicatorProps) {
  const [services, setServices] = useState<ServiceStatus[]>([]);
  const [systemStatus, setSystemStatus] = useState<'running' | 'paused' | 'stopped'>('running');

  // Проверка статуса сервисов
  const { data: statusData } = useQuery({
    queryKey: ['/api/status/health'],
    refetchInterval: 30000, // Обновлять каждые 30 секунд для снижения нагрузки на Redis
  });

  useEffect(() => {
    if (statusData && typeof statusData === 'object' && 'services' in statusData && Array.isArray(statusData.services)) {
      setServices(statusData.services as ServiceStatus[]);
    }
  }, [statusData]);

  const handleSystemControl = async (action: 'start' | 'pause' | 'stop') => {
    try {
      // Обновляем статус системы
      setSystemStatus(action === 'start' ? 'running' : action === 'pause' ? 'paused' : 'stopped');
      
      // Здесь можно добавить API вызов для управления системой
      // await apiRequest(`/api/system/${action}`, { method: 'POST' });
    } catch (error) {
      console.error('Ошибка управления системой:', error);
    }
  };

  const sizeClasses = {
    sm: 'w-1 h-3',
    md: 'w-1 h-4', 
    lg: 'w-1.5 h-5'
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'operational': return { color: 'bg-green-500', shadow: '#22c55e' };
      case 'degraded': return { color: 'bg-yellow-500', shadow: '#eab308' };
      case 'down': return { color: 'bg-red-500', shadow: '#ef4444' };
      default: return { color: 'bg-gray-500', shadow: '#6b7280' };
    }
  };

  if (compact) {
    // Компактный режим - простые индикаторы статуса сервисов (без треугольников!)
    return (
      <div className="flex items-center space-x-1" data-testid="status-indicators-compact">
        {services.length === 0 ? (
          <div className="w-2 h-2 bg-slate-600 rounded-full animate-pulse" />
        ) : (
          services.slice(0, 3).map((service, index) => {
            const statusInfo = getStatusColor(service.status);
            return (
              <div key={service.name} className="relative group">
                <div
                  className={`w-2 h-2 rounded-full transition-all duration-300 ${statusInfo.color}`}
                  style={{
                    boxShadow: `0 0 4px ${statusInfo.shadow}60`
                  }}
                  data-testid={`status-dot-${service.name.toLowerCase()}`}
                />
                <div className="absolute -top-8 left-1/2 transform -translate-x-1/2 bg-gray-900 text-white text-xs px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-50">
                  {service.name}: {service.status === 'operational' ? 'OK' :
                   service.status === 'degraded' ? 'Проблемы' : 'Недоступен'}
                </div>
              </div>
            );
          })
        )}
      </div>
    );
  }

  return (
    <div className="bg-slate-900 p-3 rounded-lg" data-testid="status-indicators">
      {showLabels && (
        <div className="mb-3">
          <h3 className="text-sm font-medium text-white mb-1">Статус эндпоинтов</h3>
          <p className="text-xs text-slate-400">Обновление каждые 30 сек</p>
        </div>
      )}
      
      <div className="grid grid-cols-1 gap-2">
        {services.length === 0 ? (
          <div className="text-xs text-slate-400">Загрузка статуса...</div>
        ) : (
          services.map((service) => {
            const statusInfo = getStatusColor(service.status);
            return (
              <div key={service.name} className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  {/* Тонкая наклонная линия с внутренней подсветкой */}
                  <div 
                    className={`
                      ${sizeClasses[size]} 
                      ${statusInfo.color}
                      transform rotate-12 
                      transition-all duration-500 ease-in-out
                    `}
                    style={{
                      boxShadow: `0 0 8px ${statusInfo.shadow}80, 0 0 4px ${statusInfo.shadow}60`
                    }}
                    data-testid={`status-${service.name.toLowerCase()}`}
                  />
                  <div>
                    <span className="text-xs font-medium text-white">{service.name}</span>
                    <div className="text-xs text-slate-400">{service.endpoint}</div>
                  </div>
                </div>
                
                <div className="text-right">
                  <div className={`text-xs font-medium ${
                    service.status === 'operational' ? 'text-green-400' :
                    service.status === 'degraded' ? 'text-yellow-400' : 'text-red-400'
                  }`}>
                    {service.status === 'operational' ? 'OK' :
                     service.status === 'degraded' ? 'Проблемы' : 'Недоступен'}
                  </div>
                  {service.responseTime && (
                    <div className="text-xs text-slate-500">{service.responseTime}ms</div>
                  )}
                  {service.error && (
                    <div className="text-xs text-red-400 max-w-[120px] truncate" title={service.error}>
                      {service.error}
                    </div>
                  )}
                  {service.metadata?.count !== undefined && (
                    <div className="text-xs text-slate-400">{service.metadata.count} сессий</div>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

// Отдельный компонент для компактного отображения в header
export function CompactStatusIndicator() {
  return <StatusIndicator size="sm" showLabels={true} compact={true} />;
}

// Развернутый компонент для страницы статуса  
export function DetailedStatusIndicator() {
  return <StatusIndicator size="md" showLabels={true} compact={false} />;
}