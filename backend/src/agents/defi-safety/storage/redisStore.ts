/**
 * Redis Store for DeFi Safety Agent
 * 
 * PRODUCTION REQUIREMENT: Persistent storage for:
 * - Analysis result caching (5-min TTL)
 * - Historical trend data (30-day retention)
 * - Dynamic pattern database
 * - Cross-session state
 * 
 * Falls back to in-memory storage if Redis unavailable.
 * 
 * NOTE: ioredis is an optional dependency. Install with: npm install ioredis
 */

import { SafetyReport } from '../analyzers/riskScorer.js';

// Type for ioredis (optional dependency)
type RedisInstance = {
    get(key: string): Promise<string | null>;
    set(key: string, value: string, mode?: string, duration?: number): Promise<string>;
    zadd(key: string, score: number, member: string): Promise<number>;
    zrange(key: string, start: number, stop: number): Promise<string[]>;
    zremrangebyrank(key: string, start: number, stop: number): Promise<number>;
    hset(key: string, field: string, value: string): Promise<number>;
    hget(key: string, field: string): Promise<string | null>;
    hgetall(key: string): Promise<Record<string, string>>;
    del(key: string): Promise<number>;
    on(event: string, callback: (...args: unknown[]) => void): void;
};

// ============================================================================
// TYPES
// ============================================================================

export interface CachedAnalysis {
    report: SafetyReport;
    timestamp: number;
    ttl: number;
    chain: string;
    tokenAddress: string;
}

export interface HistoricalEntry {
    timestamp: number;
    riskScore: number;
    warnings: string[];
    liquidityUSD: number;
    holdersCount: number;
}

export interface PatternEntry {
    pattern: string;
    type: 'scam' | 'safe' | 'warning';
    confidence: number;
    occurrences: number;
    lastSeen: number;
    metadata?: Record<string, unknown>;
}

// ============================================================================
// REDIS CLIENT WRAPPER
// ============================================================================

class RedisClient {
    private client: RedisInstance | null = null;
    private isConnected = false;
    private connectionPromise: Promise<void> | null = null;
    
    async connect(): Promise<boolean> {
        if (this.isConnected) return true;
        if (this.connectionPromise) {
            await this.connectionPromise;
            return this.isConnected;
        }
        
        const redisUrl = process.env.REDIS_URL;
        if (!redisUrl) {
            console.log('[RedisStore] REDIS_URL not set - using in-memory fallback');
            return false;
        }
        
        this.connectionPromise = this.doConnect(redisUrl);
        await this.connectionPromise;
        return this.isConnected;
    }
    
    private async doConnect(redisUrl: string): Promise<void> {
        try {
            // Dynamic import to avoid requiring Redis if not used
            // ioredis is an optional dependency - install with: npm install ioredis
            let RedisModule: { default: new (url: string, opts: Record<string, unknown>) => RedisInstance };
            try {
                RedisModule = await Function('return import("ioredis")')() as typeof RedisModule;
            } catch {
                console.log('[RedisStore] ioredis not installed - using in-memory fallback');
                console.log('[RedisStore] Install with: npm install ioredis');
                return;
            }
            
            this.client = new RedisModule.default(redisUrl, {
                maxRetriesPerRequest: 3,
                retryStrategy: (times: number) => {
                    if (times > 3) return null;
                    return Math.min(times * 100, 3000);
                },
            });
            
            await new Promise<void>((resolve, reject) => {
                const timeout = setTimeout(() => {
                    reject(new Error('Redis connection timeout'));
                }, 5000);
                
                this.client!.on('ready', () => {
                    clearTimeout(timeout);
                    this.isConnected = true;
                    console.log('[RedisStore] Connected to Redis');
                    resolve();
                });
                
                this.client!.on('error', (err: unknown) => {
                    clearTimeout(timeout);
                    console.warn('[RedisStore] Redis error:', err);
                    reject(err);
                });
            });
        } catch (err) {
            console.warn('[RedisStore] Failed to connect to Redis:', err);
            this.isConnected = false;
        }
    }
    
    async get(key: string): Promise<string | null> {
        if (!this.isConnected || !this.client) return null;
        try {
            return await this.client.get(key);
        } catch {
            return null;
        }
    }
    
    async set(key: string, value: string, ttlSeconds?: number): Promise<boolean> {
        if (!this.isConnected || !this.client) return false;
        try {
            if (ttlSeconds) {
                await this.client.set(key, value, 'EX', ttlSeconds);
            } else {
                await this.client.set(key, value);
            }
            return true;
        } catch {
            return false;
        }
    }
    
    async zadd(key: string, score: number, member: string): Promise<boolean> {
        if (!this.isConnected || !this.client) return false;
        try {
            await this.client.zadd(key, score, member);
            return true;
        } catch {
            return false;
        }
    }
    
    async zrange(key: string, start: number, stop: number): Promise<string[]> {
        if (!this.isConnected || !this.client) return [];
        try {
            return await this.client.zrange(key, start, stop);
        } catch {
            return [];
        }
    }
    
    async zremrangebyrank(key: string, start: number, stop: number): Promise<boolean> {
        if (!this.isConnected || !this.client) return false;
        try {
            await this.client.zremrangebyrank(key, start, stop);
            return true;
        } catch {
            return false;
        }
    }
    
    async hset(key: string, field: string, value: string): Promise<boolean> {
        if (!this.isConnected || !this.client) return false;
        try {
            await this.client.hset(key, field, value);
            return true;
        } catch {
            return false;
        }
    }
    
    async hget(key: string, field: string): Promise<string | null> {
        if (!this.isConnected || !this.client) return null;
        try {
            return await this.client.hget(key, field);
        } catch {
            return null;
        }
    }
    
    async hgetall(key: string): Promise<Record<string, string>> {
        if (!this.isConnected || !this.client) return {};
        try {
            return await this.client.hgetall(key) || {};
        } catch {
            return {};
        }
    }
    
    async del(key: string): Promise<boolean> {
        if (!this.isConnected || !this.client) return false;
        try {
            await this.client.del(key);
            return true;
        } catch {
            return false;
        }
    }
    
    get connected(): boolean {
        return this.isConnected;
    }
}

// ============================================================================
// ANALYSIS STORE
// ============================================================================

export class AnalysisStore {
    private redis = new RedisClient();
    private memoryCache = new Map<string, CachedAnalysis>();
    private memoryHistory = new Map<string, HistoricalEntry[]>();
    private initialized = false;
    
    private readonly CACHE_TTL = 300; // 5 minutes
    private readonly HISTORY_RETENTION = 30 * 24 * 60 * 60; // 30 days
    private readonly MAX_HISTORY_ENTRIES = 100;
    
    async init(): Promise<void> {
        if (this.initialized) return;
        await this.redis.connect();
        this.initialized = true;
    }
    
    /**
     * Save analysis result with caching
     */
    async saveAnalysis(chain: string, tokenAddress: string, report: SafetyReport): Promise<void> {
        await this.init();
        
        const key = this.getCacheKey(chain, tokenAddress);
        const cached: CachedAnalysis = {
            report,
            timestamp: Date.now(),
            ttl: this.CACHE_TTL,
            chain,
            tokenAddress,
        };
        
        // Save to Redis
        const saved = await this.redis.set(
            key,
            JSON.stringify(cached),
            this.CACHE_TTL
        );
        
        // Always save to memory as fallback
        this.memoryCache.set(key, cached);
        
        // Save to history
        await this.addToHistory(chain, tokenAddress, report);
        
        console.log(`[AnalysisStore] Saved analysis (Redis: ${saved ? 'yes' : 'no'})`);
    }
    
    /**
     * Get cached analysis if fresh
     */
    async getAnalysis(chain: string, tokenAddress: string): Promise<CachedAnalysis | null> {
        await this.init();
        
        const key = this.getCacheKey(chain, tokenAddress);
        
        // Try Redis first
        const redisData = await this.redis.get(key);
        if (redisData) {
            try {
                const cached = JSON.parse(redisData) as CachedAnalysis;
                if (this.isFresh(cached)) {
                    return cached;
                }
            } catch {}
        }
        
        // Fallback to memory
        const memCached = this.memoryCache.get(key);
        if (memCached && this.isFresh(memCached)) {
            return memCached;
        }
        
        return null;
    }
    
    /**
     * Add entry to historical trend data
     */
    private async addToHistory(chain: string, tokenAddress: string, report: SafetyReport): Promise<void> {
        const historyKey = this.getHistoryKey(chain, tokenAddress);
        const entry: HistoricalEntry = {
            timestamp: Date.now(),
            riskScore: report.overallRisk,
            warnings: report.warnings || [],
            liquidityUSD: report.liquidity?.liquidityUSD || 0,
            holdersCount: report.holders?.topHolders?.length || 0,
        };
        
        // Save to Redis sorted set
        await this.redis.zadd(historyKey, entry.timestamp, JSON.stringify(entry));
        
        // Trim to max entries
        await this.redis.zremrangebyrank(historyKey, 0, -this.MAX_HISTORY_ENTRIES - 1);
        
        // Memory fallback
        const memHistory = this.memoryHistory.get(historyKey) || [];
        memHistory.push(entry);
        if (memHistory.length > this.MAX_HISTORY_ENTRIES) {
            memHistory.shift();
        }
        this.memoryHistory.set(historyKey, memHistory);
    }
    
    /**
     * Get historical trend data
     */
    async getHistory(chain: string, tokenAddress: string): Promise<HistoricalEntry[]> {
        await this.init();
        
        const historyKey = this.getHistoryKey(chain, tokenAddress);
        
        // Try Redis
        const redisHistory = await this.redis.zrange(historyKey, 0, -1);
        if (redisHistory.length > 0) {
            return redisHistory.map(h => {
                try {
                    return JSON.parse(h) as HistoricalEntry;
                } catch {
                    return null;
                }
            }).filter((h): h is HistoricalEntry => h !== null);
        }
        
        // Memory fallback
        return this.memoryHistory.get(historyKey) || [];
    }
    
    /**
     * Check if cached analysis is still fresh
     */
    private isFresh(cached: CachedAnalysis): boolean {
        const age = (Date.now() - cached.timestamp) / 1000;
        return age < cached.ttl;
    }
    
    /**
     * Get cache key for analysis
     */
    private getCacheKey(chain: string, tokenAddress: string): string {
        return `defi:analysis:${chain}:${tokenAddress.toLowerCase()}`;
    }
    
    /**
     * Get history key
     */
    private getHistoryKey(chain: string, tokenAddress: string): string {
        return `defi:history:${chain}:${tokenAddress.toLowerCase()}`;
    }
    
    /**
     * Clear cache for a token
     */
    async clearCache(chain: string, tokenAddress: string): Promise<void> {
        const key = this.getCacheKey(chain, tokenAddress);
        await this.redis.del(key);
        this.memoryCache.delete(key);
    }
    
    /**
     * Get cache stats
     */
    getStats(): { redisConnected: boolean; memoryCacheSize: number; memoryHistorySize: number } {
        return {
            redisConnected: this.redis.connected,
            memoryCacheSize: this.memoryCache.size,
            memoryHistorySize: this.memoryHistory.size,
        };
    }
}

// ============================================================================
// PATTERN STORE
// ============================================================================

export class PatternStore {
    private redis = new RedisClient();
    private memoryPatterns = new Map<string, PatternEntry>();
    private initialized = false;
    
    private readonly PATTERN_KEY = 'defi:patterns';
    
    async init(): Promise<void> {
        if (this.initialized) return;
        await this.redis.connect();
        this.initialized = true;
    }
    
    /**
     * Add or update a pattern
     */
    async addPattern(pattern: string, entry: Omit<PatternEntry, 'pattern'>): Promise<void> {
        await this.init();
        
        const fullEntry: PatternEntry = { pattern, ...entry };
        
        // Save to Redis
        await this.redis.hset(this.PATTERN_KEY, pattern, JSON.stringify(fullEntry));
        
        // Memory fallback
        this.memoryPatterns.set(pattern, fullEntry);
    }
    
    /**
     * Get a pattern
     */
    async getPattern(pattern: string): Promise<PatternEntry | null> {
        await this.init();
        
        // Try Redis
        const redisData = await this.redis.hget(this.PATTERN_KEY, pattern);
        if (redisData) {
            try {
                return JSON.parse(redisData) as PatternEntry;
            } catch {}
        }
        
        // Memory fallback
        return this.memoryPatterns.get(pattern) || null;
    }
    
    /**
     * Get all patterns
     */
    async getAllPatterns(): Promise<PatternEntry[]> {
        await this.init();
        
        // Try Redis
        const redisData = await this.redis.hgetall(this.PATTERN_KEY);
        if (Object.keys(redisData).length > 0) {
            return Object.values(redisData).map(v => {
                try {
                    return JSON.parse(v) as PatternEntry;
                } catch {
                    return null;
                }
            }).filter((p): p is PatternEntry => p !== null);
        }
        
        // Memory fallback
        return Array.from(this.memoryPatterns.values());
    }
    
    /**
     * Get patterns by type
     */
    async getPatternsByType(type: PatternEntry['type']): Promise<PatternEntry[]> {
        const all = await this.getAllPatterns();
        return all.filter(p => p.type === type);
    }
    
    /**
     * Increment pattern occurrence
     */
    async incrementPattern(pattern: string): Promise<void> {
        const existing = await this.getPattern(pattern);
        if (existing) {
            existing.occurrences++;
            existing.lastSeen = Date.now();
            await this.addPattern(pattern, existing);
        }
    }
}

// ============================================================================
// SINGLETON FACTORIES
// ============================================================================

let analysisStoreInstance: AnalysisStore | null = null;
let patternStoreInstance: PatternStore | null = null;

export function getAnalysisStore(): AnalysisStore {
    if (!analysisStoreInstance) {
        analysisStoreInstance = new AnalysisStore();
    }
    return analysisStoreInstance;
}

export function getPatternStore(): PatternStore {
    if (!patternStoreInstance) {
        patternStoreInstance = new PatternStore();
    }
    return patternStoreInstance;
}

export default { getAnalysisStore, getPatternStore };
