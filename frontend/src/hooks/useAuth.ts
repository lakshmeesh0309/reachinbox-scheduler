import { useState, useEffect, useCallback } from "react";
import type { AuthUser, SlackStatus } from "../types/auth";
import {
  fetchCurrentUser,
  initiateGoogleLogin,
  logoutUser,
  fetchSlackStatus,
  initiateSlackConnect,
  disconnectSlack,
} from "../services/auth";

export function useAuth() {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [slack, setSlack] = useState<SlackStatus>({
    connected: false,
    teamName: null,
    teamId: null,
    connectedAt: null,
  });
  const [loading, setLoading] = useState(true);

  const refreshUser = useCallback(async () => {
    setLoading(true);
    const currentUser = await fetchCurrentUser();
    setUser(currentUser);

    if (currentUser) {
      const slackStatus = await fetchSlackStatus();
      setSlack(slackStatus);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    refreshUser();
  }, [refreshUser]);

  const handleLogout = useCallback(async () => {
    await logoutUser();
    setUser(null);
    setSlack({
      connected: false,
      teamName: null,
      teamId: null,
      connectedAt: null,
    });
  }, []);

  const handleDisconnectSlack = useCallback(async () => {
    const success = await disconnectSlack();
    if (success) {
      setSlack({
        connected: false,
        teamName: null,
        teamId: null,
        connectedAt: null,
      });
    }
  }, []);

  return {
    user,
    slack,
    loading,
    isAuthenticated: !!user,
    loginWithGoogle: initiateGoogleLogin,
    logout: handleLogout,
    connectSlack: initiateSlackConnect,
    disconnectSlack: handleDisconnectSlack,
    refresh: refreshUser,
  };
}
