/**
 * Agent Management Module
 * Exports all agent-related functionality for the Mosaic Protocol
 */

// Base agent executor
export { AgentExecutor, TaskContext, AgentResult, AgentConfig, createAgentConfig } from './AgentExecutor.js';

// Specialized agents
export { CoordinatorAgent, createCoordinator, TaskPlan } from './CoordinatorAgent.js';
export { ResearchAgent, createResearchAgent } from './ResearchAgent.js';
export { MarketAgent, createMarketAgent } from './MarketAgent.js';
export { AnalystAgent, createAnalystAgent } from './AnalystAgent.js';
export { WriterAgent, SummarizerAgent, createWriterAgent, createSummarizerAgent } from './WriterAgent.js';

// DeFi-specific agents
export { DeFiSafetyAgent, getDeFiSafetyAgent } from './DeFiSafetyAgent.js';
export { OnChainAnalystAgent, getOnChainAnalystAgent } from './OnChainAnalystAgent.js';

// Autonomy engine
export { 
    AutonomyEngine, 
    HireDecision, 
    AutonomousHireResult, 
    getAutonomyEngine 
} from './AutonomyEngine.js';
