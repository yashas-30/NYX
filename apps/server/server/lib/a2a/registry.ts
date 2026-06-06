export interface AgentCapability {
  id: string;
  name: string;
  skills: string[];
  status: 'idle' | 'busy' | 'offline';
  endpoint?: string;
}

class A2ARegistry {
  private agents: Map<string, AgentCapability> = new Map();

  registerAgent(agent: AgentCapability) {
    this.agents.set(agent.id, agent);
  }

  deregisterAgent(agentId: string) {
    this.agents.delete(agentId);
  }

  findAgentsBySkill(skill: string): AgentCapability[] {
    return Array.from(this.agents.values()).filter(a => 
      a.skills.includes(skill) && a.status !== 'offline'
    );
  }

  updateStatus(agentId: string, status: AgentCapability['status']) {
    const agent = this.agents.get(agentId);
    if (agent) {
      agent.status = status;
      this.agents.set(agentId, agent);
    }
  }

  getAllAgents(): AgentCapability[] {
    return Array.from(this.agents.values());
  }
}

export const agentRegistry = new A2ARegistry();
