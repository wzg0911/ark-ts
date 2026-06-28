/**
 * MultiAgentProtocol — 多Agent可靠性协议
 * Gene source: PraisonAI (⭐8,104) + BMAD-METHOD
 * Reliable inter-agent messaging: handshake, delivery guarantee, health checks.
 */

type MessageStatus = 'pending' | 'delivered' | 'acknowledged' | 'failed' | 'timeout';
type AgentStatus = 'online' | 'busy' | 'degraded' | 'offline' | 'unknown';

interface AgentMessage {
  messageId: string;
  sender: string;
  recipient: string;
  content: Record<string, unknown>;
  status: MessageStatus;
  createdAt: number;
  deliveredAt: number | null;
  acknowledgedAt: number | null;
  retryCount: number;
  maxRetries: number;
  ttlSeconds: number;
}

interface AgentHeartbeat {
  agentId: string;
  status: AgentStatus;
  lastSeen: number;
  messageCount: number;
  errorCount: number;
  avgResponseMs: number;
}

interface MultiAgentStats {
  agentId: string;
  messagesSent: number;
  messagesDelivered: number;
  messagesFailed: number;
  totalRetries: number;
  totalTimeouts: number;
  totalHeartbeats: number;
  activeMessages: number;
  registeredAgents: number;
  onlineAgents: number;
  deliveryRate: string;
}

function generateId(): string {
  return Math.random().toString(36).slice(2, 14);
}

export class MultiAgentProtocol {
  private messages: Map<string, AgentMessage> = new Map();
  private agents: Map<string, AgentHeartbeat> = new Map();

  private totalMessagesSent = 0;
  private totalMessagesDelivered = 0;
  private totalMessagesFailed = 0;
  private totalRetries = 0;
  private totalHeartbeats = 0;
  private totalTimeouts = 0;

  constructor(
    public agentId: string,
    public heartbeatInterval: number = 5_000,
  ) {}

  registerAgent(
    agentId: string,
    initialStatus: AgentStatus = 'online',
  ): boolean {
    if (!this.agents.has(agentId)) {
      this.agents.set(agentId, {
        agentId,
        status: initialStatus,
        lastSeen: Date.now(),
        messageCount: 0,
        errorCount: 0,
        avgResponseMs: 0,
      });
      return true;
    }
    const agent = this.agents.get(agentId)!;
    agent.status = 'online';
    agent.lastSeen = Date.now();
    return false;
  }

  deregisterAgent(agentId: string): void {
    const agent = this.agents.get(agentId);
    if (agent) {
      agent.status = 'offline';
    }
  }

  sendMessage(
    recipient: string,
    content: Record<string, unknown>,
    maxRetries: number = 3,
    ttl: number = 30,
  ): AgentMessage {
    const msg: AgentMessage = {
      messageId: generateId(),
      sender: this.agentId,
      recipient,
      content,
      status: 'pending',
      createdAt: Date.now(),
      deliveredAt: null,
      acknowledgedAt: null,
      retryCount: 0,
      maxRetries,
      ttlSeconds: ttl,
    };

    this.messages.set(msg.messageId, msg);
    this.totalMessagesSent++;
    this.tryDeliver(msg);
    return msg;
  }

  private tryDeliver(msg: AgentMessage): void {
    const recipient = this.agents.get(msg.recipient);
    if (recipient && recipient.status !== 'offline' && recipient.status !== 'unknown') {
      msg.status = 'delivered';
      msg.deliveredAt = Date.now();
      this.totalMessagesDelivered++;
    } else {
      msg.status = 'failed';
      this.totalMessagesFailed++;
    }
  }

  acknowledgeMessage(messageId: string): boolean {
    const msg = this.messages.get(messageId);
    if (msg && msg.status === 'delivered') {
      msg.status = 'acknowledged';
      msg.acknowledgedAt = Date.now();
      return true;
    }
    return false;
  }

  retryMessage(messageId: string): boolean {
    const msg = this.messages.get(messageId);
    if (!msg) return false;
    if (msg.retryCount >= msg.maxRetries) {
      msg.status = 'timeout';
      this.totalTimeouts++;
      return false;
    }
    msg.retryCount++;
    this.totalRetries++;
    this.tryDeliver(msg);
    return true;
  }

  sendHeartbeat(status: AgentStatus = 'online'): void {
    const existing = this.agents.get(this.agentId);
    if (!existing) {
      this.agents.set(this.agentId, {
        agentId: this.agentId,
        status,
        lastSeen: Date.now(),
        messageCount: 0,
        errorCount: 0,
        avgResponseMs: 0,
      });
    } else {
      existing.status = status;
      existing.lastSeen = Date.now();
    }
    this.totalHeartbeats++;
  }

  checkAgentHealth(agentId: string, maxAge: number = 15_000): AgentStatus {
    const agent = this.agents.get(agentId);
    if (!agent) return 'unknown';
    if (Date.now() - agent.lastSeen > maxAge) {
      agent.status = 'offline';
      return 'offline';
    }
    return agent.status;
  }

  getOnlineAgents(): string[] {
    const now = Date.now();
    const result: string[] = [];
    for (const [id, agent] of this.agents) {
      if (agent.status === 'online' && now - agent.lastSeen < 15_000) {
        result.push(id);
      }
    }
    return result;
  }

  collectGarbage(): void {
    const now = Date.now();
    // Expire old messages
    for (const [id, msg] of this.messages) {
      if (now - msg.createdAt > msg.ttlSeconds * 1000) {
        this.messages.delete(id);
      }
    }
    // Mark stale agents offline
    for (const [, agent] of this.agents) {
      if (now - agent.lastSeen > 30_000) {
        agent.status = 'offline';
      }
    }
  }

  get stats(): MultiAgentStats {
    return {
      agentId: this.agentId,
      messagesSent: this.totalMessagesSent,
      messagesDelivered: this.totalMessagesDelivered,
      messagesFailed: this.totalMessagesFailed,
      totalRetries: this.totalRetries,
      totalTimeouts: this.totalTimeouts,
      totalHeartbeats: this.totalHeartbeats,
      activeMessages: this.messages.size,
      registeredAgents: this.agents.size,
      onlineAgents: this.getOnlineAgents().length,
      deliveryRate: `${((this.totalMessagesDelivered / Math.max(this.totalMessagesSent, 1)) * 100).toFixed(1)}%`,
    };
  }

  get networkMap(): string {
    const lines: string[] = [`🌐 ARK Multi-Agent Network: ${this.agentId}`];
    const statusIcons: Record<AgentStatus, string> = {
      online: '🟢',
      busy: '🟡',
      degraded: '🟠',
      offline: '🔴',
      unknown: '⚪',
    };

    for (const [, agent] of this.agents) {
      const icon = statusIcons[agent.status] ?? '❓';
      const age = (Date.now() - agent.lastSeen) / 1000;
      lines.push(
        `  ${icon} ${agent.agentId} (seen ${age.toFixed(0)}s ago, ${agent.messageCount} msgs)`,
      );
    }

    const s = this.stats;
    lines.push(`  ────`);
    lines.push(
      `  📊 Delivery: ${s.deliveryRate} | Active msgs: ${s.activeMessages}`,
    );

    return lines.join('\n');
  }
}