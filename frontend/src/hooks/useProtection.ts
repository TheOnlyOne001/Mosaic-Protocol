'use client';

/**
 * useProtection - React Hook for Protection System
 * 
 * Handles WebSocket events for real-time protection alerts,
 * API calls for position data, and protection management.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { PositionData } from '../components/protection/PositionCard';
import { AlertSeverity } from '../components/protection/DangerAlert';
import { ProtectionMode, ProtectionSettings } from '../components/protection/ProtectionSheet';

// ============================================================================
// TYPES
// ============================================================================

export interface ProtectionAlert {
    id: string;
    severity: AlertSeverity;
    title: string;
    message: string;
    protocol?: string;
    chain?: string;
    healthFactor?: number;
    actionLabel?: string;
    timestamp: number;
}

export interface ProtectionState {
    // Positions
    positions: PositionData[];
    isLoadingPositions: boolean;
    positionsError: string | null;

    // Alerts
    alerts: ProtectionAlert[];

    // Protection status
    monitoredPositions: Set<string>; // Set of position IDs being monitored
    isProtectionEnabled: boolean;

    // Connection
    isConnected: boolean;
}

// ============================================================================
// HOOK
// ============================================================================

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
const WS_URL = process.env.NEXT_PUBLIC_WS_URL || 'ws://localhost:3001';

export function useProtection(userAddress?: string, chain: string = 'base') {
    const [state, setState] = useState<ProtectionState>({
        positions: [],
        isLoadingPositions: false,
        positionsError: null,
        alerts: [],
        monitoredPositions: new Set(),
        isProtectionEnabled: false,
        isConnected: false,
    });

    const wsRef = useRef<WebSocket | null>(null);
    const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);

    // ========================================================================
    // FETCH POSITIONS
    // ========================================================================

    const fetchAllPositions = useCallback(async () => {
        if (!userAddress) return;

        setState(prev => ({ ...prev, isLoadingPositions: true, positionsError: null }));

        try {
            const response = await fetch(
                `${API_BASE}/api/protection/all-positions/${chain}/${userAddress}`
            );

            if (!response.ok) throw new Error('Failed to fetch positions');

            const data = await response.json();

            if (data.success && data.positions) {
                setState(prev => ({
                    ...prev,
                    positions: data.positions,
                    isLoadingPositions: false,
                }));
            }
        } catch (error) {
            setState(prev => ({
                ...prev,
                positionsError: error instanceof Error ? error.message : 'Unknown error',
                isLoadingPositions: false,
            }));
        }
    }, [userAddress, chain]);

    // ========================================================================
    // REGISTER POSITION FOR MONITORING
    // ========================================================================

    const registerPosition = useCallback(async (
        protocol: string,
        settings: ProtectionSettings
    ): Promise<boolean> => {
        if (!userAddress) return false;

        try {
            const response = await fetch(`${API_BASE}/api/protection/register`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    userAddress,
                    protocol,
                    chain,
                    alertThreshold: settings.alertThreshold,
                    autoProtectThreshold: settings.autoProtectThreshold,
                    targetHealthFactor: settings.targetHealthFactor,
                    autoProtectEnabled: settings.mode === 'auto_protect',
                }),
            });

            const data = await response.json();

            if (data.success) {
                const positionId = `${protocol}-${chain}-${userAddress}`;
                setState(prev => ({
                    ...prev,
                    monitoredPositions: new Set([...prev.monitoredPositions, positionId]),
                    isProtectionEnabled: true,
                }));

                // Add success alert
                addAlert({
                    severity: 'success',
                    title: 'Protection Enabled',
                    message: settings.mode === 'auto_protect'
                        ? 'Auto-protection is now active. We\'ll protect your position automatically.'
                        : 'You\'ll receive alerts when your health factor drops.',
                    protocol,
                    chain,
                });

                return true;
            }

            return false;
        } catch (error) {
            addAlert({
                severity: 'danger',
                title: 'Failed to Enable Protection',
                message: error instanceof Error ? error.message : 'Unknown error',
            });
            return false;
        }
    }, [userAddress, chain]);

    // ========================================================================
    // UNREGISTER POSITION
    // ========================================================================

    const unregisterPosition = useCallback(async (protocol: string): Promise<boolean> => {
        if (!userAddress) return false;

        try {
            const response = await fetch(`${API_BASE}/api/protection/unregister`, {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userAddress, protocol, chain }),
            });

            const data = await response.json();

            if (data.success) {
                const positionId = `${protocol}-${chain}-${userAddress}`;
                setState(prev => {
                    const newSet = new Set(prev.monitoredPositions);
                    newSet.delete(positionId);
                    return {
                        ...prev,
                        monitoredPositions: newSet,
                        isProtectionEnabled: newSet.size > 0,
                    };
                });
                return true;
            }

            return false;
        } catch {
            return false;
        }
    }, [userAddress, chain]);

    // ========================================================================
    // ALERT MANAGEMENT
    // ========================================================================

    const addAlert = useCallback((alert: Omit<ProtectionAlert, 'id' | 'timestamp'>) => {
        const newAlert: ProtectionAlert = {
            ...alert,
            id: `alert-${Date.now()}-${Math.random().toString(36).slice(2)}`,
            timestamp: Date.now(),
        };

        setState(prev => ({
            ...prev,
            alerts: [...prev.alerts, newAlert],
        }));
    }, []);

    const dismissAlert = useCallback((alertId: string) => {
        setState(prev => ({
            ...prev,
            alerts: prev.alerts.filter(a => a.id !== alertId),
        }));
    }, []);

    const clearAllAlerts = useCallback(() => {
        setState(prev => ({ ...prev, alerts: [] }));
    }, []);

    // ========================================================================
    // WEBSOCKET CONNECTION
    // ========================================================================

    useEffect(() => {
        let ws: WebSocket | null = null;

        const connect = () => {
            try {
                ws = new WebSocket(WS_URL);
                wsRef.current = ws;

                ws.onopen = () => {
                    console.log('[useProtection] WebSocket connected');
                    setState(prev => ({ ...prev, isConnected: true }));
                };

                ws.onmessage = (event) => {
                    try {
                        const data = JSON.parse(event.data);
                        handleWSMessage(data);
                    } catch (e) {
                        console.error('[useProtection] Failed to parse message:', e);
                    }
                };

                ws.onclose = () => {
                    console.log('[useProtection] WebSocket disconnected');
                    setState(prev => ({ ...prev, isConnected: false }));

                    // Reconnect after 3 seconds
                    reconnectTimeoutRef.current = setTimeout(connect, 3000);
                };

                ws.onerror = (error) => {
                    console.error('[useProtection] WebSocket error:', error);
                };
            } catch (error) {
                console.error('[useProtection] Failed to connect:', error);
            }
        };

        const handleWSMessage = (data: { type: string;[key: string]: unknown }) => {
            switch (data.type) {
                case 'protection:warning':
                    addAlert({
                        severity: 'warning',
                        title: 'Health Factor Dropping',
                        message: data.message as string || 'Your position health is decreasing.',
                        protocol: data.protocol as string,
                        chain: data.chain as string,
                        healthFactor: data.healthFactor as number,
                    });
                    break;

                case 'protection:danger':
                    addAlert({
                        severity: 'danger',
                        title: 'Liquidation Risk',
                        message: data.message as string || 'Your position is at risk of liquidation.',
                        protocol: data.protocol as string,
                        chain: data.chain as string,
                        healthFactor: data.healthFactor as number,
                        actionLabel: 'Protect Now',
                    });
                    break;

                case 'protection:critical':
                    addAlert({
                        severity: 'critical',
                        title: '⚠️ CRITICAL: Liquidation Imminent',
                        message: data.message as string || 'Immediate action required to prevent liquidation!',
                        protocol: data.protocol as string,
                        chain: data.chain as string,
                        healthFactor: data.healthFactor as number,
                        actionLabel: 'Protect Immediately',
                    });
                    break;

                case 'protection:action_taken':
                    addAlert({
                        severity: 'success',
                        title: '✅ Position Protected',
                        message: data.message as string || 'Auto-protection successfully executed.',
                        protocol: data.protocol as string,
                        chain: data.chain as string,
                    });
                    // Refresh positions after protection action
                    fetchAllPositions();
                    break;

                case 'protection:safe':
                    // Silent - no alert needed when safe
                    break;
            }
        };

        connect();

        return () => {
            if (reconnectTimeoutRef.current) {
                clearTimeout(reconnectTimeoutRef.current);
            }
            if (ws) {
                ws.close();
            }
        };
    }, [addAlert, fetchAllPositions]);

    // ========================================================================
    // AUTO-FETCH POSITIONS
    // ========================================================================

    useEffect(() => {
        if (userAddress) {
            fetchAllPositions();
        }
    }, [userAddress, fetchAllPositions]);

    // ========================================================================
    // RETURN
    // ========================================================================

    return {
        // State
        ...state,

        // Actions
        fetchAllPositions,
        registerPosition,
        unregisterPosition,

        // Alerts
        addAlert,
        dismissAlert,
        clearAllAlerts,

        // Helpers
        isPositionMonitored: (protocol: string) =>
            state.monitoredPositions.has(`${protocol}-${chain}-${userAddress}`),

        getPositionByProtocol: (protocol: string) =>
            state.positions.find(p => p.protocol.toLowerCase() === protocol.toLowerCase()),
    };
}
