# Cloud Computing Viva Notes & Defense Preparation

This guide is prepared for students defending this project in academic examinations, oral tests (viva voce), and coursework reviews. It covers fundamental cloud computing principles, key architectural definitions, and **10 high-probability viva questions with authoritative answers**.

---

## 1. Quick Revision: Key Cloud Computing Concepts

### 1. Serverless Computing & FaaS
- **Definition:** An execution model where the cloud service provider dynamically manages the allocation, provisioning, and scaling of compute resources. Developers write code packaged as modular functions without managing physical or virtual servers.
- **Components:** Comprises **Function-as-a-Service (FaaS)** (e.g., AWS Lambda, Google Cloud Functions) and **Backend-as-a-Service (BaaS)** (e.g., Amazon S3, DynamoDB, Cognito).
- **Core Benefit:** Zero billing when idle; execution cost is strictly metered per millisecond of compute time.

### 2. Event-Driven Architecture (EDA)
- **Definition:** A software design pattern where decoupled services interact asynchronously by producing, detecting, and consuming discrete changes in state known as **events**.
- **Loose Coupling:** The event producer (e.g., S3 upload) does not need to know which downstream functions consume the event, nor does it block waiting for their completion.

### 3. Cold Start vs. Warm Start
- **Cold Start:** When a serverless function is invoked after a period of dormancy, or when scaling out to a new instance, the cloud provider must spin up a fresh micro-container, initialize the runtime environment (Node.js/Python), and load the application dependencies. This introduces a slight latency overhead (typically 100ms–1000ms).
- **Warm Start:** Subsequent invocations directed to an already-initialized, active container reuse the existing execution context, executing almost instantaneously.

### 4. Scalability vs. Elasticity
- **Scalability:** The ability of a system to handle increasing load by adding hardware resources (Scale Up / Vertical) or additional nodes (Scale Out / Horizontal).
- **Elasticity:** The degree to which a system can automatically adapt its capacity in real-time to match fluctuating demand dynamically (scaling both *out* during spikes and *in* to zero during lulls). Serverless is inherently elastic.

### 5. Idempotency
- **Definition:** A property of an operation whereby applying it multiple times produces the exact same outcome as applying it once ($f(f(x)) = f(x)$).
- **Importance in Cloud Pipelines:** In distributed event systems with "at-least-once" delivery guarantees (like Amazon SQS or S3 notifications), the same event could be delivered more than once due to network retries. Pipelines must be idempotent (e.g., checking if a job ID already exists before re-processing) to prevent duplicate processing.

---

## 2. Top 10 Viva Questions & Model Answers

### Q1. What is the fundamental difference between Serverless Computing (FaaS) and traditional Cloud Virtual Machines (IaaS)?
**Model Answer:**
> "In Infrastructure-as-a-Service (IaaS, such as Amazon EC2), developers provision and maintain virtual machines, select CPU/RAM sizing, configure OS patches, and pay continuously 24/7 for the running instance regardless of whether it is actively processing traffic or sitting idle. 
> 
> In Serverless Computing (FaaS, such as AWS Lambda), the server abstraction is completely hidden from the developer. Functions execute in ephemeral micro-containers in response to asynchronous triggers. Capacity automatically scales from zero to thousands of concurrent instances on demand, and billing stops entirely when no functions are executing. This eliminates idle capacity waste and drastically reduces operational overhead."

---

### Q2. How does an Event-Driven Architecture benefit a video streaming service like Netflix?
**Model Answer:**
> "Netflix experiences unpredictable, bursty ingestion patterns. Production studios upload master movie assets at irregular intervals, and millions of viewers trigger viewing events simultaneously. 
> 
> By utilizing an Event-Driven Architecture, media ingestion is completely decoupled from downstream encoding. When a studio uploads a video to S3, an `ObjectCreated` event automatically fans out to initiate validation, metadata extraction, and parallelized chunk transcoding without requiring a centralized, continuously running polling server. This guarantees that spikes in uploads are absorbed gracefully into queues and processed with maximal concurrency without risking service outages."

---

### Q3. What is the role of the research paper by Pogiatzis & Samakovitis (2021) in this project?
**Model Answer:**
> "The research paper, *'An Event-Driven Serverless ETL Pipeline on AWS'*, evaluates the architectural feasibility, cost dynamics, and performance of replacing conventional monolithic data pipelines with serverless components (AWS Lambda, S3, Step Functions, Athena). 
> 
> In Streamless, we implement the architectural methodology proposed in the paper: modeling a multi-stage pipeline (Validate $\rightarrow$ Metadata $\rightarrow$ Process $\rightarrow$ Persist $\rightarrow$ Notify) where each stage acts as an isolated serverless function orchestrated across an asynchronous state machine. Our project translates the paper's theoretical trade-off analysis into an interactive, visual simulation."

---

### Q4. What happens when a video file fails validation in the Streamless pipeline?
**Model Answer:**
> "Fault isolation is a core principle of serverless design. In Streamless, when an uploaded file possesses an unsupported MIME type or corrupt payload, the `validateMedia` function flags the job as `failed` and records an error entry in the telemetry logs. 
> 
> Crucially, execution halts immediately: downstream stages (such as CPU-intensive media processing or DynamoDB writes) are never invoked. This simulates cloud cost optimization, ensuring that invalid assets do not consume expensive downstream computing resources. Furthermore, the system supports retry mechanisms that allow administrators to re-evaluate or route the failed asset to a Dead Letter Queue (DLQ)."

---

### Q5. Explain how the Auto-Scaling Simulator in this project works and what it demonstrates.
**Model Answer:**
> "The Auto-Scaling Simulator demonstrates queuing theory and concurrency ceilings in cloud environments. Users can inject a burst of 10, 25, or 50 synthetic media events simultaneously while tuning the worker pool's `maxConcurrency` parameter. 
> 
> When the arrival rate of events ($\lambda$) exceeds the system's processing capacity ($c \cdot \mu$), incoming jobs enter a FIFO backlog queue. The dashboard visualizes this in real-time, plotting active executions versus queue backlog. This allows students and evaluators to observe the consequences of concurrency quotas, backpressure management, and how auto-scaling mitigates latency spikes during high traffic periods."

---

### Q6. What is a 'Cold Start' in AWS Lambda, and how is it addressed in production?
**Model Answer:**
> "A cold start occurs when an invocation requests a function that does not have an active container ready in memory. The cloud provider must allocate an execution environment, download the function package, start the container runtime, and run top-level initialization code. This can add 200ms to over 1 second of initial latency. 
> 
> In production environments like Netflix, cold starts are mitigated through several techniques:
> 1. **Provisioned Concurrency:** Pre-allocating warm execution environments for critical low-latency APIs.
> 2. **Keep-Warm Pings:** Periodic scheduled CloudWatch events that trigger functions to keep containers warm.
> 3. **Minimizing Package Size:** Removing unnecessary libraries and using compiled or fast-starting runtimes (Go, Rust, or optimized Node.js)."

---

### Q7. Why did Netflix migrate its encoding architecture to chunk-based serverless processing (Cosmos/Archer)?
**Model Answer:**
> "Traditionally, video transcoding was monolithic: an entire 2-hour movie was fed into a single large encoding server. If the server crashed after 90 minutes of processing, the entire transcode was lost. Furthermore, encoding a 4K movie sequentially could take several hours.
> 
> Netflix engineered Cosmos and Archer to break raw video assets into 2-to-5-second discrete segments. These chunks are processed concurrently across thousands of ephemeral containers in parallel. As a result, a full-length feature film can be transcoded in minutes rather than hours, and an error in one chunk requires re-processing only that individual 2-second snippet, providing immense fault tolerance and speed."

---

### Q8. What is the difference between Orchestration and Choreography in serverless pipelines?
**Model Answer:**
> "- **Orchestration (Centralized):** A central coordinator or state machine (e.g., AWS Step Functions) manages the sequence, checks conditions, handles retries, and invokes each function in order. Streamless uses an orchestrated model, tracking jobs through distinct sequential phases.
> 
> - **Choreography (Decentralized):** There is no central controller. Each function simply performs its task and emits an event (e.g., via Amazon EventBridge or SNS). Downstream functions listen for specific events and act autonomously. 
> 
> Orchestration is preferred when the pipeline has strict dependencies, complex retry logic, and requires global visibility into execution progress."

---

### Q9. What is a Dead Letter Queue (DLQ), and why is it necessary?
**Model Answer:**
> "A Dead Letter Queue (typically implemented via Amazon SQS) is a dedicated queue that stores messages or events that have repeatedly failed processing after a predefined number of retry attempts (max receive count). 
> 
> In serverless data pipelines, malformed or poisonous inputs (known as 'poison pills') could otherwise cause infinite retry loops, exhausting function concurrency quotas and incurring massive compute costs. The DLQ safely isolates these failed events for post-mortem analysis and manual debugging without halting the main pipeline."

---

### Q10. How does the pay-as-you-go cost model differ between a dedicated cluster and a serverless pipeline?
**Model Answer:**
> "Suppose a company processes 1,000 video uploads per month. Each video takes 30 seconds to encode:
> - **Traditional VM (EC2):** A dedicated `c5.2xlarge` instance ($0.34/hr) running 24/7 costs approximately **$245/month**, even if it sits idle 98% of the time.
> - **Serverless (AWS Lambda):** 1,000 videos $\times$ 30 seconds = 30,000 seconds of execution time. Under AWS Lambda pricing ($0.0000166667 per GB-second with 2GB RAM allocation), the compute cost is **under $1.00/month**.
> 
> This dramatic economic disparity proves the core thesis of the Pogiatzis & Samakovitis (2021) paper for intermittent, event-driven workloads."
