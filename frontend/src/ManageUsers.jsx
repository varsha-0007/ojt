import { useEffect, useState } from "react";
import { apiGet, apiPost, apiDelete } from "./api.js";

const emptyForm = { email: "", password: "", role: "viewer" };

export default function ManageUsers({ currentUser }) {
  const [users, setUsers] = useState([]);
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");

  async function loadUsers() {
    try {
      const data = await apiGet("/auth/users");
      setUsers(data);
      setError("");
    } catch (err) {
      setError(err.message);
    }
  }

  useEffect(() => {
    loadUsers();
  }, []);

  async function handleCreate(e) {
    e.preventDefault();
    setError("");
    setInfo("");
    try {
      await apiPost("/auth/users", form);
      setInfo(`Account created for ${form.email}. Share that email + password with them so they can log in.`);
      setForm(emptyForm);
      loadUsers();
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleDelete(user) {
    if (!confirm(`Remove dashboard access for "${user.email}"?`)) return;
    try {
      await apiDelete(`/auth/users/${user.id}`);
      loadUsers();
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div>
      <div className="bg-gray-900 border border-gray-800 rounded-lg p-4 mb-6">
        <h2 className="text-sm font-semibold mb-2 text-gray-300">How to give someone new access</h2>
        <p className="text-sm text-gray-500">
          Fill in the form below with their email and a password you choose, pick a role, and click
          "Create Account". Then send them the email + password directly (WhatsApp, email, etc). They
          log in with those credentials and immediately see whatever their role allows. Pick{" "}
          <span className="text-gray-300">viewer</span> for someone who should only see the Live
          Metrics tab, or <span className="text-gray-300">owner</span> for full control equal to
          yours — for example, a customer you're selling this to, who can then add their own
          employees the same way.
        </p>
      </div>

      {error && (
        <div className="bg-red-900/40 border border-red-700 text-red-300 text-sm px-3 py-2 rounded mb-4">
          {error}
        </div>
      )}
      {info && (
        <div className="bg-green-900/30 border border-green-800 text-green-300 text-sm px-3 py-2 rounded mb-4">
          {info}
        </div>
      )}

      <form onSubmit={handleCreate} className="bg-gray-900 border border-gray-800 rounded-lg p-4 mb-6">
        <h2 className="text-sm font-semibold mb-3 text-gray-300">Give Someone Access</h2>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <label className="block">
            <span className="block text-xs text-gray-500 mb-1">Email</span>
            <input
              className="input"
              type="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              required
            />
          </label>
          <label className="block">
            <span className="block text-xs text-gray-500 mb-1">Password</span>
            <input
              className="input"
              type="text"
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              required
              minLength={6}
            />
          </label>
          <label className="block">
            <span className="block text-xs text-gray-500 mb-1">Role</span>
            <select className="input" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
              <option value="viewer">Viewer (dashboard only)</option>
              <option value="owner">Owner (full access)</option>
            </select>
          </label>
        </div>
        <button type="submit" className="mt-4 bg-blue-600 hover:bg-blue-500 text-white text-sm px-4 py-2 rounded">
          Create Account
        </button>
      </form>

      <div className="bg-gray-900 border border-gray-800 rounded-lg p-4">
        <h2 className="text-sm font-semibold mb-3 text-gray-300">People With Access</h2>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-gray-500 text-left">
              <th className="pb-2">Email</th>
              <th className="pb-2">Role</th>
              <th className="pb-2">Added</th>
              <th className="pb-2"></th>
            </tr>
          </thead>
          <tbody>
            {users.length === 0 && (
              <tr>
                <td colSpan="4" className="text-gray-500 py-3">Loading...</td>
              </tr>
            )}
            {users.map((u) => (
              <tr key={u.id} className="border-t border-gray-800">
                <td className="py-2">
                  {u.email}
                  {u.id === currentUser.id ? " (you)" : ""}
                  {u.is_primary ? " — primary owner" : ""}
                </td>
                <td className="py-2 capitalize">{u.role}</td>
                <td className="py-2 text-gray-500">{new Date(u.created_at).toLocaleDateString()}</td>
                <td className="py-2">
                  {u.id !== currentUser.id && !u.is_primary && (
                    <button
                      onClick={() => handleDelete(u)}
                      className="text-xs bg-red-700 hover:bg-red-600 px-2 py-1 rounded"
                    >
                      Remove Access
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}