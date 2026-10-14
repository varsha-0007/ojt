import { useState } from "react";
import { login, signup } from "./api.js";

export default function AuthScreen({ onAuthed }) {
  const [mode, setMode] = useState("login"); // "login" | "signup"
  const [companyName, setCompanyName] = useState("");
  const [targetUrl, setTargetUrl] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const user =
        mode === "login"
          ? await login(email, password)
          : await signup(companyName, targetUrl, email, password);
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
    <div className="max-w-md mx-auto mt-16 p-6 bg-gray-900 border border-gray-800 rounded-lg shadow-xl">
      <h1 className="text-xl font-bold mb-1">API Rate Limit Control Plane</h1>
      <p className="text-sm text-gray-500 mb-6">
        {mode === "login"
          ? "Log in to your company dashboard"
          : "Register your company for rate limiting as a service"}
      </p>

      {error && (
        <div className="bg-red-900/40 border border-red-700 text-red-300 text-sm px-3 py-2 rounded mb-4">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        {mode === "signup" && (
          <>
            <label className="block">
              <span className="block text-xs text-gray-400 mb-1">Company / Organization Name *</span>
              <input
                className="input"
                type="text"
                placeholder="e.g. Acme Inc"
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                required
              />
            </label>
            {/*<label className="block">
              <span className="block text-xs text-gray-400 mb-1">
                Upstream Backend / Website URL (Optional)
              </span>
              <input
                className="input"
                type="text"
                placeholder="e.g. https://api.mycompany.com or http://localhost:3000"
                value={targetUrl}
                onChange={(e) => setTargetUrl(e.target.value)}
              />
              <span className="block text-xs text-gray-500 mt-1">
                Requests passing rate checks can automatically forward to this backend.
              </span>
            </label>*/}
          </>
        )}

        <label className="block">
          <span className="block text-xs text-gray-400 mb-1">Email Address *</span>
          <input
            className="input"
            type="email"
            placeholder="you@company.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </label>

        <label className="block">
          <span className="block text-xs text-gray-400 mb-1">Password *</span>
          <input
            className="input"
            type="password"
            placeholder="••••••••"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={6}
          />
        </label>

        <button
          type="submit"
          disabled={loading}
          className="w-full bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium py-2.5 rounded transition disabled:opacity-50"
        >
          {loading ? "Please wait..." : mode === "login" ? "Log In" : "Register Company & Create Account"}
        </button>
      </form>

      <button onClick={switchMode} className="text-xs text-gray-400 hover:text-gray-200 mt-5 block underline">
        {mode === "login" ? "Need to onboard a new company? Sign up" : "Already have a company account? Log in"}
      </button>

      {mode === "signup" && (
        <div className="text-xs text-gray-500 mt-4 p-3 bg-gray-950/60 rounded border border-gray-800">
          💡 Registering a company automatically gives you <strong>Owner</strong> privileges for your organization, allowing you to create custom policies, view real-time spike metrics, and invite team members.
        </div>
      )}
    </div>
  );
}