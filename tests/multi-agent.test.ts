import { describe, it, expect } from 'vitest';
import { MultiAgentProtocol } from '../src/multi-agent.js';

describe('MultiAgentProtocol', () => {
  it('registers agents', () => {
    const proto = new MultiAgentProtocol('agent-a');
    const added = proto.registerAgent('agent-b');
    expect(added).toBe(true);
    expect(proto.stats.registeredAgents).toBe(1);
  });

  it('re-registration updates status', () => {
    const proto = new MultiAgentProtocol('agent-a');
    proto.registerAgent('agent-b', 'degraded');
    proto.registerAgent('agent-b'); // updates to online
    expect(proto.stats.registeredAgents).toBe(1);
  });

  it('sends message with pending status', () => {
    const proto = new MultiAgentProtocol('agent-a');
    proto.registerAgent('agent-b');
    const msg = proto.sendMessage('agent-b', { cmd: 'ping' });
    expect(msg.sender).toBe('agent-a');
    expect(msg.recipient).toBe('agent-b');
    expect(msg.status).toBe('delivered');
  });

  it('message fails when recipient offline', () => {
    const proto = new MultiAgentProtocol('agent-a');
    const msg = proto.sendMessage('unknown-agent', { cmd: 'ping' });
    expect(msg.status).toBe('failed');
  });

  it('acknowledge marks message', () => {
    const proto = new MultiAgentProtocol('agent-a');
    proto.registerAgent('agent-b');
    const msg = proto.sendMessage('agent-b', {});
    const ack = proto.acknowledgeMessage(msg.messageId);
    expect(ack).toBe(true);
    expect(msg.status).toBe('acknowledged');
    expect(msg.acknowledgedAt).not.toBeNull();
  });

  it('retry increases retry count', () => {
    const proto = new MultiAgentProtocol('agent-a');
    const msg = proto.sendMessage('ghost-agent', {});
    const retried = proto.retryMessage(msg.messageId);
    expect(retried).toBe(true);
    expect(msg.retryCount).toBe(1);
  });

  it('retry exhausts after maxRetries', () => {
    const proto = new MultiAgentProtocol('agent-a');
    const msg = proto.sendMessage('ghost', {}, 1); // max 1 retry
    proto.retryMessage(msg.messageId); // retry 1
    const last = proto.retryMessage(msg.messageId); // should timeout
    expect(last).toBe(false);
    expect(msg.status).toBe('timeout');
  });

  it('sendHeartbeat registers self', () => {
    const proto = new MultiAgentProtocol('self-agent');
    expect(proto.stats.registeredAgents).toBe(0);
    proto.sendHeartbeat();
    expect(proto.stats.registeredAgents).toBe(1);
    expect(proto.stats.totalHeartbeats).toBe(1);
  });

  it('checkAgentHealth returns unknown for unregistered', () => {
    const proto = new MultiAgentProtocol('a');
    expect(proto.checkAgentHealth('nobody')).toBe('unknown');
  });

  it('getOnlineAgents returns only online', () => {
    const proto = new MultiAgentProtocol('a');
    proto.registerAgent('b');
    proto.registerAgent('c', 'busy');
    const online = proto.getOnlineAgents();
    expect(online).toContain('b');
    expect(online).not.toContain('c');
  });

  it('collectGarbage cleans expired messages', () => {
    const proto = new MultiAgentProtocol('a');
    proto.registerAgent('b');
    // Send then expire by setting createdAt to past
    const msg = proto.sendMessage('b', {}, 0, 0); // ttl=0 (immediately expired)
    msg.createdAt = 0; // Ensure it's in the past
    proto.collectGarbage();
    expect(proto.stats.activeMessages).toBe(0);
  });

  it('networkMap produces output', () => {
    const proto = new MultiAgentProtocol('alpha');
    proto.registerAgent('beta');
    proto.sendHeartbeat();
    const map = proto.networkMap;
    expect(map).toContain('alpha');
    expect(map).toContain('beta');
    expect(map).toContain('Delivery');
  });

  it('stats shows delivery rate', () => {
    const proto = new MultiAgentProtocol('a');
    proto.registerAgent('b');
    proto.sendMessage('b', { x: 1 });
    const s = proto.stats;
    expect(s.deliveryRate).toBe('100.0%');
  });
});