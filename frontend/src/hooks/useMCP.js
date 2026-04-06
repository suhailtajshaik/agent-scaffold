// src/hooks/useMCP.js
import { useState, useCallback, useEffect } from "react";
import { api } from "../lib/api.js";

export function useMCP() {
  const [servers, setServers] = useState({});
  const [mcpTools, setMCPTools] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [showPanel, setShowPanel] = useState(false);

  const fetchServers = useCallback(async () => {
    try {
      setLoading(true);
      const data = await api.getMCPServers();
      setServers(data.servers || {});
      setError(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchTools = useCallback(async () => {
    try {
      const data = await api.getMCPTools();
      setMCPTools(data.tools || []);
    } catch (err) {
      // silent — tools are supplementary info
    }
  }, []);

  const addServer = useCallback(async (name, config) => {
    try {
      setLoading(true);
      setError(null);
      await api.addMCPServer({ name, config });
      await fetchServers();
      await fetchTools();
    } catch (err) {
      setError(err.message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [fetchServers, fetchTools]);

  const removeServer = useCallback(async (name) => {
    try {
      setLoading(true);
      setError(null);
      await api.removeMCPServer(name);
      await fetchServers();
      await fetchTools();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [fetchServers, fetchTools]);

  const reconnectServer = useCallback(async (name) => {
    try {
      setLoading(true);
      setError(null);
      await api.reconnectMCPServer(name);
      await fetchServers();
      await fetchTools();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [fetchServers, fetchTools]);

  const togglePanel = useCallback(() => {
    setShowPanel((prev) => !prev);
  }, []);

  // Fetch on mount
  useEffect(() => {
    fetchServers();
    fetchTools();
  }, [fetchServers, fetchTools]);

  return {
    servers,
    mcpTools,
    loading,
    error,
    showPanel,
    addServer,
    removeServer,
    reconnectServer,
    togglePanel,
    fetchServers,
  };
}
