import { BookOpen, ExternalLink, Lightbulb, FileText, Target, Layers, AlertTriangle, Rocket } from 'lucide-react'

const SECTIONS = [
  {
    title: '1. Problem Statement',
    icon: Target,
    content: `Modern streaming platforms like Netflix process billions of media events daily — uploads, transcoding requests, quality checks, and metadata extraction. Traditional monolithic architectures struggle with the bursty, unpredictable nature of this workload. Event-driven serverless architectures offer an alternative: each event triggers only the compute it needs, scaling automatically and incurring cost only during execution.

This project demonstrates these concepts through an educational, locally-running media processing pipeline inspired by Netflix's architectural challenges.`,
  },
  {
    title: '2. Research Paper',
    icon: FileText,
    content: null,
    custom: (
      <div className="space-y-3">
        <div className="p-4 rounded-lg bg-red-600/5 border border-red-500/20">
          <h4 className="text-white font-semibold text-sm">"An Event-Driven Serverless ETL Pipeline on AWS"</h4>
          <p className="text-gray-400 text-xs mt-1">Antreas Pogiatzis and Georgios Samakovitis</p>
          <p className="text-gray-500 text-xs">Applied Sciences, Volume 11, Issue 1, 2021</p>
          <p className="text-gray-500 text-xs">DOI: 10.3390/app11010191</p>
          <a href="https://www.mdpi.com/2076-3417/11/1/191" target="_blank" rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-red-400 hover:text-red-300 text-xs mt-2">
            <ExternalLink size={12} /> Read the full paper
          </a>
        </div>
      </div>
    ),
  },
  {
    title: '3. Research Objective',
    icon: Lightbulb,
    content: `The paper investigates how event-driven serverless architectures on AWS can be used to build efficient ETL (Extract, Transform, Load) pipelines. The authors propose a system where each stage of the ETL process is implemented as an independent AWS Lambda function, triggered by events flowing through services like S3, SQS, and EventBridge.

Their key findings demonstrate that serverless ETL pipelines can reduce operational overhead, scale elastically with workload volume, and eliminate idle-capacity costs compared to traditional always-on ETL infrastructure.`,
  },
  {
    title: '4. Event-Driven Serverless Architecture',
    icon: Layers,
    content: `Event-driven architecture is a design pattern where the flow of the program is determined by events — state changes or significant occurrences in the system.

Key characteristics:
• Decoupling: Producers and consumers of events are independent. A file upload doesn't need to know which functions will process it.
• Asynchronous: Events are queued and processed independently, enabling parallel execution.
• Scalable: Each event can trigger its own function instance, allowing the system to handle thousands of concurrent events.
• Fault-tolerant: Failed events can be retried or routed to dead-letter queues without affecting other processing.

In this project, uploading a file triggers a chain of events: validation → metadata extraction → processing → storage → notification. Each stage is a simulated serverless function.`,
  },
  {
    title: '5. Relevance to Netflix-Inspired Workflows',
    icon: Layers,
    content: `Netflix has publicly documented its use of event-driven and microservice architectures to handle massive scale. While this project does not replicate Netflix's actual infrastructure, it draws inspiration from similar architectural patterns:

• Media ingestion pipelines that validate and process uploaded content
• Event-driven workflows that decouple upload, transcoding, and delivery
• Scalable processing that handles variable upload volumes
• Monitoring and observability for tracking pipeline health

Important distinction: This is an educational adaptation, not a reproduction of Netflix's proprietary systems. The architectural concepts (event-driven, serverless, pipeline-based) are shared, but the specific implementation details differ significantly.`,
  },
  {
    title: '6. Research Methodology',
    icon: FileText,
    content: `The paper employs a design-science research approach:

1. Problem identification: Recognized limitations of traditional ETL (high idle costs, manual scaling, tight coupling).
2. Solution design: Proposed an event-driven serverless ETL architecture using AWS managed services.
3. Implementation: Built a working prototype using S3, Lambda, SQS, DynamoDB, and CloudWatch.
4. Evaluation: Measured performance, cost, and operational complexity against a traditional EC2-based ETL pipeline.

This project follows a similar approach at educational scale — implementing a working prototype that demonstrates the core architectural principles without requiring cloud infrastructure.`,
  },
  {
    title: '7. Project Implementation',
    icon: Rocket,
    content: `This application implements the research paper's concepts through:

Frontend (React + Vite + Tailwind CSS):
• Real-time dashboard with live metrics
• Interactive media processing pipeline
• Serverless function monitor
• Auto-scaling traffic simulator
• Architecture explorer with AWS service mappings

Backend (Node.js + Express):
• Event-driven job queue with configurable concurrency
• Five simulated serverless functions (validate, extract, process, save, notify)
• Asynchronous job processing with real timing
• Structured logging and metrics collection
• RESTful API for all interactions

All processing occurs locally with simulated delays to demonstrate the asynchronous, event-driven nature of the architecture.`,
  },
  {
    title: '8. Advantages of Serverless Computing',
    icon: Lightbulb,
    content: `• No server management: The cloud provider handles infrastructure provisioning, patching, and scaling.
• Pay-per-use: Costs are proportional to actual execution time, not provisioned capacity.
• Automatic scaling: Functions scale from zero to thousands of instances based on demand.
• Built-in fault tolerance: Cloud providers offer automatic retries, dead-letter queues, and multi-AZ deployment.
• Faster time-to-market: Developers focus on business logic rather than infrastructure.
• Event-driven integration: Native support for reacting to events from dozens of cloud services.`,
  },
  {
    title: '9. Limitations and Challenges',
    icon: AlertTriangle,
    content: `• Cold starts: Functions that haven't run recently may experience higher initial latency.
• Execution time limits: Most serverless platforms impose maximum execution durations (e.g., 15 minutes for AWS Lambda).
• Vendor lock-in: Heavy use of provider-specific services can make migration difficult.
• Debugging complexity: Distributed, event-driven systems are harder to trace and debug than monoliths.
• State management: Serverless functions are stateless by design; persistent state requires external services.
• Cost at scale: For consistently high-throughput workloads, reserved capacity may be more cost-effective than pay-per-invocation.`,
  },
  {
    title: '10. Future Scope',
    icon: Rocket,
    content: `• Integration with actual cloud services (AWS Lambda, S3, SQS) for production-grade demonstration.
• Real video transcoding using FFmpeg or similar tools.
• Multi-region deployment simulation.
• Cost estimation calculator based on invocation counts and durations.
• Comparison with container-based (Kubernetes) architectures.
• Implementation of dead-letter queues and retry strategies.
• Performance benchmarking under various load patterns.`,
  },
]

export default function Research() {
  return (
    <div>
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-white">Research Paper & Netflix Case Study</h1>
        <p className="text-gray-400 mt-1">Academic foundation and technical context for this project</p>
      </div>

      <div className="space-y-6">
        {SECTIONS.map(section => {
          const Icon = section.icon
          return (
            <div key={section.title} className="glass rounded-xl p-6 border border-white/5">
              <h2 className="text-lg font-semibold text-white flex items-center gap-3 mb-4">
                <div className="w-8 h-8 rounded-lg bg-red-600/15 flex items-center justify-center">
                  <Icon size={16} className="text-red-400" />
                </div>
                {section.title}
              </h2>
              {section.custom || (
                <div className="text-sm text-gray-400 leading-relaxed whitespace-pre-line">
                  {section.content}
                </div>
              )}
            </div>
          )
        })}

        {/* Academic reference */}
        <div className="glass rounded-xl p-6 border border-red-500/20 bg-gradient-to-br from-red-600/5 to-transparent">
          <h2 className="text-lg font-semibold text-white flex items-center gap-3 mb-4">
            <BookOpen size={18} className="text-red-400" />
            11. Academic Reference
          </h2>
          <div className="text-sm text-gray-300 font-mono bg-black/20 rounded-lg p-4">
            Pogiatzis, A.; Samakovitis, G. An Event-Driven Serverless ETL Pipeline on AWS. <em>Appl. Sci.</em> 2021, 11, 191. https://doi.org/10.3390/app11010191
          </div>
          <a href="https://www.mdpi.com/2076-3417/11/1/191" target="_blank" rel="noopener noreferrer"
            className="inline-flex items-center gap-2 text-red-400 hover:text-red-300 text-sm mt-3 transition">
            <ExternalLink size={14} /> Access the full research paper (Open Access)
          </a>
        </div>
      </div>
    </div>
  )
}
