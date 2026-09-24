import { useState } from "react";
import { login, signup } from "./api.js";

export default function AuthScreen({ onAuthed }) {
  const [mode, setMode] = useState("login"); // "login" | "signup"
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const user = mode === "login" ? await login(email, password) : await signup(email, password);
      onAuthed(user);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  function switchMode() {
    setMode(mode === "login" ? "signup" : "login");
    setError("");
  }

  return (
    <div className="max-w-sm mx-auto mt-24 p-6 bg-gray-900 border border-gray-800 rounded-lg">
      <h1 className="text-lg font-bold mb-1">API Rate Limit Control Plane</h1>
      <p className="text-sm text-gray-500 mb-6">
        {mode === "login" ? "Log in to view the dashboard" : "Create an account to view the dashboard"}
      </p>

      {error && (
        <div className="bg-red-900/40 border border-red-700 text-red-300 text-sm px-3 py-2 rounded mb-4">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-3">
        <label className="block">
          <span className="block text-xs text-gray-500 mb-1">Email</span>
          <input
            className="input"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </label>
        <label className="block">
          <span className="block text-xs text-gray-500 mb-1">Password</span>
          <input
            className="input"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={6}
          />
        </label>
        <button
          type="submit"
          disabled={loading}
          className="w-full bg-blue-600 hover:bg-blue-500 text-white text-sm px-4 py-2 rounded disabled:opacity-50"
        >
          {loading ? "Please wait..." : mode === "login" ? "Log In" : "Sign Up"}
        </button>
      </form>

      <button onClick={switchMode} className="text-xs text-gray-500 hover:text-gray-300 mt-4 underline">
        {mode === "login" ? "Need an account? Sign up" : "Already have an account? Log in"}
      </button>

      {mode === "signup" && (
        <p className="text-xs text-gray-600 mt-3">
          Note: the very first account created on a fresh deployment automatically becomes the
          "owner" account with full access (Live Metrics + Policy Management + Manage Access).
          Every account created after that is a normal viewer, unless an owner upgrades it later.
        </p>
      )}
    </div>
  );
}