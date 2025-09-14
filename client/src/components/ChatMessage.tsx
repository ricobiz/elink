import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Edit2, Check, X, Settings, Loader2, MoreHorizontal } from "lucide-react";

interface Message {
  id: string;
  type: 'user' | 'ai' | 'system';
  content: string;
  timestamp: Date;
  metadata?: any;
  artifacts?: any[];
}

interface ChatMessageProps {
  message: Message;
  isThinking?: boolean;
  isLatestAiMessage?: boolean;
}

export default function ChatMessage({ message, isThinking = false, isLatestAiMessage = false }: ChatMessageProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [fullscreenImage, setFullscreenImage] = useState<string | null>(null);
  const [coordinateMarks, setCoordinateMarks] = useState<Array<{x: number, y: number, label: string, description?: string}>>([]);
  const [savedCoordinateSets, setSavedCoordinateSets] = useState<Array<{id: string, name: string, marks: Array<{x: number, y: number, label: string, description?: string}>}>>([]);
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [saveSetName, setSaveSetName] = useState('');
  const [editingMark, setEditingMark] = useState<{index: number, label: string, description: string} | null>(null);
  const [zoomLevel, setZoomLevel] = useState(1);
  const [panOffset, setPanOffset] = useState({x: 0, y: 0});
  const imageContainerRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({x: 0, y: 0});
  const [isSendingScreenshot, setIsSendingScreenshot] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editedContent, setEditedContent] = useState(message.content);

  // Touch events for pinch-to-zoom
  const handleTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length === 2) {
      const touch1 = e.touches[0];
      const touch2 = e.touches[1];
      const distance = Math.hypot(
        touch1.clientX - touch2.clientX,
        touch1.clientY - touch2.clientY
      );
      setDragStart({x: distance, y: zoomLevel});
    } else if (e.touches.length === 1) {
      setDragStart({x: e.touches[0].clientX - panOffset.x, y: e.touches[0].clientY - panOffset.y});
      setIsDragging(true);
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    e.preventDefault();
    if (e.touches.length === 2) {
      const touch1 = e.touches[0];
      const touch2 = e.touches[1];
      const distance = Math.hypot(
        touch1.clientX - touch2.clientX,
        touch1.clientY - touch2.clientY
      );
      const newZoom = Math.max(0.5, Math.min(5, dragStart.y * (distance / dragStart.x)));
      setZoomLevel(newZoom);
    } else if (e.touches.length === 1 && isDragging) {
      setPanOffset({
        x: e.touches[0].clientX - dragStart.x,
        y: e.touches[0].clientY - dragStart.y
      });
    }
  };

  const handleTouchEnd = () => {
    setIsDragging(false);
  };

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const newZoom = Math.max(0.5, Math.min(5, zoomLevel + (e.deltaY > 0 ? -0.1 : 0.1)));
    setZoomLevel(newZoom);
  };

  const resetZoom = () => {
    setZoomLevel(1);
    setPanOffset({x: 0, y: 0});
  };

  const saveCoordinateSet = () => {
    if (coordinateMarks.length === 0 || !saveSetName.trim()) return;
    
    const newSet = {
      id: Date.now().toString(),
      name: saveSetName.trim(),
      marks: [...coordinateMarks]
    };
    
    setSavedCoordinateSets([...savedCoordinateSets, newSet]);
    setSaveSetName('');
    setShowSaveDialog(false);
  };

  const loadCoordinateSet = (setId: string) => {
    const set = savedCoordinateSets.find(s => s.id === setId);
    if (set) {
      setCoordinateMarks([...set.marks]);
    }
  };

  const deleteCoordinateSet = (setId: string) => {
    setSavedCoordinateSets(savedCoordinateSets.filter(s => s.id !== setId));
  };

  const updateMark = (index: number, updates: Partial<{label: string, description: string}>) => {
    const updatedMarks = coordinateMarks.map((mark, i) => 
      i === index ? {...mark, ...updates} : mark
    );
    setCoordinateMarks(updatedMarks);
  };

  const sendMarkedScreenshotToChat = async () => {
    if (!fullscreenImage || coordinateMarks.length === 0 || isSendingScreenshot) return;
    
    setIsSendingScreenshot(true);
    try {
      // Send the screenshot with coordinate marks to chat
      const response = await fetch('/api/chat/marked-screenshot', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          sessionId: 'clean_test', // TODO: Get from current session
          screenshotUrl: fullscreenImage,
          coordinateMarks: coordinateMarks,
          message: `Размеченный скриншот с ${coordinateMarks.length} точками:\n${coordinateMarks.map((mark, i) => `${i+1}. ${mark.label} (${mark.x.toFixed(1)}%, ${mark.y.toFixed(1)}%)${mark.description ? ' - ' + mark.description : ''}`).join('\n')}`
        })
      });
      
      if (response.ok) {
        // Close the fullscreen view after successful send
        setFullscreenImage(null);
        setCoordinateMarks([]);
      } else {
        console.error('Failed to send marked screenshot');
      }
    } catch (error) {
      console.error('Error sending marked screenshot:', error);
    } finally {
      setIsSendingScreenshot(false);
    }
  };

  const formatTime = (timestamp: Date) => {
    return timestamp.toLocaleTimeString('ru-RU', {
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const getMessageIcon = () => {
    if (message.type === 'system' && message.metadata) {
      const metadata = message.metadata as any;
      switch (metadata.type) {
        case 'progress':
          return <i className="fas fa-tasks text-blue-500"></i>;
        case 'progress_step':
          return <i className="fas fa-play text-orange-500 animate-pulse"></i>;
        case 'progress_complete':
          return <i className="fas fa-check text-green-500"></i>;
        case 'progress_error':
          return <i className="fas fa-times text-red-500"></i>;
        case 'progress_final':
          return <i className="fas fa-trophy text-yellow-500"></i>;
        default:
          return <i className="fas fa-cog"></i>;
      }
    }

    switch (message.type) {
      case 'user':
        return <i className="fas fa-user"></i>;
      case 'ai':
        return <i className="fas fa-robot"></i>;
      case 'system':
        return <i className="fas fa-cog"></i>;
      default:
        return <i className="fas fa-comment"></i>;
    }
  };

  const getMessageStyle = () => {
    if (message.type === 'system' && message.metadata) {
      const metadata = message.metadata as any;
      switch (metadata.type) {
        case 'progress':
          return "bg-blue-50 dark:bg-blue-900/20 text-blue-800 dark:text-blue-200 mx-auto max-w-md border border-blue-200 dark:border-blue-700";
        case 'progress_step':
          return "bg-orange-50 dark:bg-orange-900/20 text-orange-800 dark:text-orange-200 mx-auto max-w-md border border-orange-200 dark:border-orange-700";
        case 'progress_complete':
          return "bg-green-50 dark:bg-green-900/20 text-green-800 dark:text-green-200 mx-auto max-w-md border border-green-200 dark:border-green-700";
        case 'progress_error':
          return "bg-red-50 dark:bg-red-900/20 text-red-800 dark:text-red-200 mx-auto max-w-md border border-red-200 dark:border-red-700";
        case 'progress_final':
          return "bg-yellow-50 dark:bg-yellow-900/20 text-yellow-800 dark:text-yellow-200 mx-auto max-w-md border border-yellow-200 dark:border-yellow-700";
        default:
          return "bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 mx-auto max-w-md border border-gray-200 dark:border-gray-700";
      }
    }

    switch (message.type) {
      case 'user':
        return "bg-blue-500 text-white mr-auto ml-0 max-w-[66.67%] shadow-md";
      case 'ai':
        return "bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-gray-100 ml-auto mr-0 max-w-[66.67%] shadow-md border border-gray-200 dark:border-gray-600";
      case 'system':
        return "bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 mx-auto max-w-md border border-gray-200 dark:border-gray-700";
      default:
        return "bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-gray-100";
    }
  };

  const parseContent = (content: string) => {
    // Проверяем JSON ответы от ИИ и извлекаем explanation
    if (content.trim().startsWith('{') && content.trim().endsWith('}')) {
      try {
        const parsed = JSON.parse(content);
        if (parsed.explanation) {
          return {
            isStructured: false,
            data: null,
            raw: parsed.explanation
          };
        }
        if (parsed.chat === true && typeof parsed.explanation === 'string') {
          return {
            isStructured: false,
            data: null,
            raw: parsed.explanation
          };
        }
      } catch (e) {
        // Не JSON, обрабатываем как обычный текст
      }
    }
    
    // Try to parse structured content from HTML responses
    if (content.includes('SERVICE:') && content.includes('STATUS:')) {
      const lines = content.split('\n');
      const parsed: Record<string, string> = {};
      
      lines.forEach(line => {
        const colonIndex = line.indexOf(':');
        if (colonIndex > 0) {
          const key = line.substring(0, colonIndex).trim();
          const value = line.substring(colonIndex + 1).trim();
          parsed[key] = value;
        }
      });
      
      return {
        isStructured: true,
        data: parsed,
        raw: content
      };
    }
    
    return {
      isStructured: false,
      data: null,
      raw: content
    };
  };

  const contentData = parseContent(message.content);

  return (
    <div className={`flex items-start mb-4 ${
      message.type === 'user' ? 'justify-start' : 
      message.type === 'ai' ? 'justify-end' : 
      'justify-center'
    }`}>
      {message.type === 'user' && (
        <div className="w-7 h-7 flex items-center justify-center mr-3 flex-shrink-0">
          <div 
            className="w-4 h-4 bg-green-400 rounded-full animate-pulse"
            style={{
              filter: 'drop-shadow(0 0 8px rgba(34, 197, 94, 0.8))'
            }}
            title="Пользователь"
          />
        </div>
      )}
      
      
      {/* AI Status Icon (additional status for latest AI message) */}
      {message.type === 'ai' && isLatestAiMessage && (
        <div className="w-6 h-6 flex items-center justify-center ml-2 flex-shrink-0 order-3">
          {message.metadata?.type === 'action_executing' || isThinking ? (
            <div title="AI выполняет действия">
              <Settings size={14} className="text-orange-500 animate-spin" />
            </div>
          ) : message.metadata?.type === 'analyzing' ? (
            <div title="AI думает над ответом">
              <MoreHorizontal size={14} className="text-blue-400 animate-pulse" />
            </div>
          ) : null}
        </div>
      )}
      
      <div className={`rounded-lg p-3 message-content max-w-full overflow-hidden ${getMessageStyle()}`}>
        <div className="space-y-2">
          {contentData.isStructured ? (
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <span className="font-medium text-sm">
                  {contentData.data?.ROUTE || 'Команда выполнена'}
                </span>
                <span className={`px-2 py-1 rounded text-xs ${
                  contentData.data?.STATUS === 'ok' ? 'bg-success text-success-foreground' :
                  contentData.data?.STATUS === 'error' ? 'bg-destructive text-destructive-foreground' :
                  'bg-muted text-muted-foreground'
                }`}>
                  {contentData.data?.STATUS || 'unknown'}
                </span>
              </div>
              
              {contentData.data?.SERVICE && (
                <p className="text-xs opacity-75">
                  Сервис: {contentData.data.SERVICE}
                </p>
              )}
              
              {contentData.data?.SID && (
                <p className="text-xs opacity-75">
                  Сессия: {contentData.data.SID}
                </p>
              )}
              
              {Object.entries(contentData.data || {}).map(([key, value]) => {
                if (['SERVICE', 'ROUTE', 'STATUS', 'VERSION', 'TIMESTAMP', 'SID'].includes(key)) {
                  return null;
                }
                
                return (
                  <div key={key} className="text-xs">
                    <span className="opacity-75">{key}:</span> {value}
                  </div>
                );
              })}
              
              {!isExpanded && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setIsExpanded(true)}
                  className="text-xs mt-2 p-1 h-auto"
                >
                  Показать детали
                </Button>
              )}
              
              {isExpanded && (
                <div className="mt-2 text-xs font-mono bg-background/50 p-2 rounded border">
                  <pre className="whitespace-pre-wrap text-xs break-words overflow-wrap-anywhere">{contentData.raw}</pre>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setIsExpanded(false)}
                    className="text-xs mt-2 p-1 h-auto"
                  >
                    Скрыть детали
                  </Button>
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-2">
              {/* Основное содержимое сообщения */}
              {isEditing && message.type === 'user' ? (
                <div className="space-y-2">
                  <textarea
                    value={editedContent}
                    onChange={(e) => setEditedContent(e.target.value)}
                    className="w-full p-2 text-sm border border-gray-300 rounded-md resize-none min-h-[60px] bg-white dark:bg-gray-800 dark:border-gray-600 dark:text-white"
                    rows={3}
                  />
                  <div className="flex items-center space-x-2">
                    <Button
                      size="sm"
                      onClick={() => {
                        // TODO: Отправить на сервер для обновления
                        setIsEditing(false);
                      }}
                      className="h-6 px-2 text-xs bg-green-600 hover:bg-green-700"
                    >
                      <Check size={12} />
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setEditedContent(message.content);
                        setIsEditing(false);
                      }}
                      className="h-6 px-2 text-xs"
                    >
                      <X size={12} />
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="flex items-start justify-between group">
                  <p className="text-sm whitespace-pre-wrap flex-1">{message.content}</p>
                  {message.type === 'user' && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setIsEditing(true)}
                      className="h-6 w-6 p-0 ml-2 opacity-0 group-hover:opacity-100 transition-opacity"
                      title="Редактировать сообщение"
                    >
                      <Edit2 size={12} />
                    </Button>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Полноэкранный просмотр скриншота с возможностью отметки координат */}
        {fullscreenImage && (
          <div 
            className="fixed inset-0 z-50 bg-black bg-opacity-90 flex items-center justify-center p-4 overflow-hidden"
            onClick={() => setFullscreenImage(null)}
          >
            <div 
              className="relative max-w-full max-h-full overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Расширенная панель инструментов */}
              <div className="absolute top-2 right-2 z-10 bg-white dark:bg-gray-800 rounded p-2 shadow-lg space-x-1 flex items-center flex-wrap max-w-xs">
                <div className="text-xs text-gray-500 w-full mb-1">Зум: {Math.round(zoomLevel * 100)}%</div>
                
                <Button variant="outline" size="sm" onClick={resetZoom} className="text-xs">🔍 Сброс</Button>
                <Button variant="outline" size="sm" onClick={() => setCoordinateMarks([])} className="text-xs">🗑 Очистить</Button>
                
                {coordinateMarks.length > 0 && (
                  <>
                    <Button variant="outline" size="sm" onClick={() => setShowSaveDialog(true)} className="text-xs">💾 Сохранить</Button>
                    <Button 
                      variant="outline" 
                      size="sm" 
                      onClick={sendMarkedScreenshotToChat} 
                      disabled={isSendingScreenshot}
                      className="text-xs"
                    >
                      {isSendingScreenshot ? '⏳' : '📤'} В чат
                    </Button>
                  </>
                )}
                
                {savedCoordinateSets.length > 0 && (
                  <select 
                    className="text-xs p-1 rounded border bg-white dark:bg-gray-700"
                    onChange={(e) => e.target.value && loadCoordinateSet(e.target.value)}
                    value=""
                  >
                    <option value="">Загрузить...</option>
                    {savedCoordinateSets.map(set => (
                      <option key={set.id} value={set.id}>{set.name} ({set.marks.length})</option>
                    ))}
                  </select>
                )}
                
                <Button variant="ghost" size="sm" onClick={() => setFullscreenImage(null)} className="text-xs">✕</Button>
              </div>

              {/* Изображение с зумом и панорамированием */}
              <div 
                ref={imageContainerRef}
                className="relative overflow-hidden cursor-move"
                style={{
                  touchAction: 'none',
                  userSelect: 'none'
                }}
                onTouchStart={handleTouchStart}
                onTouchMove={handleTouchMove}
                onTouchEnd={handleTouchEnd}
                onWheel={handleWheel}
              >
                <img 
                  src={fullscreenImage} 
                  alt="Полноэкранный скриншот"
                  className="max-w-none object-contain transition-transform"
                  style={{
                    transform: `scale(${zoomLevel}) translate(${panOffset.x / zoomLevel}px, ${panOffset.y / zoomLevel}px)`,
                    maxHeight: zoomLevel === 1 ? '90vh' : 'none',
                    cursor: zoomLevel > 1 ? 'move' : 'crosshair'
                  }}
                  onClick={(e) => {
                    // Добавляем точки при любом зуме
                    const rect = e.currentTarget.getBoundingClientRect();
                    const img = e.currentTarget;
                    
                    // Учитываем трансформацию (зум и панорамирование)
                    const clickX = e.clientX - rect.left;
                    const clickY = e.clientY - rect.top;
                    
                    // Преобразуем координаты с учетом зума и панорамирования
                    const originalX = (clickX / zoomLevel - panOffset.x / zoomLevel) / (rect.width / zoomLevel);
                    const originalY = (clickY / zoomLevel - panOffset.y / zoomLevel) / (rect.height / zoomLevel);
                    
                    // Конвертируем в проценты относительно оригинального изображения
                    const x = originalX * 100;
                    const y = originalY * 100;
                    
                    // Проверяем что клик внутри изображения
                    if (x >= 0 && x <= 100 && y >= 0 && y <= 100) {
                      const newMark = {
                        x: Math.max(0, Math.min(100, x)),
                        y: Math.max(0, Math.min(100, y)),
                        label: `Точка ${coordinateMarks.length + 1}`,
                        description: ''
                      };
                      
                      setCoordinateMarks([...coordinateMarks, newMark]);
                      console.log(`🎯 Координаты клика: ${newMark.x.toFixed(1)}%, ${newMark.y.toFixed(1)}% (зум: ${zoomLevel.toFixed(1)}x)`);
                    }
                  }}
                  draggable={false}
                />

                {/* Отображение меток координат */}
                {coordinateMarks.map((mark, index) => (
                  <div
                    key={index}
                    className="absolute cursor-pointer transform-gpu"
                    style={{
                      left: `${mark.x}%`,
                      top: `${mark.y}%`,
                      transform: `translate(-50%, -100%) scale(${Math.max(0.5, 1/zoomLevel)})`,
                      zIndex: 10
                    }}
                    onClick={(e) => {
                      e.stopPropagation();
                      // Двойной клик - редактирование, одинарный - удаление
                      if (e.detail === 2) {
                        setEditingMark({
                          index,
                          label: mark.label,
                          description: mark.description || ''
                        });
                      } else {
                        setTimeout(() => {
                          if (!editingMark) {
                            setCoordinateMarks(coordinateMarks.filter((_, i) => i !== index));
                          }
                        }, 200);
                      }
                    }}
                    title={`${mark.label}: ${mark.x.toFixed(1)}%, ${mark.y.toFixed(1)}%${mark.description ? '\n' + mark.description : ''}`}
                  >
                    {/* Булавка/пин стиль */}
                    <div className="relative">
                      {/* Основание булавки */}
                      <div 
                        className="w-6 h-6 bg-red-500 rounded-full border-2 border-white shadow-lg flex items-center justify-center text-white text-xs font-bold"
                        style={{
                          boxShadow: '0 2px 8px rgba(0,0,0,0.3)'
                        }}
                      >
                        {index + 1}
                      </div>
                      {/* Острие булавки */}
                      <div 
                        className="absolute left-1/2 transform -translate-x-1/2"
                        style={{
                          top: '100%',
                          width: 0,
                          height: 0,
                          borderLeft: '4px solid transparent',
                          borderRight: '4px solid transparent',
                          borderTop: '8px solid #dc2626',
                          filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.3))'
                        }}
                      />
                    </div>
                  </div>
                ))}
              </div>

              {/* Мобильная подсказка */}
              <div className="absolute top-16 left-2 bg-black bg-opacity-70 text-white rounded p-2 text-xs max-w-xs">
                <div>📱 На телефоне:</div>
                <div>• Двумя пальцами - зум</div>
                <div>• Одним пальцем - перетаскивание</div>
                <div>• Тап - добавить точку</div>
                <div>• Двойной тап точки - редактировать</div>
              </div>

              {/* Информационная панель с координатами */}
              {coordinateMarks.length > 0 && (
                <div className="absolute bottom-2 left-2 bg-white dark:bg-gray-800 rounded p-3 shadow-lg max-w-sm max-h-64 overflow-y-auto">
                  <div className="text-sm font-semibold mb-2">Отмеченные точки ({coordinateMarks.length}):</div>
                  {coordinateMarks.map((mark, index) => (
                    <div key={index} className="text-xs text-gray-600 dark:text-gray-300 mb-2 border-b border-gray-200 dark:border-gray-600 pb-1">
                      <div className="flex items-center mb-1">
                        <span className="inline-block w-4 h-4 bg-red-500 rounded-full text-center text-white text-xs mr-2">{index + 1}</span>
                        <span className="font-semibold">{mark.label}</span>
                      </div>
                      <div>X: {mark.x.toFixed(1)}%, Y: {mark.y.toFixed(1)}%</div>
                      {mark.description && (
                        <div className="text-gray-500 text-xs mt-1">{mark.description}</div>
                      )}
                    </div>
                  ))}
                  <div className="text-xs text-gray-500 mt-2 italic">
                    💡 Клик - удалить, двойной клик - редактировать
                  </div>
                </div>
              )}

              {/* Список сохраненных наборов координат */}
              {savedCoordinateSets.length > 0 && (
                <div className="absolute top-2 left-2 bg-white dark:bg-gray-800 rounded p-3 shadow-lg max-w-xs">
                  <div className="text-sm font-semibold mb-2">Сохраненные наборы:</div>
                  {savedCoordinateSets.map((set) => (
                    <div key={set.id} className="flex items-center justify-between mb-1 text-xs">
                      <span className="truncate mr-2">{set.name} ({set.marks.length})</span>
                      <div className="space-x-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => loadCoordinateSet(set.id)}
                          className="text-xs p-1 h-auto text-blue-500"
                        >
                          📥
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => deleteCoordinateSet(set.id)}
                          className="text-xs p-1 h-auto text-red-500"
                        >
                          🗑
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Диалог сохранения набора координат */}
        {showSaveDialog && (
          <div className="fixed inset-0 z-50 bg-black bg-opacity-50 flex items-center justify-center p-4">
            <div className="bg-white dark:bg-gray-800 rounded-lg p-6 max-w-md w-full">
              <h3 className="text-lg font-semibold mb-4">Сохранить набор координат</h3>
              <div className="space-y-4">
                <Input
                  placeholder="Название набора (например: 'Кнопки меню')"
                  value={saveSetName}
                  onChange={(e) => setSaveSetName(e.target.value)}
                />
                <div className="text-sm text-gray-600">
                  Будет сохранено {coordinateMarks.length} точек
                </div>
                <div className="flex space-x-2">
                  <Button onClick={saveCoordinateSet} disabled={!saveSetName.trim()}>
                    Сохранить
                  </Button>
                  <Button variant="outline" onClick={() => setShowSaveDialog(false)}>
                    Отмена
                  </Button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Диалог редактирования метки */}
        {editingMark && (
          <div className="fixed inset-0 z-50 bg-black bg-opacity-50 flex items-center justify-center p-4">
            <div className="bg-white dark:bg-gray-800 rounded-lg p-6 max-w-md w-full">
              <h3 className="text-lg font-semibold mb-4">Редактировать точку</h3>
              <div className="space-y-4">
                <Input
                  placeholder="Название точки"
                  value={editingMark.label}
                  onChange={(e) => setEditingMark({...editingMark, label: e.target.value})}
                />
                <Input
                  placeholder="Описание (необязательно)"
                  value={editingMark.description}
                  onChange={(e) => setEditingMark({...editingMark, description: e.target.value})}
                />
                <div className="flex space-x-2">
                  <Button onClick={() => {
                    updateMark(editingMark.index, {
                      label: editingMark.label,
                      description: editingMark.description
                    });
                    setEditingMark(null);
                  }}>
                    Сохранить
                  </Button>
                  <Button variant="outline" onClick={() => setEditingMark(null)}>
                    Отмена
                  </Button>
                </div>
              </div>
            </div>
          </div>
        )}
        
        <div className="flex items-center justify-between mt-2">
          <span className="text-xs opacity-50">
            {formatTime(message.timestamp)}
          </span>
        </div>
      </div>
      
      {message.type === 'ai' && (
        <div className="w-8 h-8 flex items-center justify-center ml-3 flex-shrink-0">
          <div 
            className="w-6 h-6 bg-blue-400 animate-pulse"
            style={{
              clipPath: 'polygon(50% 100%, 0% 0%, 100% 0%)',
              filter: 'drop-shadow(0 2px 8px rgba(59, 130, 246, 0.7))'
            }}
            title="Искусственный интеллект"
          />
        </div>
      )}
      
      {message.type === 'system' && (
        <div className="w-8 h-8 rounded-full bg-gray-400 flex items-center justify-center text-white text-xs mx-3 flex-shrink-0">
          {getMessageIcon()}
        </div>
      )}
    </div>
  );
}