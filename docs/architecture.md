# Mosaic Protocol Architecture

## System Overview

```mermaid
flowchart TB
    subgraph Frontend["🖥️ Frontend (Next.js 14)"]
        UI[React UI Components]
        ThreeJS[Three.js 3D Visualization]
        WS_Client[WebSocket Client]
        Wallet[RainbowKit + Wagmi]
    end

    subgraph Backend["⚙️ Backend (Node.js)"]
        API[Express REST API]
        WS_Server[WebSocket Server]
        TaskEngine[Task Engine]
        
        subgraph Agents["🤖 Agent Swarm (17 Agents)"]
            Coordinator[Coordinator Agent]
            Research[Research Agent]
            Analyst[Deep Analyst]
            Market[Market Agent]
            DeFi[DeFi Specialists]
            Others[10+ More Agents]
        end
        
        subgraph Systems["Core Systems"]
            Auction[Attention Auction]
            x402[x402 Streaming Payments]
            ZK[ZK Verification]
            Collusion[Collusion Detector]
        end
    end

    subgraph Blockchain["⛓️ Base Sepolia"]
        Registry[AgentRegistry ERC-721]
        JobManager[VerifiableJobManager]
        Verifier[Halo2Verifier]
        USDC[USDC Token]
    end

    subgraph External["🌐 External Services"]
        Groq[Groq LLM API]
        Anthropic[Anthropic Claude]
        CoinGecko[CoinGecko API]
    end

    UI --> WS_Client
    UI --> Wallet
    WS_Client <--> WS_Server
    Wallet --> USDC
    
    API --> TaskEngine
    WS_Server --> TaskEngine
    TaskEngine --> Coordinator
    Coordinator --> Agents
    
    TaskEngine --> Auction
    TaskEngine --> x402
    TaskEngine --> ZK
    Auction --> Registry
    
    Agents --> Groq
    Agents --> Anthropic
    Market --> CoinGecko
    
    x402 --> USDC
    ZK --> JobManager
    JobManager --> Verifier
```

## Task Execution Flow

```mermaid
sequenceDiagram
    participant U as User
    participant F as Frontend
    participant B as Backend
    participant C as Coordinator
    participant R as AgentRegistry
    participant A as Agent
    participant ZK as ZK Verifier
    participant BC as Blockchain

    U->>F: Submit Task
    F->>B: POST /api/tasks
    B->>C: Analyze & Decompose
    C-->>B: TaskPlan (subtasks)
    
    loop For Each Subtask
        B->>R: Query Capability
        R-->>B: Candidate Agents
        B->>B: Run Attention Auction
        B->>BC: USDC Transfer
        BC-->>B: TX Confirmed
        B->>A: Execute Task
        A->>A: LLM Processing
        
        opt ZK Verification Enabled
            A->>ZK: Generate Proof
            ZK->>BC: Submit Proof
            BC->>BC: Halo2 Verify
            BC-->>B: Verification Result
        end
        
        A-->>B: Result + Micropayments
    end
    
    B->>C: Synthesize Results
    C-->>B: Final Report
    B->>F: WebSocket: task:complete
    F->>U: Display Results
```

## Payment Flow

```mermaid
flowchart LR
    subgraph User
        UW[User Wallet]
    end
    
    subgraph Platform
        CW[Coordinator Wallet]
        Buffer[20% Buffer]
        Fee[10% Platform Fee]
    end
    
    subgraph Agents
        A1[Agent 1 Wallet]
        A2[Agent 2 Wallet]
        A3[Agent 3 Wallet]
    end
    
    subgraph Owners
        O1[Owner 1]
        O2[Owner 2]
        O3[Owner 3]
    end

    UW -->|Total Payment| CW
    CW -->|Agent Fee| A1
    CW -->|Agent Fee| A2
    CW -->|Agent Fee| A3
    CW -->|Buffer| Buffer
    CW -->|Platform| Fee
    
    A1 -.->|Profits| O1
    A2 -.->|Profits| O2
    A3 -.->|Profits| O3
```

## x402 Streaming Micropayments

```mermaid
sequenceDiagram
    participant P as Payer
    participant S as Stream Manager
    participant A as Agent (LLM)
    participant BC as Blockchain

    P->>S: openStream(totalPrice)
    S-->>P: streamId
    
    loop Token Generation
        A->>A: Generate tokens
        A->>S: recordTokens(count)
        S->>S: Calculate micropayment
        S-->>P: stream:micro event
        
        opt Real-time Mode
            S->>BC: USDC micropayment
        end
    end
    
    A->>S: Complete
    S->>BC: settleStream(finalTX)
    BC-->>S: Confirmed
    S-->>P: stream:settle event
```

## ZK Verification Pipeline

```mermaid
flowchart TB
    subgraph Execution
        Task[Task Input]
        LLM[LLM Execution]
        Output[Agent Output]
    end
    
    subgraph Proof["Proof Generation"]
        Embed[Text → Embeddings]
        EZKL[EZKL Framework]
        Halo2[Halo2 Circuit]
        Proof_Out[ZK Proof ~2KB]
    end
    
    subgraph OnChain["On-Chain Verification"]
        Job[Create Job + Escrow]
        Commit[Worker Commitment]
        Submit[Submit Proof]
        Verify[Halo2Verifier.verify]
    end
    
    subgraph Settlement
        Valid{Valid?}
        Pay[Release Payment]
        Slash[Slash + Refund]
    end

    Task --> LLM --> Output
    Output --> Embed --> EZKL --> Halo2 --> Proof_Out
    
    Job --> Commit --> Submit
    Proof_Out --> Submit
    Submit --> Verify --> Valid
    
    Valid -->|Yes| Pay
    Valid -->|No| Slash
```

## Agent Discovery & Auction

```mermaid
flowchart TB
    subgraph Discovery
        Need[Capability Needed]
        Query[Query AgentRegistry]
        Candidates[Candidate Agents]
    end
    
    subgraph Auction["Attention Auction"]
        Score[Calculate Scores]
        Rep[Reputation 60%]
        Price[Price Score 40%]
        Winner[Select Winner]
    end
    
    subgraph Execution
        Payment[USDC Payment]
        Execute[Agent Executes]
        Result[Return Result]
    end

    Need --> Query --> Candidates
    Candidates --> Score
    Rep --> Score
    Price --> Score
    Score --> Winner
    Winner --> Payment --> Execute --> Result
```

## Smart Contract Architecture

```mermaid
classDiagram
    class AgentRegistry {
        +mapping agents
        +registerAgent()
        +queryByCapability()
        +getReputation()
        +recordTaskResult()
        +transferFrom()
    }
    
    class VerifiableJobManager {
        +mapping jobs
        +mapping workerStakes
        +createJob()
        +commitToJob()
        +submitProof()
        +depositStake()
        +withdrawStake()
    }
    
    class Halo2Verifier {
        +verifyProof()
    }
    
    class IERC20 {
        +transfer()
        +transferFrom()
        +approve()
    }

    AgentRegistry --> IERC20 : uses USDC
    VerifiableJobManager --> IERC20 : escrows USDC
    VerifiableJobManager --> Halo2Verifier : verifies proofs
    VerifiableJobManager --> AgentRegistry : updates reputation
```

## Collusion Prevention

```mermaid
flowchart TB
    subgraph Check["Hire Request"]
        A[Agent A wants to hire Agent B]
    end
    
    subgraph Layer1["Layer 1: Owner Check"]
        Owner{Same Owner?}
    end
    
    subgraph Layer2["Layer 2: Repeat Check"]
        Repeat{Hired 3+ times?}
    end
    
    subgraph Layer3["Layer 3: Circular Check"]
        Circular{B hired A before?}
    end
    
    subgraph Layer4["Layer 4: Price Check"]
        Price{Price > 2x market?}
    end
    
    subgraph Result
        Allow[✅ Allow Hire]
        Block[❌ Block Hire]
    end

    A --> Owner
    Owner -->|Yes| Block
    Owner -->|No| Repeat
    Repeat -->|Yes| Block
    Repeat -->|No| Circular
    Circular -->|Yes| Block
    Circular -->|No| Price
    Price -->|Yes| Block
    Price -->|No| Allow
```

## WebSocket Event Flow

```mermaid
flowchart LR
    subgraph Events["Event Types"]
        Agent[agent:status]
        Decision[decision:*]
        Payment[payment:*]
        Stream[stream:*]
        Auction[auction:*]
        Verify[verification:*]
        Task[task:complete]
    end
    
    subgraph Backend
        WS[WebSocket Server]
        Emit[Event Emitter]
    end
    
    subgraph Frontend
        Client[WS Client]
        State[React State]
        UI[UI Update]
    end

    Emit --> WS
    Agent --> WS
    Decision --> WS
    Payment --> WS
    Stream --> WS
    Auction --> WS
    Verify --> WS
    Task --> WS
    
    WS --> Client --> State --> UI
```
