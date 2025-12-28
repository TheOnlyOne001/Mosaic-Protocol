// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title X402Escrow
 * @notice Trustless escrow for x402 streaming micropayments
 * @dev User deposits funds, coordinator streams micropayments to agents as work is delivered
 * 
 * FLOW:
 * 1. User calls deposit() with task quote amount
 * 2. Coordinator calls streamPayment() to pay agents incrementally
 * 3. On completion: coordinator calls settleTask() to finalize
 * 4. On failure/timeout: user calls refund() to reclaim remaining funds
 */
contract X402Escrow is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    // ============================================================================
    // TYPES
    // ============================================================================

    enum TaskStatus {
        PENDING,        // Deposit received, waiting for execution
        EXECUTING,      // Task is being executed, micropayments streaming
        COMPLETED,      // Task completed successfully
        REFUNDED,       // Task failed, funds refunded to user
        EXPIRED         // Task timed out
    }

    struct Task {
        address user;               // Who deposited funds
        uint96 depositAmount;       // Total deposited (USDC, 6 decimals)
        uint96 streamedAmount;      // Amount streamed to agents so far
        uint48 createdAt;           // Deposit timestamp
        uint48 expiresAt;           // Deadline for completion
        TaskStatus status;          // Current status
        string quoteId;             // Quote ID from backend
    }

    struct AgentPayment {
        address agent;              // Agent wallet address
        uint96 amount;              // Amount paid
        uint48 timestamp;           // Payment timestamp
    }

    // ============================================================================
    // STATE
    // ============================================================================

    // Payment token (USDC)
    IERC20 public immutable usdc;
    
    // Authorized coordinator (can stream payments)
    address public coordinator;
    
    // Task storage
    mapping(bytes32 => Task) public tasks;
    bytes32[] public taskIds;
    
    // Payment history per task
    mapping(bytes32 => AgentPayment[]) public taskPayments;
    
    // Configuration
    uint256 public defaultTaskTimeout = 3600;   // 1 hour default
    uint256 public minDeposit = 100000;         // 0.1 USDC minimum
    uint256 public platformFeePercent = 10;     // 10% platform fee
    
    // Platform fees collected
    uint256 public platformFeesCollected;

    // ============================================================================
    // EVENTS
    // ============================================================================

    event TaskDeposited(
        bytes32 indexed taskId,
        address indexed user,
        uint256 amount,
        string quoteId,
        uint48 expiresAt
    );

    event MicropaymentStreamed(
        bytes32 indexed taskId,
        address indexed agent,
        uint256 amount,
        uint256 totalStreamed,
        uint256 remaining
    );

    event TaskCompleted(
        bytes32 indexed taskId,
        address indexed user,
        uint256 totalStreamed,
        uint256 refundedToUser,
        uint256 platformFee
    );

    event TaskRefunded(
        bytes32 indexed taskId,
        address indexed user,
        uint256 refundAmount,
        string reason
    );

    event TaskExpired(
        bytes32 indexed taskId,
        address indexed user,
        uint256 refundAmount
    );

    event CoordinatorUpdated(address indexed oldCoordinator, address indexed newCoordinator);

    // ============================================================================
    // ERRORS
    // ============================================================================

    error TaskNotFound();
    error InvalidTaskStatus(TaskStatus current, TaskStatus expected);
    error InsufficientDeposit();
    error InsufficientEscrowBalance();
    error UnauthorizedCaller();
    error TaskExpiredError();
    error TaskNotExpired();
    error ZeroAddress();
    error ZeroAmount();

    // ============================================================================
    // MODIFIERS
    // ============================================================================

    modifier onlyCoordinator() {
        if (msg.sender != coordinator) revert UnauthorizedCaller();
        _;
    }

    // ============================================================================
    // CONSTRUCTOR
    // ============================================================================

    constructor(address _usdc, address _coordinator) Ownable(msg.sender) {
        if (_usdc == address(0)) revert ZeroAddress();
        if (_coordinator == address(0)) revert ZeroAddress();
        
        usdc = IERC20(_usdc);
        coordinator = _coordinator;
    }

    // ============================================================================
    // USER FUNCTIONS
    // ============================================================================

    /**
     * @notice Deposit funds for a task (called by user)
     * @param amount Amount to deposit (USDC)
     * @param quoteId Quote ID from backend
     * @param timeout Custom timeout in seconds (0 for default)
     * @return taskId Unique task identifier
     */
    function deposit(
        uint96 amount,
        string calldata quoteId,
        uint256 timeout
    ) external nonReentrant returns (bytes32 taskId) {
        if (amount < minDeposit) revert InsufficientDeposit();

        // Generate task ID
        taskId = keccak256(abi.encodePacked(
            msg.sender,
            quoteId,
            block.timestamp,
            taskIds.length
        ));

        // Calculate expiry
        uint256 taskTimeout = timeout > 0 ? timeout : defaultTaskTimeout;
        uint48 expiresAt = uint48(block.timestamp + taskTimeout);

        // Create task
        tasks[taskId] = Task({
            user: msg.sender,
            depositAmount: amount,
            streamedAmount: 0,
            createdAt: uint48(block.timestamp),
            expiresAt: expiresAt,
            status: TaskStatus.PENDING,
            quoteId: quoteId
        });

        taskIds.push(taskId);

        // Transfer USDC to escrow
        usdc.safeTransferFrom(msg.sender, address(this), amount);

        emit TaskDeposited(taskId, msg.sender, amount, quoteId, expiresAt);

        return taskId;
    }

    /**
     * @notice Claim refund for expired task (called by user)
     * @param taskId Task to refund
     */
    function claimExpiredRefund(bytes32 taskId) external nonReentrant {
        Task storage task = tasks[taskId];
        
        if (task.user == address(0)) revert TaskNotFound();
        if (task.user != msg.sender) revert UnauthorizedCaller();
        if (block.timestamp <= task.expiresAt) revert TaskNotExpired();
        if (task.status == TaskStatus.COMPLETED || task.status == TaskStatus.REFUNDED) {
            revert InvalidTaskStatus(task.status, TaskStatus.EXECUTING);
        }

        uint256 remaining = task.depositAmount - task.streamedAmount;
        task.status = TaskStatus.EXPIRED;

        if (remaining > 0) {
            usdc.safeTransfer(task.user, remaining);
        }

        emit TaskExpired(taskId, task.user, remaining);
    }

    // ============================================================================
    // COORDINATOR FUNCTIONS
    // ============================================================================

    /**
     * @notice Stream micropayment to an agent (called by coordinator)
     * @param taskId Task to stream from
     * @param agent Agent wallet to pay
     * @param amount Amount to pay
     */
    function streamPayment(
        bytes32 taskId,
        address agent,
        uint96 amount
    ) external onlyCoordinator nonReentrant {
        if (agent == address(0)) revert ZeroAddress();
        if (amount == 0) revert ZeroAmount();

        Task storage task = tasks[taskId];
        
        if (task.user == address(0)) revert TaskNotFound();
        if (task.status != TaskStatus.PENDING && task.status != TaskStatus.EXECUTING) {
            revert InvalidTaskStatus(task.status, TaskStatus.EXECUTING);
        }
        if (block.timestamp > task.expiresAt) revert TaskExpiredError();

        uint256 remaining = task.depositAmount - task.streamedAmount;
        if (amount > remaining) revert InsufficientEscrowBalance();

        // Update status if first payment
        if (task.status == TaskStatus.PENDING) {
            task.status = TaskStatus.EXECUTING;
        }

        // Update streamed amount
        task.streamedAmount += amount;

        // Record payment
        taskPayments[taskId].push(AgentPayment({
            agent: agent,
            amount: amount,
            timestamp: uint48(block.timestamp)
        }));

        // Transfer to agent
        usdc.safeTransfer(agent, amount);

        emit MicropaymentStreamed(
            taskId,
            agent,
            amount,
            task.streamedAmount,
            task.depositAmount - task.streamedAmount
        );
    }

    /**
     * @notice Complete task and finalize payments (called by coordinator)
     * @param taskId Task to complete
     * @param refundUser Whether to refund remaining balance to user
     */
    function settleTask(
        bytes32 taskId,
        bool refundUser
    ) external onlyCoordinator nonReentrant {
        Task storage task = tasks[taskId];
        
        if (task.user == address(0)) revert TaskNotFound();
        if (task.status != TaskStatus.PENDING && task.status != TaskStatus.EXECUTING) {
            revert InvalidTaskStatus(task.status, TaskStatus.EXECUTING);
        }

        uint256 remaining = task.depositAmount - task.streamedAmount;
        uint256 platformFee = 0;
        uint256 userRefund = 0;

        // Calculate platform fee from streamed amount
        if (task.streamedAmount > 0) {
            platformFee = (task.streamedAmount * platformFeePercent) / 100;
            // Note: Platform fee is taken from the buffer, not additional
        }

        // Handle remaining balance
        if (remaining > 0) {
            if (refundUser) {
                // Refund remaining to user
                userRefund = remaining;
                usdc.safeTransfer(task.user, remaining);
            } else {
                // Keep as platform fee
                platformFee += remaining;
            }
        }

        platformFeesCollected += platformFee;
        task.status = TaskStatus.COMPLETED;

        emit TaskCompleted(
            taskId,
            task.user,
            task.streamedAmount,
            userRefund,
            platformFee
        );
    }

    /**
     * @notice Refund task due to failure (called by coordinator)
     * @param taskId Task to refund
     * @param reason Reason for refund
     */
    function refundTask(
        bytes32 taskId,
        string calldata reason
    ) external onlyCoordinator nonReentrant {
        Task storage task = tasks[taskId];
        
        if (task.user == address(0)) revert TaskNotFound();
        if (task.status == TaskStatus.COMPLETED || task.status == TaskStatus.REFUNDED) {
            revert InvalidTaskStatus(task.status, TaskStatus.EXECUTING);
        }

        uint256 remaining = task.depositAmount - task.streamedAmount;
        task.status = TaskStatus.REFUNDED;

        if (remaining > 0) {
            usdc.safeTransfer(task.user, remaining);
        }

        emit TaskRefunded(taskId, task.user, remaining, reason);
    }

    // ============================================================================
    // ADMIN FUNCTIONS
    // ============================================================================

    /**
     * @notice Update coordinator address
     */
    function setCoordinator(address _coordinator) external onlyOwner {
        if (_coordinator == address(0)) revert ZeroAddress();
        address old = coordinator;
        coordinator = _coordinator;
        emit CoordinatorUpdated(old, _coordinator);
    }

    /**
     * @notice Withdraw platform fees
     */
    function withdrawPlatformFees(address to) external onlyOwner nonReentrant {
        if (to == address(0)) revert ZeroAddress();
        uint256 amount = platformFeesCollected;
        platformFeesCollected = 0;
        usdc.safeTransfer(to, amount);
    }

    /**
     * @notice Update configuration
     */
    function updateConfig(
        uint256 _defaultTimeout,
        uint256 _minDeposit,
        uint256 _platformFeePercent
    ) external onlyOwner {
        defaultTaskTimeout = _defaultTimeout;
        minDeposit = _minDeposit;
        platformFeePercent = _platformFeePercent;
    }

    // ============================================================================
    // VIEW FUNCTIONS
    // ============================================================================

    /**
     * @notice Get task details
     */
    function getTask(bytes32 taskId) external view returns (
        address user,
        uint256 depositAmount,
        uint256 streamedAmount,
        uint256 remaining,
        uint48 createdAt,
        uint48 expiresAt,
        TaskStatus status,
        string memory quoteId
    ) {
        Task storage task = tasks[taskId];
        return (
            task.user,
            task.depositAmount,
            task.streamedAmount,
            task.depositAmount - task.streamedAmount,
            task.createdAt,
            task.expiresAt,
            task.status,
            task.quoteId
        );
    }

    /**
     * @notice Get payment history for a task
     */
    function getTaskPayments(bytes32 taskId) external view returns (AgentPayment[] memory) {
        return taskPayments[taskId];
    }

    /**
     * @notice Get remaining balance for a task
     */
    function getRemainingBalance(bytes32 taskId) external view returns (uint256) {
        Task storage task = tasks[taskId];
        if (task.user == address(0)) return 0;
        return task.depositAmount - task.streamedAmount;
    }

    /**
     * @notice Check if task is expired
     */
    function isTaskExpired(bytes32 taskId) external view returns (bool) {
        Task storage task = tasks[taskId];
        return block.timestamp > task.expiresAt;
    }

    /**
     * @notice Get total number of tasks
     */
    function getTaskCount() external view returns (uint256) {
        return taskIds.length;
    }
}
