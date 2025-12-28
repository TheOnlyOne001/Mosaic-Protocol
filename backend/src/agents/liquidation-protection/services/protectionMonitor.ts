/**
 * Protection Monitor Service
 * 
 * 24/7 background monitoring service for lending protocol positions.
 * Implements production-ready patterns:
 * - Recursive setTimeout (not setInterval) for drift-free scheduling
 * - Circuit breaker for RPC failures
 * - Rate limiting for RPC calls
 * - Graceful shutdown handling
 * - Memory-safe position registry
 */

import { EventEmitter } from 'events';
import {
    getHealthMonitor,
    HealthMonitor,
    PositionHealth,
    HealthCheckResult,
    RiskLevel,
    HealthAlert,
} from '../index.js';
import { broadcast } from '../../../index.js';

// ============================================================================
// TYPES
// ============================================================================

export interface MonitoredPosition {
    userAddress: string;
    protocol: string;
    chain: string;

    // Protection config
    alertThreshold: number;      // HF threshold for alerts (e.g., 1.3)
    autoProtectThreshold: number; // HF threshold for auto-action (e.g., 1.15)
    autoProtectEnabled: boolean;

    // State
    lastHealth: PositionHealth | null;
    lastChecked: number;
    alertsSent: number;

    // Registered at
    registeredAt: number;
}

export interface MonitorConfig {
    intervalMs: number;          // Check interval (default: 30s)
    maxConcurrentChecks: number; // Max parallel RPC calls
    circuitBreakerThreshold: number; // Failures before circuit opens
    circuitBreakerResetMs: number;   // Time before retry after circuit opens
    rpcRateLimit: number;        // Max RPC calls per second

    // Callbacks
    onAlert?: (alert: ProtectionAlert) => void;
    onAutoProtect?: (position: MonitoredPosition, health: PositionHealth) => void;
}

export interface ProtectionAlert {
    id: string;
    type: 'warning' | 'danger' | 'critical' | 'action_taken' | 'safe';
    userAddress: string;
    protocol: string;
    chain: string;
    healthFactor: number;
    riskLevel: RiskLevel;
    message: string;
    timestamp: number;
    actionRequired: boolean;
}

// ============================================================================
// DEFAULT CONFIG
// ============================================================================

const DEFAULT_CONFIG: MonitorConfig = {
    intervalMs: 30000,           // 30 seconds
    maxConcurrentChecks: 5,
    circuitBreakerThreshold: 5,
    circuitBreakerResetMs: 60000, // 1 minute
    rpcRateLimit: 10,            // 10 calls/second
};

// ============================================================================
// CIRCUIT BREAKER
// ============================================================================

class CircuitBreaker {
    private failures: number = 0;
    private lastFailure: number = 0;
    private state: 'closed' | 'open' | 'half-open' = 'closed';

    constructor(
        private threshold: number,
        private resetMs: number
    ) { }

    async execute<T>(fn: () => Promise<T>): Promise<T> {
        // Check if circuit should reset
        if (this.state === 'open') {
            if (Date.now() - this.lastFailure > this.resetMs) {
                this.state = 'half-open';
                console.log('[CircuitBreaker] Transitioning to half-open');
            } else {
                throw new Error('Circuit breaker is open');
            }
        }

        try {
            const result = await fn();
            this.onSuccess();
            return result;
        } catch (error) {
            this.onFailure();
            throw error;
        }
    }

    private onSuccess(): void {
        this.failures = 0;
        if (this.state === 'half-open') {
            this.state = 'closed';
            console.log('[CircuitBreaker] Circuit closed');
        }
    }

    private onFailure(): void {
        this.failures++;
        this.lastFailure = Date.now();

        if (this.failures >= this.threshold) {
            this.state = 'open';
            console.log(`[CircuitBreaker] Circuit opened after ${this.failures} failures`);
        }
    }

    isOpen(): boolean {
        return this.state === 'open';
    }
}

// ============================================================================
// RATE LIMITER (Token Bucket)
// ============================================================================

class RateLimiter {
    private tokens: number;
    private lastRefill: number;
    private queue: Array<() => void> = [];

    constructor(
        private ratePerSecond: number
    ) {
        this.tokens = ratePerSecond;
        this.lastRefill = Date.now();
    }

    async acquire(): Promise<void> {
        this.refill();

        if (this.tokens > 0) {
            this.tokens--;
            return;
        }

        // Wait for next token
        return new Promise((resolve) => {
            this.queue.push(resolve);
            setTimeout(() => this.processQueue(), 1000 / this.ratePerSecond);
        });
    }

    private refill(): void {
        const now = Date.now();
        const elapsed = now - this.lastRefill;
        const tokensToAdd = Math.floor(elapsed / 1000 * this.ratePerSecond);

        if (tokensToAdd > 0) {
            this.tokens = Math.min(this.ratePerSecond, this.tokens + tokensToAdd);
            this.lastRefill = now;
        }
    }

    private processQueue(): void {
        this.refill();
        while (this.queue.length > 0 && this.tokens > 0) {
            this.tokens--;
            const resolve = this.queue.shift();
            resolve?.();
        }
    }
}

// ============================================================================
// PROTECTION MONITOR SERVICE
// ============================================================================

export class ProtectionMonitor extends EventEmitter {
    private healthMonitor: HealthMonitor;
    private positions: Map<string, MonitoredPosition> = new Map();
    private config: MonitorConfig;
    private isRunning: boolean = false;
    private timeout: NodeJS.Timeout | null = null;
    private circuitBreaker: CircuitBreaker;
    private rateLimiter: RateLimiter;

    // Stats
    private stats = {
        checksCompleted: 0,
        alertsSent: 0,
        errorsEncountered: 0,
        autoProtectTriggered: 0,
        startedAt: 0,
    };

    constructor(config: Partial<MonitorConfig> = {}) {
        super();
        this.config = { ...DEFAULT_CONFIG, ...config };
        this.healthMonitor = getHealthMonitor();
        this.circuitBreaker = new CircuitBreaker(
            this.config.circuitBreakerThreshold,
            this.config.circuitBreakerResetMs
        );
        this.rateLimiter = new RateLimiter(this.config.rpcRateLimit);

        // Register for health alerts
        this.healthMonitor.onAlert((alert) => this.handleHealthAlert(alert));
    }

    // ========================================================================
    // LIFECYCLE
    // ========================================================================

    /**
     * Start the monitoring service
     */
    start(): void {
        if (this.isRunning) {
            console.log('[ProtectionMonitor] Already running');
            return;
        }

        this.isRunning = true;
        this.stats.startedAt = Date.now();

        console.log('╔══════════════════════════════════════════════════════════════╗');
        console.log('║  🛡️  PROTECTION MONITOR STARTED                              ║');
        console.log(`║  Interval: ${this.config.intervalMs / 1000}s | Positions: ${this.positions.size}                      ║`);
        console.log('╚══════════════════════════════════════════════════════════════╝');

        // Start the monitoring loop
        this.tick();

        // Broadcast status
        broadcast({
            type: 'protection:status',
            status: 'started',
            positionsMonitored: this.positions.size,
        });
    }

    /**
     * Stop the monitoring service (graceful shutdown)
     */
    stop(): void {
        if (!this.isRunning) return;

        this.isRunning = false;

        if (this.timeout) {
            clearTimeout(this.timeout);
            this.timeout = null;
        }

        const uptime = Math.floor((Date.now() - this.stats.startedAt) / 1000);

        console.log('╔══════════════════════════════════════════════════════════════╗');
        console.log('║  🛡️  PROTECTION MONITOR STOPPED                              ║');
        console.log(`║  Uptime: ${uptime}s | Checks: ${this.stats.checksCompleted} | Alerts: ${this.stats.alertsSent}      ║`);
        console.log('╚══════════════════════════════════════════════════════════════╝');

        broadcast({
            type: 'protection:status',
            status: 'stopped',
            stats: this.stats,
        });
    }

    // ========================================================================
    // POSITION REGISTRY
    // ========================================================================

    /**
     * Register a position for monitoring
     */
    registerPosition(
        userAddress: string,
        protocol: string,
        chain: string,
        options: {
            alertThreshold?: number;
            autoProtectThreshold?: number;
            autoProtectEnabled?: boolean;
        } = {}
    ): string {
        const key = this.getPositionKey(userAddress, protocol, chain);

        const position: MonitoredPosition = {
            userAddress,
            protocol,
            chain,
            alertThreshold: options.alertThreshold ?? 1.3,
            autoProtectThreshold: options.autoProtectThreshold ?? 1.15,
            autoProtectEnabled: options.autoProtectEnabled ?? false,
            lastHealth: null,
            lastChecked: 0,
            alertsSent: 0,
            registeredAt: Date.now(),
        };

        this.positions.set(key, position);

        console.log(`[ProtectionMonitor] Registered position: ${userAddress.slice(0, 10)}... on ${protocol}/${chain}`);

        return key;
    }

    /**
     * Unregister a position
     */
    unregisterPosition(userAddress: string, protocol: string, chain: string): boolean {
        const key = this.getPositionKey(userAddress, protocol, chain);
        return this.positions.delete(key);
    }

    /**
     * Update protection settings
     */
    updateSettings(
        userAddress: string,
        protocol: string,
        chain: string,
        settings: {
            alertThreshold?: number;
            autoProtectThreshold?: number;
            autoProtectEnabled?: boolean;
        }
    ): boolean {
        const key = this.getPositionKey(userAddress, protocol, chain);
        const position = this.positions.get(key);

        if (!position) return false;

        if (settings.alertThreshold !== undefined) {
            position.alertThreshold = settings.alertThreshold;
        }
        if (settings.autoProtectThreshold !== undefined) {
            position.autoProtectThreshold = settings.autoProtectThreshold;
        }
        if (settings.autoProtectEnabled !== undefined) {
            position.autoProtectEnabled = settings.autoProtectEnabled;
        }

        this.positions.set(key, position);
        return true;
    }

    /**
     * Get all monitored positions
     */
    getMonitoredPositions(): MonitoredPosition[] {
        return Array.from(this.positions.values());
    }

    private getPositionKey(userAddress: string, protocol: string, chain: string): string {
        return `${protocol}-${chain}-${userAddress.toLowerCase()}`;
    }

    // ========================================================================
    // MONITORING LOOP
    // ========================================================================

    /**
     * Main tick function - uses recursive setTimeout
     */
    private async tick(): Promise<void> {
        if (!this.isRunning) return;

        try {
            await this.evaluateAllPositions();
        } catch (error) {
            this.stats.errorsEncountered++;
            console.error('[ProtectionMonitor] Tick error:', error);
        } finally {
            // Schedule next tick (recursive setTimeout for drift-free scheduling)
            if (this.isRunning) {
                this.timeout = setTimeout(() => this.tick(), this.config.intervalMs);
            }
        }
    }

    /**
     * Evaluate all monitored positions
     */
    private async evaluateAllPositions(): Promise<void> {
        if (this.positions.size === 0) return;
        if (this.circuitBreaker.isOpen()) {
            console.log('[ProtectionMonitor] Circuit breaker open, skipping evaluation');
            return;
        }

        const positionsList = Array.from(this.positions.entries());

        // Process in batches to respect rate limits
        const batchSize = this.config.maxConcurrentChecks;

        for (let i = 0; i < positionsList.length; i += batchSize) {
            const batch = positionsList.slice(i, i + batchSize);

            await Promise.all(
                batch.map(([key, position]) => this.evaluatePosition(key, position))
            );
        }
    }

    /**
     * Evaluate a single position
     */
    private async evaluatePosition(key: string, position: MonitoredPosition): Promise<void> {
        try {
            // Rate limit
            await this.rateLimiter.acquire();

            // Check with circuit breaker
            const health = await this.circuitBreaker.execute(async () => {
                return this.healthMonitor.checkProtocolPosition(
                    position.userAddress,
                    position.protocol,
                    position.chain
                );
            });

            if (!health) return;

            // Update position state
            position.lastHealth = health;
            position.lastChecked = Date.now();
            this.positions.set(key, position);
            this.stats.checksCompleted++;

            // Evaluate risk and trigger alerts/actions
            await this.evaluateRisk(position, health);

        } catch (error) {
            // Don't log every error to avoid spam
            if (this.stats.errorsEncountered % 10 === 0) {
                console.error(`[ProtectionMonitor] Error checking ${key}:`, error);
            }
            this.stats.errorsEncountered++;
        }
    }

    /**
     * Evaluate risk and trigger appropriate actions
     */
    private async evaluateRisk(position: MonitoredPosition, health: PositionHealth): Promise<void> {
        const hf = health.healthFactor;

        // Critical - Auto-protect if enabled
        if (hf < position.autoProtectThreshold && position.autoProtectEnabled) {
            await this.triggerAutoProtect(position, health);
            return;
        }

        // Danger/Critical alert
        if (hf < 1.1) {
            this.sendAlert({
                type: 'critical',
                position,
                health,
                message: `⛔ CRITICAL: Health factor ${hf.toFixed(2)} - Liquidation imminent!`,
            });
            return;
        }

        // Danger alert
        if (hf < 1.2) {
            this.sendAlert({
                type: 'danger',
                position,
                health,
                message: `🔴 DANGER: Health factor ${hf.toFixed(2)} - Take action now!`,
            });
            return;
        }

        // Warning alert (only if below threshold)
        if (hf < position.alertThreshold) {
            this.sendAlert({
                type: 'warning',
                position,
                health,
                message: `🟠 WARNING: Health factor ${hf.toFixed(2)} - Consider deleveraging`,
            });
        }
    }

    // ========================================================================
    // ALERTS
    // ========================================================================

    private sendAlert(params: {
        type: ProtectionAlert['type'];
        position: MonitoredPosition;
        health: PositionHealth;
        message: string;
    }): void {
        const alert: ProtectionAlert = {
            id: `alert_${Date.now()}_${params.position.userAddress.slice(0, 8)}`,
            type: params.type,
            userAddress: params.position.userAddress,
            protocol: params.position.protocol,
            chain: params.position.chain,
            healthFactor: params.health.healthFactor,
            riskLevel: params.health.riskLevel,
            message: params.message,
            timestamp: Date.now(),
            actionRequired: params.type === 'danger' || params.type === 'critical',
        };

        // Update stats
        params.position.alertsSent++;
        this.stats.alertsSent++;

        // Emit event
        this.emit('alert', alert);

        // Call callback if provided
        this.config.onAlert?.(alert);

        // Broadcast via WebSocket - use type assertion for dynamic type
        const eventType = `protection:${alert.type}` as const;
        broadcast({
            type: eventType,
            alert: alert as unknown as Record<string, unknown>,
        } as Parameters<typeof broadcast>[0]);

        console.log(`[ProtectionMonitor] Alert: ${params.message}`);
    }

    private handleHealthAlert(alert: HealthAlert): void {
        // Forward health monitor alerts
        broadcast({
            type: 'protection:alert',
            alert: alert as unknown as Record<string, unknown>,
        });
    }

    // ========================================================================
    // AUTO-PROTECTION
    // ========================================================================

    private async triggerAutoProtect(position: MonitoredPosition, health: PositionHealth): Promise<void> {
        console.log(`[ProtectionMonitor] 🛡️ Auto-protect triggered for ${position.userAddress.slice(0, 10)}...`);

        this.stats.autoProtectTriggered++;

        // Emit event
        this.emit('autoProtect', position, health);

        // Call callback if provided
        this.config.onAutoProtect?.(position, health);

        // Broadcast trigger event
        broadcast({
            type: 'protection:auto_protect_triggered',
            userAddress: position.userAddress,
            protocol: position.protocol,
            chain: position.chain,
            healthFactor: health.healthFactor,
        });

        // Phase 2: Build deleverage strategy using AutoProtector
        try {
            // Dynamic import to avoid circular dependency
            const { getAutoProtector } = await import('../core/autoProtector.js');
            const autoProtector = getAutoProtector();

            // Build the deleverage strategy
            const strategy = await autoProtector.buildDeleverageStrategy(health, 1.5);

            if (strategy.isValid) {
                console.log(`[ProtectionMonitor] ✅ Built deleverage strategy:`);
                console.log(`   Repay: ${strategy.amountToRepayFormatted?.toFixed(4)} ${strategy.assetToRepay}`);
                console.log(`   New HF: ${strategy.estimatedNewHealthFactor.toFixed(2)}`);

                // Perform safety checks
                const safetyResult = await autoProtector.performSafetyChecks(strategy);

                if (safetyResult.safe) {
                    // Generate executor request
                    const executorRequest = autoProtector.generateExecutorRequest(strategy);
                    console.log(`[ProtectionMonitor] 📤 Executor request generated`);

                    // Broadcast prepared transaction
                    broadcast({
                        type: 'protection:action_taken',
                        alert: {
                            type: 'prepared',
                            userAddress: position.userAddress,
                            strategy: {
                                type: strategy.type,
                                assetToRepay: strategy.assetToRepay,
                                amountUSD: strategy.amountToRepayUSD,
                                estimatedNewHF: strategy.estimatedNewHealthFactor,
                            },
                            executorRequest,
                        } as unknown as Record<string, unknown>,
                    } as Parameters<typeof broadcast>[0]);

                    // TODO: Integrate with AutonomyEngine for actual execution
                    // For now, we broadcast for the UI to handle
                } else {
                    console.log(`[ProtectionMonitor] ⚠️ Safety check failed:`, safetyResult.blockers);
                }
            } else {
                console.log(`[ProtectionMonitor] ❌ Could not build strategy:`, strategy.validationErrors);
            }
        } catch (error) {
            console.error(`[ProtectionMonitor] Error building deleverage strategy:`, error);
        }
    }

    // ========================================================================
    // STATS & HEALTH
    // ========================================================================

    getStats(): typeof this.stats & { positionsMonitored: number; isRunning: boolean } {
        return {
            ...this.stats,
            positionsMonitored: this.positions.size,
            isRunning: this.isRunning,
        };
    }

    isActive(): boolean {
        return this.isRunning;
    }
}

// ============================================================================
// SINGLETON
// ============================================================================

let monitorInstance: ProtectionMonitor | null = null;

export function getProtectionMonitor(config?: Partial<MonitorConfig>): ProtectionMonitor {
    if (!monitorInstance) {
        monitorInstance = new ProtectionMonitor(config);
    }
    return monitorInstance;
}

// ============================================================================
// GRACEFUL SHUTDOWN HANDLERS
// ============================================================================

export function setupGracefulShutdown(): void {
    const shutdown = () => {
        console.log('\n[ProtectionMonitor] Graceful shutdown initiated...');
        if (monitorInstance) {
            monitorInstance.stop();
        }
    };

    process.on('SIGTERM', shutdown);
    process.on('SIGINT', shutdown);
}
