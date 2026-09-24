import { useEffect, useState } from "react";
import Dashboard from "./Dashboard.jsx";
import PolicyManager from "./PolicyManager.jsx";
import ManageUsers from "./ManageUsers.jsx";
import AuthScreen from "./AuthScreen.jsx";
import { getBackendUrl, setBackendUrl, getToken, fetchCurrentUser, logout } from "./api.js";

export default function App() {
  const [user, setUser] = useState(null);
  const [checkingSession, setCheckingSession] = useState(true);
  const [tab, setTab] = useState("dashboard");
  const [backendUrlInput, setBackendUrlInput] = useState(getBackendUrl());

  useEffect(() => {
    async function restoreSession() {
      if (!getToken()) {
        setCheckingSession(false);
        return;
      }
      try {
        const me = await fetchCurrentUser();
        setUser(me);
      } catch {
        logout();
      } finally {
        setCheckingSession(false);
      }
    }
    restoreSession();
  }, []);

  function saveBackendUrl() {
    setBackendUrl(backendUrlInput.trim());
    window.location.reload();
  }

  function handleLogout() {
    logout();
    setUser(null);
    setTab("dashboard");
  }

  if (checkingSession) {
    return <div className="max-w-5xl mx-auto p-6 text-gray-500 text-sm">Loading...</div>;
  }

  if (!user) {
    return <AuthScreen onAuthed={setUser} />;
  }

  const isOwner = user.role === "owner";

  return (
    <div className="max-w-5xl mx-auto p-6">
      <div className="flex items-start justify-between mb-1">
        <div>
          <h1 className="text-xl font-bold">API Rate Limit Control Plane</h1>
          <p className="text-sm text-gray-500 mb-6">
            Logged in as {user.email} ({user.role})
          </p>
        </div>
        <button
          onClick={handleLogout}
          className="text-xs border border-gray-700 px-3 py-1.5 rounded hover:bg-gray-800"
        >
          Log Out
        </button>
      </div>

      <div className="bg-gray-900 border border-gray-800 rounded-lg p-4 mb-6 flex gap-3 items-end">
        <label className="block flex-1">
          <span className="block text-xs text-gray-500 mb-1">Backend URL</span>
          <input className="input" value={backendUrlInput} onChange={(e) => setBackendUrlInput(e.target.value)} />
        </label>
        <button onClick={saveBackendUrl} className="bg-blue-600 hover:bg-blue-500 text-white text-sm px-4 py-2 rounded">
          Save
        </button>
      </div>

      <div className="flex gap-2 mb-6 border-b border-gray-800">
        <TabButton active={tab === "dashboard"} onClick={() => setTab("dashboard")}>
          Live Metrics
        </TabButton>
        {isOwner && (
          <TabButton active={tab === "policies"} onClick={() => setTab("policies")}>
            Policy Management
          </TabButton>
        )}
        {isOwner && (
          <TabButton active={tab === "users"} onClick={() => setTab("users")}>
            Manage Access
          </TabButton>
        )}
      </div>

      {tab === "dashboard" && <Dashboard />}
      {tab === "policies" && isOwner && <PolicyManager />}
      {tab === "users" && isOwner && <ManageUsers currentUser={user} />}
    </div>
  );
}

function TabButton({ active, onClick, children }) {
  return (
    <button
      onClick={onClick}
      className={`px-4 py-2 text-sm border-b-2 ${active ? "border-blue-500 text-gray-100" : "border-transparent text-gray-500"}`}
    >
      {children}
    </button>
  );
}