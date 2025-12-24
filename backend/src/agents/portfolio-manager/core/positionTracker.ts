/**
 * Position Tracker
 * 
 * Discovers and tracks all positions for a wallet:
 * - ERC20 token balances
 * - LP positions (Uniswap V2, Aerodrome, SushiSwap)
 * - Lending positions (Aave, Compound)
 * - Staking positions (Lido, Coinbase, Rocket Pool)
 */

import { ethers, Contract } from 'ethers';
import { getRPCManager } from '../../onchain/core/rpc.js';
import { getPriceOracle } from './priceOracle.js';
import { 
    TokenPosition, 
    LPPosition, 
    LendingPosition, 
    StakingPosition,
    Portfolio,
} from '../types.js';
import {
    CHAIN_CONFIG,
    KNOWN_TOKENS,
    getDexConfigsForChain,
    getLendingConfigsForChain,
    getStakingConfigsForChain,
    getKnownToken,
    KnownToken,
} from '../data/protocols.js';
import {
    ERC20_ABI,
    UNISWAP_V2_PAIR_ABI,
    UNISWAP_V2_FACTORY_ABI,
    AERODROME_POOL_ABI,
    AERODROME_FACTORY_ABI,
    AAVE_V3_POOL_ABI,
    AAVE_V3_DATA_PROVIDER_ABI,
    COMPOUND_V3_ABI,
    TRANSFER_EVENT_TOPIC,
} from '../data/abis.js';

// ============================================================================
// POSITION TRACKER
// ============================================================================

export class PositionTracker {
    private rpc = getRPCManager();
    private priceOracle = getPriceOracle();
    
    /**
     * Get complete portfolio for a wallet
     */
    async getPortfolio(wallet: string, chains: string[]): Promise<Portfolio> {
        console.log(`[PositionTracker] Building portfolio for ${wallet.slice(0, 10)}...`);
        
        const timestamp = Date.now();
        const blockNumbers: Record<string, number> = {};
        
        // Get block numbers
        for (const chain of chains) {
            try {
                blockNumbers[chain] = await this.rpc.getBlockNumber(chain);
            } catch (error) {
                console.log(`[PositionTracker] Failed to get block for ${chain}`);
            }
        }
        
        // Fetch all position types in parallel
        const [tokenPositions, lpPositions, lendingPositions, stakingPositions] = await Promise.all([
            this.getTokenPositions(wallet, chains),
            this.getLPPositions(wallet, chains),
            this.getLendingPositions(wallet, chains),
            this.getStakingPositions(wallet, chains),
        ]);
        
        // Calculate aggregates
        const tokenValue = tokenPositions.reduce((sum, p) => sum + p.valueUSD, 0);
        const lpValue = lpPositions.reduce((sum, p) => sum + p.totalValueUSD, 0);
        const lendingValue = lendingPositions
            .filter(p => p.positionType === 'supply')
            .reduce((sum, p) => sum + p.valueUSD, 0);
        const stakingValue = stakingPositions.reduce((sum, p) => sum + p.currentValueUSD, 0);
        
        const totalValueUSD = tokenValue + lpValue + lendingValue + stakingValue;
        
        // Value by chain
        const valueByChain: Record<string, number> = {};
        for (const chain of chains) {
            valueByChain[chain] = 
                tokenPositions.filter(p => p.chain === chain).reduce((s, p) => s + p.valueUSD, 0) +
                lpPositions.filter(p => p.chain === chain).reduce((s, p) => s + p.totalValueUSD, 0) +
                lendingPositions.filter(p => p.chain === chain && p.positionType === 'supply').reduce((s, p) => s + p.valueUSD, 0) +
                stakingPositions.filter(p => p.chain === chain).reduce((s, p) => s + p.currentValueUSD, 0);
        }
        
        // Total gas spent
        const totalGasSpentUSD = tokenPositions.reduce((sum, p) => sum + p.totalGasSpentUSD, 0);
        
        return {
            wallet,
            chains,
            timestamp,
            blockNumbers,
            tokenPositions,
            lpPositions,
            lendingPositions,
            stakingPositions,
            totalValueUSD,
            totalCostBasisUSD: null, // Calculated separately
            totalGasSpentUSD,
            unrealizedPnLUSD: null, // Calculated separately
            valueByChain,
            valueByType: {
                tokens: tokenValue,
                lp: lpValue,
                lending: lendingValue,
                staking: stakingValue,
            },
        };
    }
    
    /**
     * Get ERC20 token positions
     */
    async getTokenPositions(wallet: string, chains: string[]): Promise<TokenPosition[]> {
        const positions: TokenPosition[] = [];
        
        for (const chain of chains) {
            console.log(`[PositionTracker] Scanning tokens on ${chain}...`);
            
            // Get native balance first
            try {
                const nativeBalance = await this.rpc.getBalance(chain, wallet);
                if (nativeBalance > 0n) {
                    const ethPrice = await this.priceOracle.getETHPriceUSD(chain);
                    const balanceFormatted = Number(ethers.formatEther(nativeBalance));
                    
                    positions.push({
                        chain,
                        tokenAddress: '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE', // Native token placeholder
                        symbol: 'ETH',
                        name: 'Ether',
                        decimals: 18,
                        balance: nativeBalance,
                        balanceFormatted,
                        priceUSD: ethPrice,
                        valueUSD: balanceFormatted * ethPrice,
                        costBasisUSD: null,
                        avgEntryPrice: null,
                        unrealizedPnLUSD: null,
                        unrealizedPnLPercent: null,
                        totalGasSpentUSD: 0,
                        transactionCount: 0,
                    });
                }
            } catch (error) {
                console.log(`[PositionTracker] Failed to get native balance on ${chain}`);
            }
            
            // Check known tokens
            const knownTokens = KNOWN_TOKENS[chain] || [];
            const tokenPositionsForChain = await this.checkTokenBalances(wallet, chain, knownTokens);
            positions.push(...tokenPositionsForChain);
            
            // Discover tokens from transfer events (recent activity)
            const discoveredTokens = await this.discoverTokensFromTransfers(wallet, chain);
            
            // Check discovered tokens that aren't in known list
            const newTokens = discoveredTokens.filter(
                addr => !knownTokens.some(kt => kt.address.toLowerCase() === addr.toLowerCase())
            );
            
            if (newTokens.length > 0) {
                const discoveredPositions = await this.checkTokenAddresses(wallet, chain, newTokens);
                positions.push(...discoveredPositions);
            }
        }
        
        // Filter out zero balances and sort by value
        return positions
            .filter(p => p.valueUSD > 0.01) // Filter dust
            .sort((a, b) => b.valueUSD - a.valueUSD);
    }
    
    /**
     * Check balances for known tokens
     */
    private async checkTokenBalances(
        wallet: string, 
        chain: string, 
        tokens: KnownToken[]
    ): Promise<TokenPosition[]> {
        const positions: TokenPosition[] = [];
        const provider = this.rpc.getProvider(chain);
        
        for (const token of tokens) {
            try {
                const contract = new Contract(token.address, ERC20_ABI, provider);
                const balance: bigint = await contract.balanceOf(wallet);
                
                if (balance > 0n) {
                    const balanceFormatted = Number(ethers.formatUnits(balance, token.decimals));
                    const price = await this.priceOracle.getTokenPriceUSD(chain, token.address);
                    
                    positions.push({
                        chain,
                        tokenAddress: token.address,
                        symbol: token.symbol,
                        name: token.name,
                        decimals: token.decimals,
                        balance,
                        balanceFormatted,
                        priceUSD: price.priceUSD,
                        valueUSD: balanceFormatted * price.priceUSD,
                        costBasisUSD: null,
                        avgEntryPrice: null,
                        unrealizedPnLUSD: null,
                        unrealizedPnLPercent: null,
                        totalGasSpentUSD: 0,
                        transactionCount: 0,
                    });
                }
            } catch (error) {
                // Skip tokens that fail
                continue;
            }
        }
        
        return positions;
    }
    
    /**
     * Check balances for discovered token addresses
     */
    private async checkTokenAddresses(
        wallet: string,
        chain: string,
        addresses: string[]
    ): Promise<TokenPosition[]> {
        const positions: TokenPosition[] = [];
        const provider = this.rpc.getProvider(chain);
        
        for (const address of addresses) {
            try {
                const contract = new Contract(address, ERC20_ABI, provider);
                
                const [balance, symbol, name, decimals] = await Promise.all([
                    contract.balanceOf(wallet),
                    contract.symbol().catch(() => 'UNKNOWN'),
                    contract.name().catch(() => 'Unknown Token'),
                    contract.decimals().catch(() => 18),
                ]);
                
                if (balance > 0n) {
                    const balanceFormatted = Number(ethers.formatUnits(balance, decimals));
                    const price = await this.priceOracle.getTokenPriceUSD(chain, address);
                    
                    positions.push({
                        chain,
                        tokenAddress: address,
                        symbol,
                        name,
                        decimals,
                        balance,
                        balanceFormatted,
                        priceUSD: price.priceUSD,
                        valueUSD: balanceFormatted * price.priceUSD,
                        costBasisUSD: null,
                        avgEntryPrice: null,
                        unrealizedPnLUSD: null,
                        unrealizedPnLPercent: null,
                        totalGasSpentUSD: 0,
                        transactionCount: 0,
                    });
                }
            } catch (error) {
                continue;
            }
        }
        
        return positions;
    }
    
    /**
     * Discover tokens from recent transfer events
     */
    private async discoverTokensFromTransfers(
        wallet: string,
        chain: string
    ): Promise<string[]> {
        try {
            const provider = this.rpc.getProvider(chain);
            const currentBlock = await provider.getBlockNumber();
            const blocksToScan = 5000; // ~2.75 hours on Base (within RPC limits)
            const fromBlock = Math.max(0, currentBlock - blocksToScan);
            
            // Get Transfer events TO this wallet
            const toFilter = {
                topics: [
                    TRANSFER_EVENT_TOPIC,
                    null,
                    ethers.zeroPadValue(wallet.toLowerCase(), 32),
                ],
                fromBlock,
                toBlock: currentBlock,
            };
            
            const logs = await provider.getLogs(toFilter);
            
            // Extract unique token addresses
            const tokenAddresses = new Set<string>();
            for (const log of logs) {
                tokenAddresses.add(log.address.toLowerCase());
            }
            
            return Array.from(tokenAddresses);
        } catch (error) {
            console.log(`[PositionTracker] Failed to discover tokens from transfers: ${error}`);
            return [];
        }
    }
    
    /**
     * Get LP positions
     */
    async getLPPositions(wallet: string, chains: string[]): Promise<LPPosition[]> {
        const positions: LPPosition[] = [];
        
        for (const chain of chains) {
            console.log(`[PositionTracker] Scanning LP positions on ${chain}...`);
            
            const dexConfigs = getDexConfigsForChain(chain);
            
            for (const dex of dexConfigs) {
                try {
                    const lpPositions = await this.scanDexForLPPositions(wallet, chain, dex);
                    positions.push(...lpPositions);
                } catch (error) {
                    console.log(`[PositionTracker] Failed to scan ${dex.name}: ${error}`);
                }
            }
        }
        
        return positions.sort((a, b) => b.totalValueUSD - a.totalValueUSD);
    }
    
    /**
     * Scan a DEX for LP positions
     */
    private async scanDexForLPPositions(
        wallet: string,
        chain: string,
        dex: { name: string; type: string; factory: string; weth: string }
    ): Promise<LPPosition[]> {
        const positions: LPPosition[] = [];
        const provider = this.rpc.getProvider(chain);
        
        // Get list of pairs from Transfer events (LP tokens received)
        const currentBlock = await provider.getBlockNumber();
        const blocksToScan = 5000; // Stay within RPC limits
        const fromBlock = Math.max(0, currentBlock - blocksToScan);
        
        try {
            const toFilter = {
                topics: [
                    TRANSFER_EVENT_TOPIC,
                    null,
                    ethers.zeroPadValue(wallet.toLowerCase(), 32),
                ],
                fromBlock,
                toBlock: currentBlock,
            };
            
            const logs = await provider.getLogs(toFilter);
            const potentialPairs = new Set<string>();
            
            for (const log of logs) {
                potentialPairs.add(log.address.toLowerCase());
            }
            
            // Check each potential pair
            for (const pairAddress of potentialPairs) {
                try {
                    const lpPosition = await this.checkLPPosition(wallet, chain, pairAddress, dex);
                    if (lpPosition) {
                        positions.push(lpPosition);
                    }
                } catch {
                    // Not a valid LP token
                    continue;
                }
            }
        } catch (error) {
            console.log(`[PositionTracker] Error scanning ${dex.name}: ${error}`);
        }
        
        return positions;
    }
    
    /**
     * Check if address is an LP token and get position
     */
    private async checkLPPosition(
        wallet: string,
        chain: string,
        pairAddress: string,
        dex: { name: string; type: string; factory: string; weth: string }
    ): Promise<LPPosition | null> {
        const provider = this.rpc.getProvider(chain);
        
        try {
            const pairAbi = dex.type === 'aerodrome' ? AERODROME_POOL_ABI : UNISWAP_V2_PAIR_ABI;
            const pair = new Contract(pairAddress, pairAbi, provider);
            
            // Check balance first
            const lpBalance: bigint = await pair.balanceOf(wallet);
            if (lpBalance === 0n) return null;
            
            // Get pair info
            const [token0, token1, totalSupply] = await Promise.all([
                pair.token0(),
                pair.token1(),
                pair.totalSupply(),
            ]);
            
            // Get reserves
            let reserve0: bigint, reserve1: bigint;
            if (dex.type === 'aerodrome') {
                [reserve0, reserve1] = await Promise.all([
                    pair.reserve0(),
                    pair.reserve1(),
                ]);
            } else {
                const reserves = await pair.getReserves();
                reserve0 = reserves[0];
                reserve1 = reserves[1];
            }
            
            // Get token info
            const token0Contract = new Contract(token0, ERC20_ABI, provider);
            const token1Contract = new Contract(token1, ERC20_ABI, provider);
            
            const [symbol0, symbol1, decimals0, decimals1] = await Promise.all([
                token0Contract.symbol().catch(() => 'UNKNOWN'),
                token1Contract.symbol().catch(() => 'UNKNOWN'),
                token0Contract.decimals().catch(() => 18),
                token1Contract.decimals().catch(() => 18),
            ]);
            
            // Calculate share of pool
            const shareOfPool = Number(lpBalance) / Number(totalSupply);
            
            // Calculate underlying amounts
            const token0Amount = Number(ethers.formatUnits(reserve0, decimals0)) * shareOfPool;
            const token1Amount = Number(ethers.formatUnits(reserve1, decimals1)) * shareOfPool;
            
            // Get prices
            const [price0, price1] = await Promise.all([
                this.priceOracle.getTokenPriceUSD(chain, token0),
                this.priceOracle.getTokenPriceUSD(chain, token1),
            ]);
            
            const token0ValueUSD = token0Amount * price0.priceUSD;
            const token1ValueUSD = token1Amount * price1.priceUSD;
            const totalValueUSD = token0ValueUSD + token1ValueUSD;
            
            return {
                chain,
                protocol: dex.name,
                protocolType: dex.type as any,
                pairAddress,
                pairName: `${symbol0}/${symbol1}`,
                lpBalance,
                lpBalanceFormatted: Number(ethers.formatEther(lpBalance)),
                lpTotalSupply: totalSupply,
                shareOfPool,
                token0: {
                    address: token0,
                    symbol: symbol0,
                    decimals: decimals0,
                    amount: token0Amount,
                    valueUSD: token0ValueUSD,
                },
                token1: {
                    address: token1,
                    symbol: symbol1,
                    decimals: decimals1,
                    amount: token1Amount,
                    valueUSD: token1ValueUSD,
                },
                totalValueUSD,
            };
        } catch {
            return null;
        }
    }
    
    /**
     * Get lending positions
     */
    async getLendingPositions(wallet: string, chains: string[]): Promise<LendingPosition[]> {
        const positions: LendingPosition[] = [];
        
        for (const chain of chains) {
            console.log(`[PositionTracker] Scanning lending positions on ${chain}...`);
            
            const lendingConfigs = getLendingConfigsForChain(chain);
            
            for (const config of lendingConfigs) {
                try {
                    if (config.type === 'aave_v3') {
                        const aavePositions = await this.getAaveV3Positions(wallet, chain, config);
                        positions.push(...aavePositions);
                    } else if (config.type === 'compound_v3') {
                        const compoundPositions = await this.getCompoundV3Positions(wallet, chain, config);
                        positions.push(...compoundPositions);
                    }
                } catch (error) {
                    console.log(`[PositionTracker] Failed to scan ${config.name}: ${error}`);
                }
            }
        }
        
        return positions;
    }
    
    /**
     * Get Aave V3 positions
     */
    private async getAaveV3Positions(
        wallet: string,
        chain: string,
        config: { name: string; poolAddress: string; dataProvider?: string }
    ): Promise<LendingPosition[]> {
        const positions: LendingPosition[] = [];
        const provider = this.rpc.getProvider(chain);
        
        try {
            const pool = new Contract(config.poolAddress, AAVE_V3_POOL_ABI, provider);
            
            const accountData = await pool.getUserAccountData(wallet);
            const totalCollateral = Number(ethers.formatUnits(accountData[0], 8)); // USD with 8 decimals
            const totalDebt = Number(ethers.formatUnits(accountData[1], 8));
            const healthFactor = Number(ethers.formatEther(accountData[5]));
            
            if (totalCollateral > 0) {
                positions.push({
                    chain,
                    protocol: config.name,
                    protocolType: 'aave_v3',
                    tokenAddress: config.poolAddress,
                    tokenSymbol: 'AAVE_SUPPLY',
                    positionType: 'supply',
                    balance: totalCollateral,
                    valueUSD: totalCollateral,
                    currentAPY: 0, // Would need data provider to get specific rates
                    earnedInterestUSD: 0,
                    healthFactor: healthFactor > 100 ? undefined : healthFactor,
                });
            }
            
            if (totalDebt > 0) {
                positions.push({
                    chain,
                    protocol: config.name,
                    protocolType: 'aave_v3',
                    tokenAddress: config.poolAddress,
                    tokenSymbol: 'AAVE_BORROW',
                    positionType: 'borrow',
                    balance: totalDebt,
                    valueUSD: totalDebt,
                    currentAPY: 0,
                    earnedInterestUSD: 0,
                    healthFactor,
                    collateralValueUSD: totalCollateral,
                });
            }
        } catch (error) {
            console.log(`[PositionTracker] Aave V3 query failed: ${error}`);
        }
        
        return positions;
    }
    
    /**
     * Get Compound V3 positions
     */
    private async getCompoundV3Positions(
        wallet: string,
        chain: string,
        config: { name: string; poolAddress: string }
    ): Promise<LendingPosition[]> {
        const positions: LendingPosition[] = [];
        const provider = this.rpc.getProvider(chain);
        
        try {
            const comet = new Contract(config.poolAddress, COMPOUND_V3_ABI, provider);
            
            const [supplyBalance, borrowBalance, baseToken] = await Promise.all([
                comet.balanceOf(wallet),
                comet.borrowBalanceOf(wallet),
                comet.baseToken(),
            ]);
            
            const baseTokenContract = new Contract(baseToken, ERC20_ABI, provider);
            const [symbol, decimals] = await Promise.all([
                baseTokenContract.symbol().catch(() => 'UNKNOWN'),
                baseTokenContract.decimals().catch(() => 6),
            ]);
            
            const price = await this.priceOracle.getTokenPriceUSD(chain, baseToken);
            
            if (supplyBalance > 0n) {
                const balance = Number(ethers.formatUnits(supplyBalance, decimals));
                positions.push({
                    chain,
                    protocol: config.name,
                    protocolType: 'compound_v3',
                    tokenAddress: baseToken,
                    tokenSymbol: symbol,
                    positionType: 'supply',
                    balance,
                    valueUSD: balance * price.priceUSD,
                    currentAPY: 0,
                    earnedInterestUSD: 0,
                });
            }
            
            if (borrowBalance > 0n) {
                const balance = Number(ethers.formatUnits(borrowBalance, decimals));
                positions.push({
                    chain,
                    protocol: config.name,
                    protocolType: 'compound_v3',
                    tokenAddress: baseToken,
                    tokenSymbol: symbol,
                    positionType: 'borrow',
                    balance,
                    valueUSD: balance * price.priceUSD,
                    currentAPY: 0,
                    earnedInterestUSD: 0,
                });
            }
        } catch (error) {
            console.log(`[PositionTracker] Compound V3 query failed: ${error}`);
        }
        
        return positions;
    }
    
    /**
     * Get staking positions
     */
    async getStakingPositions(wallet: string, chains: string[]): Promise<StakingPosition[]> {
        const positions: StakingPosition[] = [];
        
        for (const chain of chains) {
            console.log(`[PositionTracker] Scanning staking positions on ${chain}...`);
            
            const stakingConfigs = getStakingConfigsForChain(chain);
            
            for (const config of stakingConfigs) {
                try {
                    const position = await this.checkStakingPosition(wallet, chain, config);
                    if (position) {
                        positions.push(position);
                    }
                } catch (error) {
                    console.log(`[PositionTracker] Failed to check ${config.name}: ${error}`);
                }
            }
        }
        
        return positions;
    }
    
    /**
     * Check staking position for a protocol
     */
    private async checkStakingPosition(
        wallet: string,
        chain: string,
        config: { name: string; type: string; stakedToken: string; receiptToken: string }
    ): Promise<StakingPosition | null> {
        const provider = this.rpc.getProvider(chain);
        
        try {
            const receiptContract = new Contract(config.receiptToken, ERC20_ABI, provider);
            const balance: bigint = await receiptContract.balanceOf(wallet);
            
            if (balance === 0n) return null;
            
            const [symbol, decimals] = await Promise.all([
                receiptContract.symbol().catch(() => 'UNKNOWN'),
                receiptContract.decimals().catch(() => 18),
            ]);
            
            const balanceFormatted = Number(ethers.formatUnits(balance, decimals));
            const price = await this.priceOracle.getTokenPriceUSD(chain, config.receiptToken);
            
            return {
                chain,
                protocol: config.name,
                protocolType: config.type as any,
                stakedToken: config.stakedToken,
                stakedSymbol: 'ETH',
                receiptToken: config.receiptToken,
                receiptSymbol: symbol,
                stakedAmount: balanceFormatted,
                currentValueUSD: balanceFormatted * price.priceUSD,
                earnedRewardsUSD: 0,
                currentAPY: 0,
            };
        } catch {
            return null;
        }
    }
}

// ============================================================================
// SINGLETON EXPORT
// ============================================================================

let positionTrackerInstance: PositionTracker | null = null;

export function getPositionTracker(): PositionTracker {
    if (!positionTrackerInstance) {
        positionTrackerInstance = new PositionTracker();
    }
    return positionTrackerInstance;
}
