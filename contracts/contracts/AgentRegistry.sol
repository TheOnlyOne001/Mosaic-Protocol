// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title AgentRegistry
 * @notice Open marketplace registry for AI agents - ERC-8004 style
 * @dev Supports multiple agents per capability, reputation tracking, owner earnings
 */
contract AgentRegistry is ERC721, Ownable {
    
    struct Agent {
        string name;
        string capability;
        address wallet;           // Agent's payment wallet
        address owner;            // Who deployed/owns this agent
        uint256 pricePerTask;     // Price in USDC (6 decimals)
        uint256 totalTasks;       // Total tasks attempted
        uint256 successfulTasks;  // Successfully completed tasks
        string endpoint;          // Tool/API endpoint identifier
        bool isActive;            // Can be hired
    }

    // Agent storage
    mapping(uint256 => Agent) public agents;
    uint256 public nextTokenId = 1;
    
    // Multiple agents per capability
    mapping(string => uint256[]) public agentsByCapability;
    
    // Owner earnings tracking (in USDC units)
    mapping(address => uint256) public ownerEarnings;
    
    // All capabilities for enumeration
    string[] public allCapabilities;
    mapping(string => bool) private capabilityExists;

    // Events
    event AgentRegistered(
        uint256 indexed tokenId, 
        string name, 
        string capability, 
        address wallet,
        address indexed owner,
        uint256 price,
        string endpoint
    );
    
    event TaskCompleted(
        uint256 indexed tokenId,
        bool success,
        uint256 newReputation
    );
    
    event AgentStatusChanged(
        uint256 indexed tokenId,
        bool isActive
    );
    
    event EarningsRecorded(
        address indexed owner,
        uint256 amount,
        uint256 indexed fromAgentId
    );

    constructor() ERC721("MosaicAgent", "MAGENT") Ownable(msg.sender) {}

    /**
     * @notice Register a new agent in the marketplace
     * @param name Display name for the agent
     * @param capability What the agent can do (e.g., "research", "analysis")
     * @param wallet Address to receive payments
     * @param owner Address that owns/controls this agent
     * @param price Price per task in USDC (6 decimals)
     * @param endpoint Tool identifier (e.g., "coingecko", "defillama", "claude")
     */
    function registerAgent(
        string memory name,
        string memory capability,
        address wallet,
        address owner,
        uint256 price,
        string memory endpoint
    ) external returns (uint256) {
        uint256 tokenId = nextTokenId++;
        
        agents[tokenId] = Agent({
            name: name,
            capability: capability,
            wallet: wallet,
            owner: owner,
            pricePerTask: price,
            totalTasks: 0,
            successfulTasks: 0,
            endpoint: endpoint,
            isActive: true
        });
        
        // Add to capability index
        agentsByCapability[capability].push(tokenId);
        
        // Track capability for enumeration
        if (!capabilityExists[capability]) {
            capabilityExists[capability] = true;
            allCapabilities.push(capability);
        }
        
        // Mint NFT to owner
        _mint(owner, tokenId);
        
        emit AgentRegistered(tokenId, name, capability, wallet, owner, price, endpoint);
        
        return tokenId;
    }

    /**
     * @notice Query all agents with a specific capability
     * @param capability The capability to search for
     * @return Array of agents matching the capability
     */
    function queryAgentsByCapability(string memory capability) external view returns (Agent[] memory) {
        uint256[] memory tokenIds = agentsByCapability[capability];
        
        // Count active agents
        uint256 activeCount = 0;
        for (uint256 i = 0; i < tokenIds.length; i++) {
            if (agents[tokenIds[i]].isActive) {
                activeCount++;
            }
        }
        
        // Build result array with only active agents
        Agent[] memory result = new Agent[](activeCount);
        uint256 resultIndex = 0;
        
        for (uint256 i = 0; i < tokenIds.length; i++) {
            if (agents[tokenIds[i]].isActive) {
                result[resultIndex] = agents[tokenIds[i]];
                resultIndex++;
            }
        }
        
        return result;
    }

    /**
     * @notice Get token IDs for agents with a capability
     * @param capability The capability to search for
     * @return Array of token IDs
     */
    function getAgentIdsByCapability(string memory capability) external view returns (uint256[] memory) {
        uint256[] memory allIds = agentsByCapability[capability];
        
        // Count active
        uint256 activeCount = 0;
        for (uint256 i = 0; i < allIds.length; i++) {
            if (agents[allIds[i]].isActive) {
                activeCount++;
            }
        }
        
        // Build result
        uint256[] memory result = new uint256[](activeCount);
        uint256 idx = 0;
        for (uint256 i = 0; i < allIds.length; i++) {
            if (agents[allIds[i]].isActive) {
                result[idx++] = allIds[i];
            }
        }
        
        return result;
    }

    /**
     * @notice Record task completion and update reputation
     * @param tokenId The agent's token ID
     * @param success Whether the task was successful
     */
    function recordTaskResult(uint256 tokenId, bool success) external {
        require(tokenId > 0 && tokenId < nextTokenId, "Agent does not exist");
        
        Agent storage agent = agents[tokenId];
        agent.totalTasks++;
        
        if (success) {
            agent.successfulTasks++;
        }
        
        uint256 reputation = getAgentReputation(tokenId);
        emit TaskCompleted(tokenId, success, reputation);
    }

    /**
     * @notice Record earnings for an agent's owner
     * @param tokenId The agent that earned
     * @param amount Amount earned in USDC units
     */
    function recordEarnings(uint256 tokenId, uint256 amount) external {
        require(tokenId > 0 && tokenId < nextTokenId, "Agent does not exist");
        
        address owner = agents[tokenId].owner;
        ownerEarnings[owner] += amount;
        
        emit EarningsRecorded(owner, amount, tokenId);
    }

    /**
     * @notice Get reputation score (0-100) for an agent
     * @param tokenId The agent's token ID
     * @return Reputation percentage (0-100)
     */
    function getAgentReputation(uint256 tokenId) public view returns (uint256) {
        Agent memory agent = agents[tokenId];
        
        if (agent.totalTasks == 0) {
            return 80; // Default reputation for new agents
        }
        
        return (agent.successfulTasks * 100) / agent.totalTasks;
    }

    /**
     * @notice Get a single agent by token ID
     */
    function getAgent(uint256 tokenId) external view returns (Agent memory) {
        require(tokenId > 0 && tokenId < nextTokenId, "Agent does not exist");
        return agents[tokenId];
    }

    /**
     * @notice Get all registered agents
     */
    function getAllAgents() external view returns (Agent[] memory) {
        Agent[] memory allAgents = new Agent[](nextTokenId - 1);
        for (uint256 i = 1; i < nextTokenId; i++) {
            allAgents[i - 1] = agents[i];
        }
        return allAgents;
    }

    /**
     * @notice Get all unique capabilities in the registry
     */
    function getAllCapabilities() external view returns (string[] memory) {
        return allCapabilities;
    }

    /**
     * @notice Toggle agent active status (only owner)
     */
    function setAgentActive(uint256 tokenId, bool active) external {
        require(ownerOf(tokenId) == msg.sender, "Not agent owner");
        agents[tokenId].isActive = active;
        emit AgentStatusChanged(tokenId, active);
    }

    /**
     * @notice Update agent price (only NFT owner)
     */
    function updatePrice(uint256 tokenId, uint256 newPrice) external {
        require(ownerOf(tokenId) == msg.sender, "Not agent owner");
        agents[tokenId].pricePerTask = newPrice;
    }

    /**
     * @notice Update agent price (admin override - contract owner only)
     */
    function updatePriceAdmin(uint256 tokenId, uint256 newPrice) external onlyOwner {
        require(tokenId > 0 && tokenId < nextTokenId, "Agent does not exist");
        agents[tokenId].pricePerTask = newPrice;
    }

    /**
     * @notice Get owner's total earnings
     */
    function getOwnerEarnings(address owner) external view returns (uint256) {
        return ownerEarnings[owner];
    }

    /**
     * @notice Get count of agents for a capability
     */
    function getAgentCountByCapability(string memory capability) external view returns (uint256) {
        uint256[] memory ids = agentsByCapability[capability];
        uint256 count = 0;
        for (uint256 i = 0; i < ids.length; i++) {
            if (agents[ids[i]].isActive) {
                count++;
            }
        }
        return count;
    }
}
