const { recordScalingEvent } = require('./db');

/**
 * Adaptive Auto-Scaling Engine
 * 
 * Note: Workers in this system are simulated asynchronous worker slots.
 * This engine models the elastic behavior of serverless compute (e.g., AWS Lambda concurrency scaling)
 * without provisioning actual cloud infrastructure.
 */

class AdaptiveScalingEngine {
  constructor(options = {}) {
    this.mode = options.mode || 'auto'; // 'auto' | 'manual'
    
    // Configurable thresholds & boundaries
    this.minWorkers = options.minWorkers !== undefined ? options.minWorkers : 2;
    this.maxWorkers = options.maxWorkers !== undefined ? options.maxWorkers : 10;
    this.currentCapacity = options.initialCapacity || this.minWorkers;
    
    // Scale-up triggers
    this.scaleUpQueueThreshold = options.scaleUpQueueThreshold || 3; // queued jobs > 3 triggers scale up
    this.scaleUpWaitTimeThresholdMs = options.scaleUpWaitTimeThresholdMs || 2500; // avg wait > 2.5s triggers scale up
    this.scaleUpStep = options.scaleUpStep || 2; // add up to 2 workers per scale-up event
    this.scaleUpCooldownMs = options.scaleUpCooldownMs || 3000; // wait 3s before next scale-up
    
    // Scale-down triggers
    this.scaleDownIdleThresholdMs = options.scaleDownIdleThresholdMs || 6000; // queue empty & low load for 6s
    this.scaleDownStep = options.scaleDownStep || 1; // remove 1 worker at a time (gradual)
    this.scaleDownCooldownMs = options.scaleDownCooldownMs || 5000; // wait 5s between scale-downs
    
    // Internal state tracking
    this.lastScaleUpTime = 0;
    this.lastScaleDownTime = 0;
    this.idleStartTime = null;
    this.lastDecision = {
      timestamp: new Date().toISOString(),
      action: 'INITIALIZED',
      reason: `Initialized in ${this.mode.toUpperCase()} mode with capacity ${this.currentCapacity} (Min: ${this.minWorkers}, Max: ${this.maxWorkers})`,
      capacity: this.currentCapacity,
    };
    
    // Completed jobs window for completion rate calculation (last 10 seconds)
    this.completedTimestamps = [];
  }

  // Record a completed job timestamp for throughput tracking
  recordJobCompleted() {
    const now = Date.now();
    this.completedTimestamps.push(now);
    // Keep only timestamps from last 15 seconds
    this.completedTimestamps = this.completedTimestamps.filter(t => now - t <= 15000);
  }

  // Calculate current completion rate (jobs/sec over last 10s window)
  getCompletionRate() {
    const now = Date.now();
    const recent = this.completedTimestamps.filter(t => now - t <= 10000);
    return recent.length > 0 ? parseFloat((recent.length / 10).toFixed(2)) : 0;
  }

  // Update configuration dynamically
  updateConfig(config = {}) {
    if (config.mode && ['auto', 'manual'].includes(config.mode)) {
      this.mode = config.mode;
    }
    if (config.minWorkers !== undefined) {
      this.minWorkers = Math.max(1, parseInt(config.minWorkers) || 1);
    }
    if (config.maxWorkers !== undefined) {
      this.maxWorkers = Math.max(this.minWorkers, parseInt(config.maxWorkers) || this.minWorkers);
    }
    if (config.manualCapacity !== undefined && this.mode === 'manual') {
      const clamped = Math.max(1, Math.min(parseInt(config.manualCapacity) || this.minWorkers, 50));
      this.currentCapacity = clamped;
    }
    if (config.scaleUpQueueThreshold !== undefined) {
      this.scaleUpQueueThreshold = Math.max(1, parseInt(config.scaleUpQueueThreshold) || 1);
    }
    if (config.scaleUpWaitTimeThresholdMs !== undefined) {
      this.scaleUpWaitTimeThresholdMs = Math.max(500, parseInt(config.scaleUpWaitTimeThresholdMs) || 500);
    }

    // Ensure capacity stays within min/max bounds
    if (this.currentCapacity < this.minWorkers) {
      this.currentCapacity = this.minWorkers;
    } else if (this.currentCapacity > this.maxWorkers && this.mode === 'auto') {
      this.currentCapacity = this.maxWorkers;
    }

    return this.getStatus();
  }

  /**
   * Main evaluation loop: evaluate current workload and make scaling decision.
   * 
   * @param {Object} metrics - Current workload metrics
   * @param {number} metrics.queuedCount - Number of jobs currently waiting in queue
   * @param {number} metrics.activeCount - Number of workers actively processing
   * @param {number} metrics.avgWaitTimeMs - Average waiting time of queued jobs
   * @returns {Object} Scaling decision result
   */
  evaluate({ queuedCount, activeCount, avgWaitTimeMs = 0 }) {
    const now = Date.now();
    const previousCapacity = this.currentCapacity;
    const completionRate = this.getCompletionRate();

    // In Manual Mode, do not auto-scale; respect user-set fixed capacity
    if (this.mode === 'manual') {
      this.lastDecision = {
        timestamp: new Date().toISOString(),
        action: 'MAINTAIN',
        reason: `Manual mode active: fixed worker capacity maintained at ${this.currentCapacity} (no automatic adjustments)`,
        capacity: this.currentCapacity,
      };
      return this.lastDecision;
    }

    // ── Evaluate Scale-Up Conditions ───────────────────────────────────────────
    const queueHeavy = queuedCount >= this.scaleUpQueueThreshold;
    const waitTimeHigh = avgWaitTimeMs >= this.scaleUpWaitTimeThresholdMs;
    const atMaxCapacity = this.currentCapacity >= this.maxWorkers;

    if ((queueHeavy || waitTimeHigh) && !atMaxCapacity) {
      const timeSinceLastScaleUp = now - this.lastScaleUpTime;
      if (timeSinceLastScaleUp < this.scaleUpCooldownMs) {
        const remainingCooldown = Math.ceil((this.scaleUpCooldownMs - timeSinceLastScaleUp) / 1000);
        this.lastDecision = {
          timestamp: new Date().toISOString(),
          action: 'COOLDOWN',
          reason: `High workload (queue: ${queuedCount}, wait: ${avgWaitTimeMs}ms), but scale-up cooldown is active (${remainingCooldown}s remaining) to prevent flapping`,
          capacity: this.currentCapacity,
        };
        return this.lastDecision;
      }

      // Calculate new capacity bounded by maxWorkers
      const proposedCapacity = Math.min(this.maxWorkers, this.currentCapacity + this.scaleUpStep);
      const added = proposedCapacity - this.currentCapacity;

      if (added > 0) {
        this.currentCapacity = proposedCapacity;
        this.lastScaleUpTime = now;
        this.idleStartTime = null; // reset idle tracking

        const reason = queueHeavy
          ? `Queue backlog (${queuedCount} jobs ≥ threshold ${this.scaleUpQueueThreshold}): scaled up +${added} worker(s) to ${this.currentCapacity} to relieve pressure`
          : `Queue wait latency (${avgWaitTimeMs}ms ≥ threshold ${this.scaleUpWaitTimeThresholdMs}ms): scaled up +${added} worker(s) to ${this.currentCapacity}`;

        this.lastDecision = {
          timestamp: new Date().toISOString(),
          action: 'SCALE_UP',
          reason,
          capacity: this.currentCapacity,
          previousCapacity,
        };

        recordScalingEvent({
          action: 'SCALE_UP',
          previousCapacity,
          newCapacity: this.currentCapacity,
          reason,
          queueDepth: queuedCount,
          activeWorkers: activeCount,
          metrics: { queuedCount, activeCount, avgWaitTimeMs, completionRate },
        });

        return this.lastDecision;
      }
    }

    // ── Evaluate Scale-Down Conditions ─────────────────────────────────────────
    const isWorkloadLow = queuedCount === 0 && activeCount < this.currentCapacity;
    const atMinCapacity = this.currentCapacity <= this.minWorkers;

    if (isWorkloadLow && !atMinCapacity) {
      if (!this.idleStartTime) {
        this.idleStartTime = now;
      }

      const idleDuration = now - this.idleStartTime;
      const timeSinceLastScaleDown = now - this.lastScaleDownTime;

      if (idleDuration >= this.scaleDownIdleThresholdMs) {
        if (timeSinceLastScaleDown < this.scaleDownCooldownMs) {
          const remainingCooldown = Math.ceil((this.scaleDownCooldownMs - timeSinceLastScaleDown) / 1000);
          this.lastDecision = {
            timestamp: new Date().toISOString(),
            action: 'COOLDOWN',
            reason: `Low workload sustained for ${(idleDuration / 1000).toFixed(1)}s, but scale-down cooldown active (${remainingCooldown}s remaining)`,
            capacity: this.currentCapacity,
          };
          return this.lastDecision;
        }

        // Scale down gradually
        const proposedCapacity = Math.max(this.minWorkers, this.currentCapacity - this.scaleDownStep);
        const removed = this.currentCapacity - proposedCapacity;

        if (removed > 0) {
          this.currentCapacity = proposedCapacity;
          this.lastScaleDownTime = now;
          this.idleStartTime = now; // reset idle anchor

          const reason = `Zero queue backlog and low active workers (${activeCount}/${previousCapacity}) sustained for ${(idleDuration / 1000).toFixed(1)}s: scaled down -${removed} worker(s) to ${this.currentCapacity} to conserve resources`;

          this.lastDecision = {
            timestamp: new Date().toISOString(),
            action: 'SCALE_DOWN',
            reason,
            capacity: this.currentCapacity,
            previousCapacity,
          };

          recordScalingEvent({
            action: 'SCALE_DOWN',
            previousCapacity,
            newCapacity: this.currentCapacity,
            reason,
            queueDepth: queuedCount,
            activeWorkers: activeCount,
            metrics: { queuedCount, activeCount, avgWaitTimeMs, completionRate },
          });

          return this.lastDecision;
        }
      } else {
        const remainingToIdle = Math.ceil((this.scaleDownIdleThresholdMs - idleDuration) / 1000);
        this.lastDecision = {
          timestamp: new Date().toISOString(),
          action: 'OBSERVING',
          reason: `Workload is low (queue: 0, active: ${activeCount}). Observing for scale-down eligibility (${remainingToIdle}s remaining in idle window)`,
          capacity: this.currentCapacity,
        };
        return this.lastDecision;
      }
    } else {
      // Not idle: reset idle tracking
      this.idleStartTime = null;
    }

    // Default: Maintain steady state
    let maintainReason = `Workload balanced: queue (${queuedCount}), active (${activeCount}/${this.currentCapacity}). Worker capacity steady at ${this.currentCapacity}.`;
    if (atMaxCapacity && queueHeavy) {
      maintainReason = `Queue backlog (${queuedCount}), but maximum capacity limit (${this.maxWorkers} workers) reached. Operating at full ceiling.`;
    } else if (atMinCapacity && isWorkloadLow) {
      maintainReason = `Zero queue backlog. Operating at minimum worker floor (${this.minWorkers} workers). Scaling down to zero is disabled to preserve warm readiness.`;
    }

    this.lastDecision = {
      timestamp: new Date().toISOString(),
      action: 'MAINTAIN',
      reason: maintainReason,
      capacity: this.currentCapacity,
    };
    return this.lastDecision;
  }

  getCurrentCapacity() {
    return this.currentCapacity;
  }

  getStatus() {
    return {
      mode: this.mode,
      currentCapacity: this.currentCapacity,
      minWorkers: this.minWorkers,
      maxWorkers: this.maxWorkers,
      scaleUpQueueThreshold: this.scaleUpQueueThreshold,
      scaleUpWaitTimeThresholdMs: this.scaleUpWaitTimeThresholdMs,
      scaleDownIdleThresholdMs: this.scaleDownIdleThresholdMs,
      completionRate: this.getCompletionRate(),
      lastDecision: this.lastDecision,
      isSimulated: true,
      workerPoolType: 'Simulated Asynchronous Workers',
    };
  }
}

module.exports = AdaptiveScalingEngine;
