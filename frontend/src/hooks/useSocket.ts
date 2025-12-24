'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import type { WSEvent } from '@/lib/types';

const WS_URL = process.env.NEXT_PUBLIC_WS_URL || 'ws://localhost:3001';

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
        const connect = () => {
            try {
                const ws = new WebSocket(WS_URL);

                ws.onopen = () => {
                    console.log('🔌 WebSocket connected');
                    setIsConnected(true);
                };

                ws.onmessage = (event) => {
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
                    // Reconnect after 2 seconds
                    setTimeout(connect, 2000);
                };

                ws.onerror = (error) => {
                    console.error('WebSocket error:', error);
                };

                wsRef.current = ws;
            } catch (error) {
                console.error('Failed to create WebSocket:', error);
                setTimeout(connect, 2000);
            }
        };

        connect();

        return () => {
            wsRef.current?.close();
        };
    }, []);

    return { isConnected, lastEvent, subscribe, send };
}

