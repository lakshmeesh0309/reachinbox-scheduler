import { useEffect } from "react";
import { useAuth } from "./hooks/useAuth";
import { LoginPage, DashboardPage } from "./pages";

function App() {
  const {
    user,
    slack,
    loading,
    isAuthenticated,
    logout,
    disconnectSlack,
    refresh,
  } = useAuth();

  // Check URL query parameters (e.g. from Google OAuth or Slack OAuth redirects)
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const slackParam = urlParams.get("slack");
    const tokenParam = urlParams.get("token");

    if (slackParam || tokenParam) {
      // Clean query parameters from URL for clean navigation
      window.history.replaceState({}, document.title, window.location.pathname);
      refresh();
    }
  }, [refresh]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-950 flex flex-col items-center justify-center space-y-4">
        <div className="relative flex items-center justify-center">
          <div className="w-12 h-12 rounded-full border-2 border-indigo-500/20 border-t-indigo-500 animate-spin" />
          <div className="absolute w-5 h-5 rounded-full bg-gradient-to-tr from-indigo-500 to-violet-500 blur-sm" />
        </div>
        <p className="text-xs text-gray-400 font-medium tracking-wide">
          Connecting to ReachInbox...
        </p>
      </div>
    );
  }

  if (!isAuthenticated || !user) {
    return <LoginPage />;
  }

  return (
    <DashboardPage
      user={user}
      slack={slack}
      onLogout={logout}
      onDisconnectSlack={disconnectSlack}
    />
  );
}

export default App;
