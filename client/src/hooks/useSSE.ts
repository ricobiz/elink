import { useEffect, useRef, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";

export function useSSE(sessionId: string | null) {
  const eventSourceRef = useRef<EventSource | null>(null);
  const queryClient = useQueryClient();
  const retryTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const retryCountRef = useRef<number>(0);
  const isConnectingRef = useRef<boolean>(false);
  const heartbeatTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // 🔄 УЛУЧШЕННЫЙ RETRY MECHANISM с exponential backoff
  const connectSSE = useCallback(() => {
    if (!sessionId || isConnectingRef.current) return;

    // Clean up existing connection
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }

    // Clean up existing heartbeat
    if (heartbeatTimeoutRef.current) {
      clearTimeout(heartbeatTimeoutRef.current);
      heartbeatTimeoutRef.current = null;
    }

    isConnectingRef.current = true;
    console.log(`🔌 Connecting SSE for session ${sessionId} (attempt ${retryCountRef.current + 1})`);

    try {
      const eventSource = new EventSource(`/api/events/stream?session=${sessionId}`);
      eventSourceRef.current = eventSource;

      eventSource.onopen = () => {
        console.log('✅ SSE connection opened successfully');
        isConnectingRef.current = false;
        retryCountRef.current = 0; // Reset retry count on successful connection
        
        // Start heartbeat monitoring
        resetHeartbeatTimeout();
      };

      eventSource.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          
          // 💓 HEARTBEAT DETECTION
          if (data.type === 'heartbeat') {
            console.log('💓 SSE Heartbeat received');
            resetHeartbeatTimeout();
            return;
          }

          console.log('📨 SSE message received:', data.type);
          
          if (data.type === 'event') {
            queryClient.invalidateQueries({ queryKey: ['/api/events/recent'] });
          } else if (data.type === 'chat_message') {
            queryClient.invalidateQueries({ queryKey: ['/api/chat/messages', sessionId] });
          } else if (data.type === 'execution_loop_progress') {
            console.log('🤖 Automation progress update:', data.data);
            queryClient.invalidateQueries({ queryKey: ['/api/automation/status', sessionId] });
            queryClient.invalidateQueries({ queryKey: ['/api/events/recent'] });
            queryClient.setQueryData(['/api/automation/progress', sessionId], data.data);
          } else if (data.type === 'connected') {
            console.log('✅ SSE connection established for session:', sessionId);
          } else if (data.type === 'system_message') {
            console.log('📋 System message received:', data.data);
            queryClient.invalidateQueries({ queryKey: ['/api/chat/messages', sessionId] });
          }
          
          resetHeartbeatTimeout();
        } catch (error) {
          console.error('❌ SSE message parse error:', error);
        }
      };

      eventSource.onerror = (error) => {
        isConnectingRef.current = false;
        
        console.error('❌ SSE error details:', {
          readyState: eventSource.readyState,
          url: eventSource.url,
          retryCount: retryCountRef.current
        });
        
        if (eventSource.readyState === EventSource.CLOSED) {
          console.log('🔌 SSE connection permanently closed, scheduling retry...');
          scheduleRetry();
        } else {
          console.log('⚠️ SSE connection error, will auto-retry...');
        }
      };

    } catch (error) {
      console.error('❌ Failed to create SSE connection:', error);
      isConnectingRef.current = false;
      scheduleRetry();
    }
  }, [sessionId, queryClient]);

  // 💓 HEARTBEAT TIMEOUT RESET
  const resetHeartbeatTimeout = useCallback(() => {
    if (heartbeatTimeoutRef.current) {
      clearTimeout(heartbeatTimeoutRef.current);
    }
    
    // If no heartbeat received in 60 seconds, consider connection dead
    heartbeatTimeoutRef.current = setTimeout(() => {
      console.warn('💀 SSE Heartbeat timeout, forcing reconnection...');
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }
      scheduleRetry();
    }, 60000);
  }, []);

  // 🔄 SMART RETRY SCHEDULER with exponential backoff
  const scheduleRetry = useCallback(() => {
    if (retryTimeoutRef.current) {
      clearTimeout(retryTimeoutRef.current);
    }
    
    retryCountRef.current++;
    
    // Exponential backoff: 1s, 2s, 4s, 8s, 15s, 30s, 60s max
    const retryDelay = Math.min(
      1000 * Math.pow(2, retryCountRef.current - 1),
      60000
    );
    
    console.log(`⏰ Scheduling SSE retry #${retryCountRef.current} in ${retryDelay}ms`);
    
    retryTimeoutRef.current = setTimeout(() => {
      connectSSE();
    }, retryDelay);
  }, [connectSSE]);

  useEffect(() => {
    if (!sessionId) {
      // Clean up when no session
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
      if (retryTimeoutRef.current) {
        clearTimeout(retryTimeoutRef.current);
        retryTimeoutRef.current = null;
      }
      if (heartbeatTimeoutRef.current) {
        clearTimeout(heartbeatTimeoutRef.current);
        heartbeatTimeoutRef.current = null;
      }
      retryCountRef.current = 0;
      isConnectingRef.current = false;
      return;
    }

    // Start initial connection
    connectSSE();

    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }
      if (retryTimeoutRef.current) {
        clearTimeout(retryTimeoutRef.current);
      }
      if (heartbeatTimeoutRef.current) {
        clearTimeout(heartbeatTimeoutRef.current);
      }
    };
  }, [sessionId, connectSSE]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }
    };
  }, []);
}
