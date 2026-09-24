import { useEffect, useState } from "react";
import { apiGet, apiPost, apiPatch, apiDelete } from "./api.js";

const emptyForm = {
  name: "",
  endpoint: "/demo/login",
  method: "POST",
  capacity: 5,
  refill_tokens: 5,
  refill_seconds: 60,
  forward_url: "",
};

export default function PolicyManager() {
  const [policies, setPolicies] = useState([]);
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState("");

  async function loadPolicies() {
    try {
      const data = await apiGet("/policies");
      setPolicies(data);
      setError("");
    } catch (err) {
      setError("Could not reach backend. Check the Backend URL in Settings.");
    }
  }

  useEffect(() => {
    loadPolicies();
  }, []);

  function updateField(field, value) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  async function handleCreate(e) {
    e.preventDefault();
    try {
      const payload = {
        ...form,
        capacity: Number(form.capacity),
        refill_tokens: Number(form.refill_tokens),
        refill_seconds: Number(form.refill_seconds),
        forward_url: form.forward_url.trim() || null,
      };
      await apiPost("/policies", payload);
      setForm(emptyForm);
      loadPolicies();
      setError("");
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleToggle(policy) {
    try {
      await apiPatch(`/policies/${policy.id}/status?enabled=${!policy.enabled}`);
      loadPolicies();
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleDelete(policy) {
    if (!confirm(`Delete policy "${policy.name}"?`)) return;
    try {
      await apiDelete(`/policies/${policy.id}`);
      loadPolicies();
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div>
      {error && (
        <div className="bg-red-900/40 border border-red-700 text-red-300 text-sm px-3 py-2 rounded mb-4">
          {error}
        </div>
      )}

      <form onSubmit={handleCreate} className="bg-gray-900 border border-gray-800 rounded-lg p-4 mb-6">
        <h2 className="text-sm font-semibold mb-3 text-gray-300">Create Policy</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Field label="Name">
            <input className="input" value={form.name} onChange={(e) => updateField("name", e.target.value)} required />
          </Field>
          <Field label="Endpoint">
            <input className="input" value={form.endpoint} onChange={(e) => updateField("endpoint", e.target.value)} required />
          </Field>
          <Field label="Method">
            <select className="input" value={form.method} onChange={(e) => updateField("method", e.target.value)}>
              <option value="*">Any</option>
              <option value="GET">GET</option>
              <option value="POST">POST</option>
            </select>
          </Field>
          <Field label="Capacity">
            <input type="number" className="input" value={form.capacity} onChange={(e) => updateField("capacity", e.target.value)} />
          </Field>
          <Field label="Refill Tokens">
            <input type="number" className="input" value={form.refill_tokens} onChange={(e) => updateField("refill_tokens", e.target.value)} />
          </Field>
          <Field label="Refill Seconds">
            <input type="number" className="input" value={form.refill_seconds} onChange={(e) => updateField("refill_seconds", e.target.value)} />
          </Field>
          <Field label="Forward URL (optional)">
            <input className="input" placeholder="blank = use demo API" value={form.forward_url} onChange={(e) => updateField("forward_url", e.target.value)} />
          </Field>
        </div>
        <button type="submit" className="mt-4 bg-blue-600 hover:bg-blue-500 text-white text-sm px-4 py-2 rounded">
          Create Policy
        </button>
      </form>

      <div className="bg-gray-900 border border-gray-800 rounded-lg p-4">
        <h2 className="text-sm font-semibold mb-3 text-gray-300">Existing Policies</h2>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-gray-500 text-left">
              <th className="pb-2">Name</th>
              <th className="pb-2">Endpoint</th>
              <th className="pb-2">Limit</th>
              <th className="pb-2">Status</th>
              <th className="pb-2"></th>
            </tr>
          </thead>
          <tbody>
            {policies.length === 0 && (
              <tr>
                <td colSpan="5" className="text-gray-500 py-3">No policies yet — create one above.</td>
              </tr>
            )}
            {policies.map((p) => (
              <tr key={p.id} className="border-t border-gray-800">
                <td className="py-2">{p.name}</td>
                <td className="py-2">{p.endpoint}</td>
                <td className="py-2">{p.refill_tokens}/{p.refill_seconds}s (burst {p.capacity})</td>
                <td className="py-2">
                  <span className={p.enabled ? "text-green-400" : "text-red-400"}>
                    {p.enabled ? "Enabled" : "Disabled"}
                  </span>
                </td>
                <td className="py-2 space-x-2">
                  <button onClick={() => handleToggle(p)} className="text-xs border border-gray-700 px-2 py-1 rounded hover:bg-gray-800">
                    {p.enabled ? "Disable" : "Enable"}
                  </button>
                  <button onClick={() => handleDelete(p)} className="text-xs bg-red-700 hover:bg-red-600 px-2 py-1 rounded">
                    Delete
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <label className="block">
      <span className="block text-xs text-gray-500 mb-1">{label}</span>
      {children}
    </label>
  );
}