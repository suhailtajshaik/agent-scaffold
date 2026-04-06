// src/hooks/useAgents.js
import { useState, useCallback, useEffect } from "react";
import { api } from "../lib/api.js";

export function useAgents() {
  const [agents, setAgents] = useState([]);
  const [selectedAgentId, setSelectedAgentId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchAgents = useCallback(async () => {
    try {
      setLoading(true);
      const data = await api.listAgents();
      setAgents(data.agents || []);

      // Auto-select default agent if none selected
      if (!selectedAgentId) {
        const defaultAgent = (data.agents || []).find(a => a.isDefault);
        if (defaultAgent) setSelectedAgentId(defaultAgent.id);
      }

      setError(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [selectedAgentId]);

  const createAgent = useCallback(async (data) => {
    const result = await api.createAgent(data);
    await fetchAgents();
    return result.agent;
  }, [fetchAgents]);

  const updateAgent = useCallback(async (id, data) => {
    const result = await api.updateAgent(id, data);
    await fetchAgents();
    return result.agent;
  }, [fetchAgents]);

  const deleteAgent = useCallback(async (id) => {
    await api.deleteAgent(id);
    if (selectedAgentId === id) {
      setSelectedAgentId(null); // will auto-select default on next fetch
    }
    await fetchAgents();
  }, [fetchAgents, selectedAgentId]);

  const cloneAgent = useCallback(async (id, name) => {
    const result = await api.cloneAgent(id, name);
    await fetchAgents();
    return result.agent;
  }, [fetchAgents]);

  const selectAgent = useCallback((id) => {
    setSelectedAgentId(id);
  }, []);

  // Fetch on mount
  useEffect(() => {
    fetchAgents();
  }, []); // only on mount, not on fetchAgents change

  const selectedAgent = agents.find(a => a.id === selectedAgentId) || null;

  return {
    agents,
    selectedAgentId,
    selectedAgent,
    loading,
    error,
    fetchAgents,
    createAgent,
    updateAgent,
    deleteAgent,
    cloneAgent,
    selectAgent,
  };
}
