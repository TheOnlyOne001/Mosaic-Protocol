// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title VerifiableJobManager
 * @notice Manages verifiable AI job execution with commitment schemes and proof verification
 * @dev Handles job creation, commitment, proof submission, and payment settlement
 */
contract VerifiableJobManager is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    // ============================================================================
    // TYPES
    // ============================================================================

    enum JobStatus {
        CREATED,        // Job created, waiting for worker commitment
        COMMITTED,      // Worker committed, executing
        SUBMITTED,      // Proof submitted, pending verification
        VERIFIED,       // Proof verified, payment released
        REJECTED,       // Proof rejected, payment refunded
        EXPIRED,        // Deadline passed without submission
        DISPUTED        // Under dispute resolution
    }

    struct Job {
        address payer;              // Who created and funded the job
        address worker;             // Who committed to execute
        uint96 paymentAmount;       // Payment in USDC (6 decimals, max ~79B USDC)
        bytes32 inputHash;          // Hash of the task input
        bytes32 commitmentHash;     // Worker's commitment hash
        bytes32 outputHash;         // Hash of the output (after submission)
        uint48 createdAt;           // Timestamp of job creation
        uint48 commitmentDeadline;  // Deadline to commit
        uint48 submissionDeadline;  // Deadline to submit proof
        JobStatus status;           // Current job status
        string modelId;             // Required model identifier
    }

    struct WorkerStats {
        uint256 totalJobs;
        uint256 successfulJobs;
        uint256 totalEarned;
        uint256 slashCount;
        uint256 lastSlashTime;
    }

    // ============================================================================
    // STATE
    // ============================================================================

    // Payment token (USDC)
    IERC20 public immutable paymentToken;
    
    // Proof verifier contract
    address public proofVerifier;
    
    // Job storage
    mapping(bytes32 => Job) public jobs;
    bytes32[] public jobIds;
    
    // Worker stats
    mapping(address => WorkerStats) public workerStats;
    
    // Worker stakes
    mapping(address => uint256) public workerStakes;
    
    // Approved models
    mapping(string => bool) public approvedModels;
    string[] public modelList;
    
    // Configuration
    uint256 public commitmentWindow = 30;       // seconds
    uint256 public submissionWindow = 600;      // seconds
    uint256 public minimumPayment = 10000;      // 0.01 USDC
    uint256 public minimumStake = 100000;       // 0.1 USDC
    uint256 public slashPercentage = 50;        // 50%

    // ============================================================================
    // EVENTS
    // ============================================================================

    event JobCreated(
        bytes32 indexed jobId,
        address indexed payer,
        uint256 paymentAmount,
        bytes32 inputHash,
        string modelId,
        uint48 commitmentDeadline,
        uint48 submissionDeadline
    );

    event JobCommitted(
        bytes32 indexed jobId,
        address indexed worker,
        bytes32 commitmentHash
    );

    event ProofSubmitted(
        bytes32 indexed jobId,
        address indexed worker,
        bytes32 outputHash,
        bytes proof
    );

    event JobVerified(
        bytes32 indexed jobId,
        address indexed worker,
        bool valid,
        uint256 paymentAmount
    );

    event JobExpired(
        bytes32 indexed jobId,
        address indexed payer,
        uint256 refundAmount
    );

    event WorkerSlashed(
        bytes32 indexed jobId,
        address indexed worker,
        uint256 slashAmount,
        string reason
    );

    event StakeDeposited(
        address indexed worker,
        uint256 amount,
        uint256 newTotal
    );

    event StakeWithdrawn(
        address indexed worker,
        uint256 amount,
        uint256 remaining
    );

    event ModelApproved(string modelId);
    event ModelRevoked(string modelId);

    // ============================================================================
    // ERRORS
    // ============================================================================

    error JobNotFound();
    error InvalidJobStatus(JobStatus current, JobStatus expected);
    error DeadlineExceeded();
    error DeadlineNotReached();
    error UnauthorizedWorker();
    error InsufficientPayment();
    error InsufficientStake();
    error ModelNotApproved();
    error CommitmentMismatch();
    error ProofVerificationFailed();
    error TransferFailed();

    // ============================================================================
    // CONSTRUCTOR
    // ============================================================================

    constructor(address _paymentToken) Ownable(msg.sender) {
        paymentToken = IERC20(_paymentToken);
    }

    // ============================================================================
    // JOB MANAGEMENT
    // ============================================================================

    /**
     * @notice Create a new verifiable job
     * @param inputHash Hash of the task input
     * @param paymentAmount Payment amount in USDC
     * @param modelId Required model identifier
     * @return jobId The unique job identifier
     */
    function createJob(
        bytes32 inputHash,
        uint96 paymentAmount,
        string calldata modelId
    ) external nonReentrant returns (bytes32 jobId) {
        if (paymentAmount < minimumPayment) revert InsufficientPayment();
        if (!approvedModels[modelId]) revert ModelNotApproved();

        // Generate job ID
        jobId = keccak256(abi.encodePacked(
            msg.sender,
            inputHash,
            block.timestamp,
            jobIds.length
        ));

        // Calculate deadlines
        uint48 now_ = uint48(block.timestamp);
        uint48 commitDeadline = now_ + uint48(commitmentWindow);
        uint48 submitDeadline = now_ + uint48(submissionWindow);

        // Create job
        jobs[jobId] = Job({
            payer: msg.sender,
            worker: address(0),
            paymentAmount: paymentAmount,
            inputHash: inputHash,
            commitmentHash: bytes32(0),
            outputHash: bytes32(0),
            createdAt: now_,
            commitmentDeadline: commitDeadline,
            submissionDeadline: submitDeadline,
            status: JobStatus.CREATED,
            modelId: modelId
        });

        jobIds.push(jobId);

        // Transfer payment to escrow
        paymentToken.safeTransferFrom(msg.sender, address(this), paymentAmount);

        emit JobCreated(
            jobId,
            msg.sender,
            paymentAmount,
            inputHash,
            modelId,
            commitDeadline,
            submitDeadline
        );

        return jobId;
    }

    /**
     * @notice Worker commits to execute a job
     * @param jobId The job to commit to
     * @param commitmentHash Hash of (modelId + inputHash + nonce)
     */
    function commitToJob(
        bytes32 jobId,
        bytes32 commitmentHash
    ) external nonReentrant {
        Job storage job = jobs[jobId];
        
        if (job.payer == address(0)) revert JobNotFound();
        if (job.status != JobStatus.CREATED) revert InvalidJobStatus(job.status, JobStatus.CREATED);
        if (block.timestamp > job.commitmentDeadline) revert DeadlineExceeded();
        if (workerStakes[msg.sender] < minimumStake) revert InsufficientStake();

        job.worker = msg.sender;
        job.commitmentHash = commitmentHash;
        job.status = JobStatus.COMMITTED;

        emit JobCommitted(jobId, msg.sender, commitmentHash);
    }

    /**
     * @notice Submit proof for a committed job
     * @param jobId The job ID
     * @param outputHash Hash of the execution output
     * @param proof The ZK proof bytes
     * @param revealHash Hash to verify commitment reveal
     */
    function submitProof(
        bytes32 jobId,
        bytes32 outputHash,
        bytes calldata proof,
        bytes32 revealHash
    ) external nonReentrant {
        _submitProofWithInstances(jobId, outputHash, proof, revealHash, new uint256[](0));
    }

    /**
     * @notice Submit proof with instances for full ZK verification
     * @param jobId The job ID
     * @param outputHash Hash of the execution output
     * @param proof The ZK proof bytes
     * @param revealHash Hash to verify commitment reveal
     * @param instances Public inputs for ZK proof verification
     */
    function submitProofWithInstances(
        bytes32 jobId,
        bytes32 outputHash,
        bytes calldata proof,
        bytes32 revealHash,
        uint256[] calldata instances
    ) external nonReentrant {
        _submitProofWithInstances(jobId, outputHash, proof, revealHash, instances);
    }

    function _submitProofWithInstances(
        bytes32 jobId,
        bytes32 outputHash,
        bytes calldata proof,
        bytes32 revealHash,
        uint256[] memory instances
    ) internal {
        Job storage job = jobs[jobId];
        
        if (job.payer == address(0)) revert JobNotFound();
        if (job.status != JobStatus.COMMITTED) revert InvalidJobStatus(job.status, JobStatus.COMMITTED);
        if (job.worker != msg.sender) revert UnauthorizedWorker();
        if (block.timestamp > job.submissionDeadline) revert DeadlineExceeded();

        // Verify commitment reveal matches
        if (revealHash != job.commitmentHash) revert CommitmentMismatch();

        job.outputHash = outputHash;
        job.status = JobStatus.SUBMITTED;

        emit ProofSubmitted(jobId, msg.sender, outputHash, proof);

        // Verify proof (if verifier is set)
        bool proofValid = true;
        if (proofVerifier != address(0)) {
            // Call Halo2Verifier.verifyProof(bytes proof, uint256[] instances)
            (bool success, bytes memory result) = proofVerifier.call(
                abi.encodeWithSignature("verifyProof(bytes,uint256[])", proof, instances)
            );
            proofValid = success && (result.length == 0 || abi.decode(result, (bool)));
        }

        if (proofValid) {
            _settleJob(jobId, true);
        } else {
            _settleJob(jobId, false);
        }
    }

    /**
     * @notice Claim refund for expired job (payer only)
     * @param jobId The expired job ID
     */
    function claimRefund(bytes32 jobId) external nonReentrant {
        Job storage job = jobs[jobId];
        
        if (job.payer == address(0)) revert JobNotFound();
        if (job.payer != msg.sender) revert UnauthorizedWorker();
        if (block.timestamp <= job.submissionDeadline) revert DeadlineNotReached();
        
        // Can only refund CREATED or COMMITTED jobs
        if (job.status != JobStatus.CREATED && job.status != JobStatus.COMMITTED) {
            revert InvalidJobStatus(job.status, JobStatus.CREATED);
        }

        uint256 refundAmount = job.paymentAmount;
        
        // If worker committed but didn't deliver, slash their stake
        if (job.status == JobStatus.COMMITTED && job.worker != address(0)) {
            _slashWorker(jobId, job.worker, "Deadline missed");
        }

        job.status = JobStatus.EXPIRED;

        // Refund payer
        paymentToken.safeTransfer(msg.sender, refundAmount);

        emit JobExpired(jobId, msg.sender, refundAmount);
    }

    // ============================================================================
    // INTERNAL FUNCTIONS
    // ============================================================================

    function _settleJob(bytes32 jobId, bool verified) internal {
        Job storage job = jobs[jobId];
        address worker = job.worker;
        uint256 payment = job.paymentAmount;

        if (verified) {
            job.status = JobStatus.VERIFIED;
            
            // Update worker stats
            workerStats[worker].totalJobs++;
            workerStats[worker].successfulJobs++;
            workerStats[worker].totalEarned += payment;

            // Transfer payment to worker
            paymentToken.safeTransfer(worker, payment);

            emit JobVerified(jobId, worker, true, payment);
        } else {
            job.status = JobStatus.REJECTED;
            
            // Update worker stats
            workerStats[worker].totalJobs++;

            // Slash worker
            _slashWorker(jobId, worker, "Invalid proof");

            // Refund payer
            paymentToken.safeTransfer(job.payer, payment);

            emit JobVerified(jobId, worker, false, 0);
        }
    }

    function _slashWorker(bytes32 jobId, address worker, string memory reason) internal {
        uint256 stake = workerStakes[worker];
        uint256 slashAmount = (stake * slashPercentage) / 100;
        
        if (slashAmount > 0) {
            workerStakes[worker] -= slashAmount;
            workerStats[worker].slashCount++;
            workerStats[worker].lastSlashTime = block.timestamp;

            // Send slashed amount to contract owner (could be treasury)
            paymentToken.safeTransfer(owner(), slashAmount);

            emit WorkerSlashed(jobId, worker, slashAmount, reason);
        }
    }

    // ============================================================================
    // STAKE MANAGEMENT
    // ============================================================================

    /**
     * @notice Deposit stake as a worker
     * @param amount Amount to stake
     */
    function depositStake(uint256 amount) external nonReentrant {
        paymentToken.safeTransferFrom(msg.sender, address(this), amount);
        workerStakes[msg.sender] += amount;

        emit StakeDeposited(msg.sender, amount, workerStakes[msg.sender]);
    }

    /**
     * @notice Withdraw stake (if not locked)
     * @param amount Amount to withdraw
     */
    function withdrawStake(uint256 amount) external nonReentrant {
        uint256 currentStake = workerStakes[msg.sender];
        require(amount <= currentStake, "Insufficient stake");
        
        // Check if worker has pending jobs
        // In production, you'd check for active commitments
        
        workerStakes[msg.sender] -= amount;
        paymentToken.safeTransfer(msg.sender, amount);

        emit StakeWithdrawn(msg.sender, amount, workerStakes[msg.sender]);
    }

    // ============================================================================
    // ADMIN FUNCTIONS
    // ============================================================================

    function setProofVerifier(address _verifier) external onlyOwner {
        proofVerifier = _verifier;
    }

    function approveModel(string calldata modelId) external onlyOwner {
        if (!approvedModels[modelId]) {
            approvedModels[modelId] = true;
            modelList.push(modelId);
            emit ModelApproved(modelId);
        }
    }

    function revokeModel(string calldata modelId) external onlyOwner {
        approvedModels[modelId] = false;
        emit ModelRevoked(modelId);
    }

    function setCommitmentWindow(uint256 _window) external onlyOwner {
        commitmentWindow = _window;
    }

    function setSubmissionWindow(uint256 _window) external onlyOwner {
        submissionWindow = _window;
    }

    function setMinimumPayment(uint256 _minimum) external onlyOwner {
        minimumPayment = _minimum;
    }

    function setMinimumStake(uint256 _minimum) external onlyOwner {
        minimumStake = _minimum;
    }

    function setSlashPercentage(uint256 _percentage) external onlyOwner {
        require(_percentage <= 100, "Invalid percentage");
        slashPercentage = _percentage;
    }

    // ============================================================================
    // VIEW FUNCTIONS
    // ============================================================================

    function getJob(bytes32 jobId) external view returns (Job memory) {
        return jobs[jobId];
    }

    function getJobCount() external view returns (uint256) {
        return jobIds.length;
    }

    function getWorkerStats(address worker) external view returns (WorkerStats memory) {
        return workerStats[worker];
    }

    function getWorkerReputation(address worker) external view returns (uint256) {
        WorkerStats memory stats = workerStats[worker];
        if (stats.totalJobs == 0) return 80; // Default reputation
        return (stats.successfulJobs * 100) / stats.totalJobs;
    }

    function isModelApproved(string calldata modelId) external view returns (bool) {
        return approvedModels[modelId];
    }

    function getApprovedModels() external view returns (string[] memory) {
        return modelList;
    }
}
