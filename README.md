# Streamless — Netflix-Inspired Event-Driven Serverless Media Processing Pipeline

[![Node.js Version](https://img.shields.io/badge/Node.js-22%2B-brightgreen.svg)](https://nodejs.org/)
[![React Version](https://img.shields.io/badge/React-18-blue.svg)](https://react.dev/)
[![Vite](https://img.shields.io/badge/Vite-5.4-purple.svg)](https://vitejs.dev/)
[![SQLite](https://img.shields.io/badge/Database-SQLite%20(WAL%20mode)-lightblue.svg)](https://sqlite.org/)
[![License](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Academic Research](https://img.shields.io/badge/Research%20Paper-MDPI%20AppSci%202021-red.svg)](https://doi.org/10.3390/app11010191)

---

## 1. Project Overview

**Streamless** is a full-stack educational cloud computing system, interactive simulation platform, and benchmarking engine inspired by **Netflix's real-world media processing architecture** and academic research on **event-driven serverless computing**.

In modern streaming platforms like Netflix, raw video assets submitted by production studios arrive unpredictably in massive file sizes and varied formats. Provisioning dedicated virtual machines (EC2 instances) to process these intermittent bursts results in high idle costs and capacity planning friction. Streamless demonstrates how an **event-driven serverless architecture (FaaS + Managed Event Routing)** solves this challenge by dynamically scaling compute resources to zero when idle, reacting instantly to upload triggers, and parallelizing media ingestion tasks.

### Academic Context & Research Foundation
- **Assigned Topic:** Serverless Computing — A Case Study of Netflix
- **Core Research Reference:**
  > Pogiatzis, A., & Samakovitis, G. (2021). *An Event-Driven Serverless ETL Pipeline on AWS*. **Applied Sciences**, 11(1), 191.
  > DOI: [10.3390/app11010191](https://doi.org/10.3390/app11010191)
- **Course Domain:** Cloud Computing, Distributed Systems, Cloud Architecture & Scalability

---

## 2. High-Impact Architecture & Features

### Feature 1 — Adaptive Auto-Scaling Engine
- **Workload-Responsive Concurrency:** Dynamically monitors queue depth, active worker count, job arrival rates, and average waiting latency to resize the worker pool in real time.
- **Configurable Floors & Ceilings:** User-configurable minimum baseline floor (default: 2 workers) and maximum burst ceiling (default: 10 workers).
- **Anti-Flapping & Cooldown Bounds:** Prevents rapid oscillation with a 3-second scale-up cooldown and a 5-second scale-down idle observation window.
- **Decision Auditing:** Every scaling event (`SCALE_UP`, `SCALE_DOWN`, `COOLDOWN`, `MAINTAIN`) records a human-readable explanation into persistent storage with queue/active metrics.
- **Manual vs. Adaptive Modes:** Allows evaluators to compare static concurrency (fixed worker allocation) directly against dynamic elastic scaling.
- **Labeling Integrity:** Concurrency workers are explicitly labeled as **Simulated Asynchronous Workers** on the server event loop.

### Feature 2 — Persistent Job Storage & Reliable Failure Recovery
- **Local SQLite Database (`server/data/streamless.db`):** Persistent storage using Node.js built-in `node:sqlite` in Write-Ahead Logging (WAL) mode for high throughput.
- **Data Model:**
  - `jobs`: Unique ID, filename, MIME type, file size, status (`queued`, `processing`, `completed`, `failed`, `retrying`, `dlq`), stage results, attempt count, retry count, output metadata.
  - `job_events`: Complete immutable audit log of lifecycle transitions (`SUBMITTED`, `PROCESSING_STARTED`, `STAGE_STARTED`, `STAGE_COMPLETED`, `STAGE_FAILED`, `RETRY_SCHEDULED`, `COMPLETED`, `MOVED_TO_DLQ`, `RECOVERED_AFTER_RESTART`).
  - `dlq`: Persistent Dead-Letter Queue capturing poison-pill and exhausted assets with failure reasons and retry timestamps.
  - `benchmarks`: Historical benchmark records with configuration profiles and quantitative metrics.
- **Idempotency Protection:** Prevents duplicate submissions via client-provided `Idempotency-Key` headers. Duplicate requests return the original job record without duplicating work.
- **Bounded Retries with Backoff:** Transient failures (e.g. simulated transcoding timeouts) automatically retry up to 3 times with exponential backoff delay (1s, 1.5s, 2.25s).
- **Permanent Failure Discrimination:** Unsupported media types fail immediately without wasting retry budgets.
- **Dead-Letter Queue (DLQ):** Jobs exhausting their retry budget move to the DLQ table. The DLQ UI view enables manual inspection and safe one-click requeuing.
- **Server Restart Crash Recovery:** Interrupted jobs stuck in `processing` or `retrying` when the server terminates are automatically recovered on boot and requeued without data loss.

### Feature 3 — Performance Benchmarking & Comparative Analytics
- **Deterministic Workload Generator:** Seed-based pseudorandom generation (Mulberry32) ensures that benchmark runs compare configurations against the **identical workload profile**.
- **Real Metrics Recording:**
  - Total workload completion time (seconds)
  - Processing throughput in Jobs Per Second (JPS)
  - Average, Median (P50), and 95th-Percentile (P95) tail latencies
  - Average queue dwelling time & peak queue backlog depth
  - Worker capacity timeline over time
- **Side-by-Side Architectural Comparison:** Compare any two saved configurations (e.g., Fixed 2 workers vs. Adaptive Auto-Scaling 2-6 workers) with automatic percentage delta calculations.
- **Automated Viva Defense Summary:** Generates concise, scientifically grounded academic explanations for project presentations and viva defense.

---

## 3. Technology Stack

- **Frontend:**
  - React 18 with Vite
  - Tailwind CSS for responsive Netflix dark UI (`#0a0a1a`, `#e50914`)
  - Recharts for responsive line, area, and bar charts
  - Lucide React for system iconography
- **Backend:**
  - Node.js & Express.js REST API
  - SQLite database (`node:sqlite` DatabaseSync with WAL mode)
  - Multer for multipart media ingestion
  - Adaptive Auto-Scaling Engine & Deterministic Benchmark Suite
  - Zero external paid cloud dependencies, zero external database installation required

---

## 4. Quick Start & Execution Guide

### Prerequisites
- [Node.js](https://nodejs.org/) v22.5.0 or higher (supports native `node:sqlite`)
- Windows PowerShell / macOS Terminal / Linux Bash

### Step 1: Install Dependencies
```powershell
# Install backend dependencies
cd server
npm install

# Install frontend dependencies
cd ..\client
npm install
cd ..
```

### Step 2: Run Automated System Tests
Run the built-in, zero-dependency test suite to verify idempotency, SQLite persistence, startup crash recovery, scaling decisions, DLQ transitions, and benchmark metrics:
```powershell
cd server
node test/system.test.js
cd ..
```
*Expected Output: `🎉 All 6 automated tests passed successfully!`*

### Step 3: Run the Application Locally

#### Terminal 1 — Start the Backend Server (Port 3001)
```powershell
cd server
node index.js
```
*Output: `🚀 Streamless API running at http://localhost:3001`*

#### Terminal 2 — Start the Frontend Development Server (Port 5173)
```powershell
cd client
npm run dev
```
*Output: `➜ Local: http://localhost:5173/`*

### Step 4: Open in Browser
Open **`http://localhost:5173/`** to interact with the dashboard.

---

## 5. API Endpoints Reference

| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `POST` | `/api/jobs` | Submit file upload (supports `Idempotency-Key` header) |
| `POST` | `/api/jobs/synthetic` | Submit synthetic media job (supports `idempotencyKey`) |
| `GET` | `/api/jobs` | List persisted jobs from SQLite (`?status=&limit=`) |
| `GET` | `/api/jobs/:id` | Get job record by ID |
| `GET` | `/api/jobs/:id/events` | Get complete lifecycle event timeline for a job |
| `POST` | `/api/jobs/:id/retry` | Retry failed job execution |
| `GET` | `/api/dlq` | List all jobs in Dead-Letter Queue |
| `POST` | `/api/dlq/:id/retry` | Requeue job from Dead-Letter Queue |
| `GET` | `/api/scaling/status` | Current scaling mode, capacity, thresholds, and last reason |
| `POST` | `/api/scaling/config` | Update scaling mode (`auto`/`manual`), min/max, manual capacity |
| `GET` | `/api/scaling/events` | Audit trail of past scaling decisions |
| `POST` | `/api/benchmarks/run` | Execute deterministic benchmark run |
| `GET` | `/api/benchmarks` | List historical benchmark runs |
| `GET` | `/api/benchmarks/:id` | Get benchmark metrics and timeline |
| `POST` | `/api/benchmarks/compare` | Compare two runs (`runAId`, `runBId`) with percentage deltas |
| `DELETE`| `/api/benchmarks/:id` | Delete benchmark record |
| `GET` | `/api/metrics` | High-level system KPIs, throughput history, and scaling snapshot |
| `GET` | `/api/functions` | Individual Lambda function stats & execution logs |
| `POST` | `/api/simulate-traffic` | Ingest bulk synthetic traffic spike (`{ count: 25 }`) |

---

## 6. Project Directory Layout

```
cc project/
├── client/                     # Frontend React + Vite application
│   ├── src/
│   │   ├── pages/
│   │   │   ├── Dashboard.jsx       # Real-time metrics & auto-scaling status widget
│   │   │   ├── Pipeline.jsx        # Job submission, SQLite timeline inspector & DLQ tab
│   │   │   ├── AutoScaling.jsx     # Elastic auto-scaling controls, live capacity charts & audit log
│   │   │   ├── Benchmarking.jsx    # Deterministic benchmarking suite & side-by-side comparison
│   │   │   ├── FunctionMonitor.jsx # Lambda function execution statistics & logs
│   │   │   ├── Architecture.jsx    # Interactive AWS architecture map
│   │   │   ├── Research.jsx        # Academic paper review & Netflix case study
│   │   │   └── Comparison.jsx      # Serverless vs Traditional comparative analysis
│   │   ├── api.js                  # Frontend API client wrapper
│   │   ├── App.jsx                 # Sidebar navigation & page router
│   │   ├── index.css               # Tailwind CSS styling
│   │   └── main.jsx                # React entry point
│   ├── package.json
│   └── vite.config.js
├── server/                     # Backend Node.js / Express event simulation
│   ├── data/                   # Persistent storage directory (auto-created)
│   │   └── streamless.db       # SQLite WAL database file
│   ├── test/
│   │   └── system.test.js      # Zero-dependency automated test suite
│   ├── db.js                   # SQLite schema, CRUD, recovery, and DLQ operations
│   ├── scalingEngine.js        # Adaptive auto-scaling engine with cooldowns & audit trail
│   ├── benchmarkEngine.js      # Deterministic workload generator & comparative analytics
│   ├── uploads/                # Ephemeral multipart buffer
│   ├── index.js                # Core REST API & queue execution loop
│   └── package.json
├── README.md                   # Complete documentation (this file)
├── ARCHITECTURE.md             # System design & AWS service mapping
├── RESEARCH.md                 # Academic paper breakdown & Netflix case study
├── VIVA_NOTES.md               # 10 Core Viva Questions & Model Answers
└── DEMO_GUIDE.md               # 3-Minute presentation script
```

---

## 7. Educational & Ethical Disclaimer

This application is an educational prototype engineered for academic coursework, technical demonstration, and university viva defense. It abstracts and simulates cloud behavior (such as AWS Lambda cold starts, elastic worker scaling, S3 event dispatching, and DynamoDB writes) within a local Node.js process to ensure **100% free local execution** without requiring student credit cards, AWS account setups, or cloud billing risks.
