/**
 * Social Sentiment Analyzer
 * 
 * PHASE 2: Analyzes social signals for token safety assessment
 * - Twitter/X mentions and sentiment
 * - Telegram group activity
 * - Bot detection
 * - Coordinated pump detection
 * 
 * NOTE: Requires API keys for full functionality:
 * - TWITTER_BEARER_TOKEN for Twitter API v2
 * - TELEGRAM_BOT_TOKEN for Telegram Bot API
 */

// ============================================================================
// TYPES
// ============================================================================

export interface SocialSentiment {
    overallScore: number;     // -100 (very negative) to +100 (very positive)
    confidence: number;       // 0-100 confidence in the score
    dataAvailable: boolean;   // Whether social data was found
    
    twitter: TwitterSentiment | null;
    telegram: TelegramSentiment | null;
    
    overall: {
        isSuspicious: boolean;
        redFlags: string[];
        positiveSignals: string[];
        riskContribution: number; // 0-100 additional risk from social
    };
}

export interface TwitterSentiment {
    mentions24h: number;
    mentions7d: number;
    sentimentScore: number;   // -100 to +100
    
    influencerMentions: {
        handle: string;
        followers: number;
        sentiment: 'positive' | 'neutral' | 'negative';
    }[];
    
    botActivityPercent: number;  // Estimated % of bot accounts
    
    trendingStatus: 'not_trending' | 'rising' | 'trending' | 'viral';
    
    warnings: string[];
}

export interface TelegramSentiment {
    groupFound: boolean;
    groupName?: string;
    groupSize?: number;
    activeUsers24h?: number;
    messageVolume24h?: number;
    
    suspiciousActivity: boolean;
    warnings: string[];
}

export interface SocialSearchResult {
    platform: 'twitter' | 'telegram' | 'discord';
    found: boolean;
    url?: string;
    data?: any;
}

// ============================================================================
// SENTIMENT ANALYZER
// ============================================================================

export class SentimentAnalyzer {
    private twitterBearerToken: string | null;
    private telegramBotToken: string | null;
    
    constructor() {
        this.twitterBearerToken = process.env.TWITTER_BEARER_TOKEN || null;
        this.telegramBotToken = process.env.TELEGRAM_BOT_TOKEN || null;
        
        if (!this.twitterBearerToken) {
            console.warn('[SentimentAnalyzer] TWITTER_BEARER_TOKEN not set - Twitter analysis disabled');
        }
        if (!this.telegramBotToken) {
            console.warn('[SentimentAnalyzer] TELEGRAM_BOT_TOKEN not set - Telegram analysis disabled');
        }
    }
    
    /**
     * Analyze social sentiment for a token
     */
    async analyzeSentiment(
        tokenAddress: string,
        tokenName?: string,
        tokenSymbol?: string
    ): Promise<SocialSentiment> {
        console.log(`[SentimentAnalyzer] Analyzing sentiment for ${tokenSymbol || tokenAddress.slice(0, 10)}...`);
        
        const result: SocialSentiment = {
            overallScore: 0,
            confidence: 0,
            dataAvailable: false,
            twitter: null,
            telegram: null,
            overall: {
                isSuspicious: false,
                redFlags: [],
                positiveSignals: [],
                riskContribution: 0,
            },
        };
        
        // Build search queries
        const searchQueries = this.buildSearchQueries(tokenAddress, tokenName, tokenSymbol);
        
        // Analyze Twitter (if API key available)
        if (this.twitterBearerToken && searchQueries.length > 0) {
            try {
                result.twitter = await this.analyzeTwitter(searchQueries);
                result.dataAvailable = true;
            } catch (error) {
                console.warn('[SentimentAnalyzer] Twitter analysis failed:', error);
            }
        }
        
        // Analyze Telegram (if bot token available)
        if (this.telegramBotToken && tokenSymbol) {
            try {
                result.telegram = await this.analyzeTelegram(tokenSymbol);
                result.dataAvailable = true;
            } catch (error) {
                console.warn('[SentimentAnalyzer] Telegram analysis failed:', error);
            }
        }
        
        // Calculate overall score and risk
        this.calculateOverallSentiment(result);
        
        return result;
    }
    
    /**
     * Build search queries for social platforms
     */
    private buildSearchQueries(
        tokenAddress: string,
        tokenName?: string,
        tokenSymbol?: string
    ): string[] {
        const queries: string[] = [];
        
        // Contract address (most reliable)
        queries.push(tokenAddress);
        
        // Token symbol with $ prefix (common for crypto)
        if (tokenSymbol) {
            queries.push(`$${tokenSymbol}`);
            queries.push(tokenSymbol);
        }
        
        // Token name
        if (tokenName && tokenName.length > 2) {
            queries.push(tokenName);
        }
        
        return queries;
    }
    
    /**
     * Analyze Twitter sentiment
     */
    private async analyzeTwitter(queries: string[]): Promise<TwitterSentiment> {
        // TODO: Implement Twitter API v2 integration
        // This is a placeholder structure for future implementation
        
        const result: TwitterSentiment = {
            mentions24h: 0,
            mentions7d: 0,
            sentimentScore: 0,
            influencerMentions: [],
            botActivityPercent: 0,
            trendingStatus: 'not_trending',
            warnings: [],
        };
        
        if (!this.twitterBearerToken) {
            result.warnings.push('Twitter API not configured');
            return result;
        }
        
        try {
            // Twitter API v2 search endpoint
            const query = queries.slice(0, 3).join(' OR ');
            const url = `https://api.twitter.com/2/tweets/search/recent?query=${encodeURIComponent(query)}&max_results=100&tweet.fields=created_at,public_metrics,author_id`;
            
            const response = await fetch(url, {
                headers: {
                    'Authorization': `Bearer ${this.twitterBearerToken}`,
                },
            });
            
            if (!response.ok) {
                if (response.status === 429) {
                    result.warnings.push('Twitter API rate limited');
                } else {
                    result.warnings.push(`Twitter API error: ${response.status}`);
                }
                return result;
            }
            
            const data = await response.json();
            const tweets = data.data || [];
            
            // Basic metrics
            result.mentions24h = tweets.length;
            result.mentions7d = tweets.length; // Would need separate query for 7d
            
            // Simple sentiment analysis (placeholder)
            // In production, use NLP or sentiment API
            let positiveCount = 0;
            let negativeCount = 0;
            
            const positiveWords = ['moon', 'gem', 'bullish', 'buy', 'pump', 'rocket', '🚀', '💎', 'lfg'];
            const negativeWords = ['scam', 'rug', 'honeypot', 'fake', 'avoid', 'dump', 'dead', '⚠️', '🚨'];
            
            for (const tweet of tweets) {
                const text = (tweet.text || '').toLowerCase();
                
                if (positiveWords.some(w => text.includes(w))) positiveCount++;
                if (negativeWords.some(w => text.includes(w))) negativeCount++;
            }
            
            const total = positiveCount + negativeCount;
            if (total > 0) {
                result.sentimentScore = Math.round(((positiveCount - negativeCount) / total) * 100);
            }
            
            // Detect suspicious patterns
            if (result.mentions24h > 500 && result.sentimentScore > 80) {
                result.warnings.push('Unusually high positive mentions - possible coordinated pump');
            }
            
            // Bot detection (simplified)
            // In production, analyze account age, follower ratios, post patterns
            const suspiciousPatterns = tweets.filter((t: any) => 
                (t.text || '').match(/\b(airdrop|presale|whitelist)\b/i)
            );
            result.botActivityPercent = Math.min(100, (suspiciousPatterns.length / Math.max(1, tweets.length)) * 100);
            
            if (result.botActivityPercent > 30) {
                result.warnings.push(`High bot activity detected: ${result.botActivityPercent.toFixed(0)}%`);
            }
            
            // Trending status
            if (result.mentions24h > 1000) {
                result.trendingStatus = 'viral';
            } else if (result.mentions24h > 200) {
                result.trendingStatus = 'trending';
            } else if (result.mentions24h > 50) {
                result.trendingStatus = 'rising';
            }
            
        } catch (error) {
            result.warnings.push(`Twitter analysis error: ${error}`);
        }
        
        return result;
    }
    
    /**
     * Analyze Telegram sentiment
     */
    private async analyzeTelegram(tokenSymbol: string): Promise<TelegramSentiment> {
        // TODO: Implement Telegram Bot API integration
        // This is a placeholder structure for future implementation
        
        const result: TelegramSentiment = {
            groupFound: false,
            suspiciousActivity: false,
            warnings: [],
        };
        
        if (!this.telegramBotToken) {
            result.warnings.push('Telegram Bot API not configured');
            return result;
        }
        
        // Telegram doesn't have a search API for public groups
        // Would need to use third-party services or manual tracking
        result.warnings.push('Telegram group search requires manual configuration');
        
        return result;
    }
    
    /**
     * Calculate overall sentiment and risk contribution
     */
    private calculateOverallSentiment(result: SocialSentiment): void {
        let totalScore = 0;
        let dataPoints = 0;
        
        // Twitter contribution
        if (result.twitter) {
            totalScore += result.twitter.sentimentScore;
            dataPoints++;
            
            // Add red flags
            result.overall.redFlags.push(...result.twitter.warnings);
            
            if (result.twitter.botActivityPercent > 30) {
                result.overall.isSuspicious = true;
            }
            
            // Positive signals
            if (result.twitter.mentions24h > 100 && result.twitter.sentimentScore > 50) {
                result.overall.positiveSignals.push('Strong positive Twitter engagement');
            }
            
            if (result.twitter.influencerMentions.length > 0) {
                result.overall.positiveSignals.push(`${result.twitter.influencerMentions.length} influencer mentions`);
            }
        }
        
        // Telegram contribution
        if (result.telegram) {
            if (result.telegram.groupFound && result.telegram.groupSize) {
                if (result.telegram.groupSize > 5000) {
                    totalScore += 20;
                    result.overall.positiveSignals.push('Large Telegram community');
                } else if (result.telegram.groupSize > 1000) {
                    totalScore += 10;
                }
                dataPoints++;
            }
            
            if (result.telegram.suspiciousActivity) {
                result.overall.isSuspicious = true;
                result.overall.redFlags.push('Suspicious Telegram activity detected');
            }
        }
        
        // Calculate overall score
        if (dataPoints > 0) {
            result.overallScore = Math.round(totalScore / dataPoints);
            result.confidence = Math.min(100, dataPoints * 40); // More data = higher confidence
        }
        
        // Calculate risk contribution
        if (result.overall.isSuspicious) {
            result.overall.riskContribution = 15;
        } else if (result.overallScore < -30) {
            result.overall.riskContribution = 10;
        } else if (result.overallScore < 0) {
            result.overall.riskContribution = 5;
        } else {
            result.overall.riskContribution = 0;
        }
    }
    
    /**
     * Check if social analysis is available
     */
    isAvailable(): boolean {
        return !!(this.twitterBearerToken || this.telegramBotToken);
    }
    
    /**
     * Get configuration status
     */
    getStatus(): { twitter: boolean; telegram: boolean } {
        return {
            twitter: !!this.twitterBearerToken,
            telegram: !!this.telegramBotToken,
        };
    }
}

// ============================================================================
// SINGLETON FACTORY
// ============================================================================

let sentimentAnalyzerInstance: SentimentAnalyzer | null = null;

export function getSentimentAnalyzer(): SentimentAnalyzer {
    if (!sentimentAnalyzerInstance) {
        sentimentAnalyzerInstance = new SentimentAnalyzer();
    }
    return sentimentAnalyzerInstance;
}

export default SentimentAnalyzer;
