'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import type { WSEvent } from '@/lib/types';

function getWsUrl(): string {
    if (typeof window === 'undefined') {
        return process.env.NEXT_PUBLIC_WS_URL || 'wss://mosaic-protocol.onrender.com';
    }
    
    try {
        const stored = localStorage.getItem('mosaic_api_keys');
        if (stored) {
            const parsed = JSON.parse(stored);
            if (parsed.backendUrl) {
                // Convert http(s) to ws(s)
                return parsed.backendUrl.replace(/^http/, 'ws');
            }
        }
    } catch (e) {
        console.error('Failed to get stored backend URL:', e);
    }
    
    return process.env.NEXT_PUBLIC_WS_URL || 'wss://mosaic-protocol.onrender.com';
}

export function useSocket() {
    const wsRef = useRef<WebSocket | null>(null);
    const [isConnected, setIsConnected] = useState(false);
    const [lastEvent, setLastEvent] = useState<WSEvent | null>(null);
    const listenersRef = useRef<Set<(event: WSEvent) => void>>(new Set());

    const subscribe = useCallback((listener: (event: WSEvent) => void) => {
        listenersRef.current.add(listener);
        return () => {
            listenersRef.current.delete(listener);
        };
    }, []);

    const send = useCallback((data: object) => {
        if (wsRef.current?.readyState === WebSocket.OPEN) {
            wsRef.current.send(JSON.stringify(data));
        }
    }, []);

    useEffect(() => {
        let reconnectTimeout: NodeJS.Timeout | null = null;
        let isUnmounted = false;

        const connect = () => {
            if (isUnmounted) return;
            
            try {
                const wsUrl = getWsUrl();
                console.log('🔌 Connecting to WebSocket:', wsUrl);
                const ws = new WebSocket(wsUrl);

                ws.onopen = () => {
                    if (isUnmounted) {
                        ws.close();
                        return;
                    }
                    console.log('🔌 WebSocket connected');
                    setIsConnected(true);
                };

                ws.onmessage = (event) => {
                    if (isUnmounted) return;
                    try {
                        const data = JSON.parse(event.data) as WSEvent;
                        setLastEvent(data);
                        listenersRef.current.forEach((listener) => listener(data));
                    } catch (e) {
                        console.error('Failed to parse WebSocket message:', e);
                    }
                };

                ws.onclose = () => {
                    console.log('🔌 WebSocket disconnected');
                    setIsConnected(false);
                    if (!isUnmounted) {
                        // Reconnect after 2 seconds
                        reconnectTimeout = setTimeout(connect, 2000);
                    }
                };

                ws.onerror = (error) => {
                    console.error('WebSocket error:', error);
                };

                wsRef.current = ws;
            } catch (error) {
                console.error('Failed to create WebSocket:', error);
                if (!isUnmounted) {
                    reconnectTimeout = setTimeout(connect, 2000);
                }
            }
        };

        connect();

        return () => {
            isUnmounted = true;
            if (reconnectTimeout) {
                clearTimeout(reconnectTimeout);
            }
            wsRef.current?.close();
        };
    }, []);

    return { isConnected, lastEvent, subscribe, send };
}

