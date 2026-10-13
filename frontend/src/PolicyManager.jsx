import { useEffect, useState } from "react";
import { apiGet, apiPost, apiPut, apiPatch, apiDelete } from "./api.js";

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
  const [editingPolicy, setEditingPolicy] = useState(null);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  async function loadPolicies() {
    try {
      const data = await apiGet("/policies");
      setPolicies(data);
      setError("");
    } catch (err) {
      setError("Could not reach backend. Check your connection or settings.");
    }
  }

  useEffect(() => {
    loadPolicies();
  }, []);

  function updateField(field, value) {
    if (editingPolicy) {
      setEditingPolicy((f) => ({ ...f, [field]: value }));
    } else {
      setForm((f) => ({ ...f, [field]: value }));
    }
  }

  async function handleCreate(e) {
    e.preventDefault();
    setError("");
    setSuccess("");

    // Client-side duplicate check
    const isDuplicate = policies.some(
      (p) => p.endpoint === form.endpoint.trim() && (p.method === form.method || p.method === "*" || form.method === "*")
    );
    if (isDuplicate) {
      setError(`A policy for endpoint "${form.endpoint}" with method "${form.method}" already exists.`);
      return;
    }

    try {
      const payload = {
        ...form,
        endpoint: form.endpoint.trim(),
        capacity: Number(form.capacity),
        refill_tokens: Number(form.refill_tokens),
        refill_seconds: Number(form.refill_seconds),
        forward_url: form.forward_url.trim() || null,
      };
      await apiPost("/policies", payload);
      setForm(emptyForm);
      setSuccess(`Policy "${payload.name}" created successfully.`);
      loadPolicies();
    } catch (err) {
      setError(err.message);
    }
  }

  function startEdit(policy) {
    setError("");
    setSuccess("");
    setEditingPolicy({
      id: policy.id,
      name: policy.name,
      endpoint: policy.endpoint, // Locked / Immutable
      method: policy.method,
      capacity: policy.capacity,
      refill_tokens: policy.refill_tokens,
      refill_seconds: policy.refill_seconds,
      forward_url: policy.forward_url || "",
      enabled: policy.enabled,
    });
  }

  function cancelEdit() {
    setEditingPolicy(null);
  }

  async function handleUpdate(e) {
    e.preventDefault();
    if (!editingPolicy) return;
    setError("");
    setSuccess("");

    try {
      const payload = {
        name: editingPolicy.name,
        method: editingPolicy.method,
        capacity: Number(editingPolicy.capacity),
        refill_tokens: Number(editingPolicy.refill_tokens),
        refill_seconds: Number(editingPolicy.refill_seconds),
        forward_url: editingPolicy.forward_url.trim() || null,
        enabled: editingPolicy.enabled,
      };
      await apiPatch(`/policies/${editingPolicy.id}`, payload);
      setSuccess(`Policy "${payload.name}" updated successfully.`);
      setEditingPolicy(null);
      loadPolicies();
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
      if (editingPolicy?.id === policy.id) {
        setEditingPolicy(null);
      }
      loadPolicies();
    } catch (err) {
      setError(err.message);
    }
  }

  const activeForm = editingPolicy || form;

  return (
    <div>
      {error && (
        <div className="bg-red-900/40 border border-red-700 text-red-300 text-sm px-3 py-2 rounded mb-4">
          {error}
        </div>
      )}
      {success && (
        <div className="bg-green-900/40 border border-green-700 text-green-300 text-sm px-3 py-2 rounded mb-4">
          {success}
        </div>
      )}

      {/* Policy Form: Create or Edit */}
      <form
        onSubmit={editingPolicy ? handleUpdate : handleCreate}
        className="bg-gray-900 border border-gray-800 rounded-lg p-4 mb-6 shadow-md"
      >
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-gray-200">
            {editingPolicy ? `✏️ Edit Policy: ${editingPolicy.name}` : "➕ Create Rate Limit Policy"}
          </h2>
          {editingPolicy && (
            <button
              type="button"
              onClick={cancelEdit}
              className="text-xs text-gray-400 hover:text-gray-200 underline"
            >
              Cancel Edit
            </button>
          )}
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Field label="Policy Name">
            <input
              className="input"
              value={activeForm.name}
              onChange={(e) => updateField("name", e.target.value)}
              required
            />
          </Field>

          <Field
            label="Endpoint"
            tooltip={editingPolicy ? "Endpoint is locked to preserve target route identity." : null}
          >
            <input
              className={`input ${editingPolicy ? "bg-gray-900 border-gray-800 text-gray-500 cursor-not-allowed" : ""}`}
              value={activeForm.endpoint}
              onChange={(e) => updateField("endpoint", e.target.value)}
              disabled={Boolean(editingPolicy)}
              readOnly={Boolean(editingPolicy)}
              required
            />
          </Field>

          <Field label="HTTP Method">
            <select
              className="input"
              value={activeForm.method}
              onChange={(e) => updateField("method", e.target.value)}
            >
              <option value="*">Any (*)</option>
              <option value="GET">GET</option>
              <option value="POST">POST</option>
              <option value="PUT">PUT</option>
              <option value="DELETE">DELETE</option>
            </select>
          </Field>

          <Field label="Burst Capacity (Tokens)">
            <input
              type="number"
              min="1"
              className="input"
              value={activeForm.capacity}
              onChange={(e) => updateField("capacity", e.target.value)}
              required
            />
          </Field>

          <Field label="Refill Tokens">
            <input
              type="number"
              min="1"
              className="input"
              value={activeForm.refill_tokens}
              onChange={(e) => updateField("refill_tokens", e.target.value)}
              required
            />
          </Field>

          <Field label="Refill Seconds">
            <input
              type="number"
              min="1"
              className="input"
              value={activeForm.refill_seconds}
              onChange={(e) => updateField("refill_seconds", e.target.value)}
              required
            />
          </Field>

          <Field label="Forward URL (Optional)">
            <input
              className="input"
              placeholder="e.g. http://upstream-service:8080"
              value={activeForm.forward_url}
              onChange={(e) => updateField("forward_url", e.target.value)}
            />
          </Field>
        </div>

        <div className="flex items-center gap-3 mt-4">
          <button
            type="submit"
            className="bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium px-4 py-2 rounded transition"
          >
            {editingPolicy ? "Save Changes" : "Create Policy"}
          </button>
          {editingPolicy && (
            <button
              type="button"
              onClick={cancelEdit}
              className="border border-gray-700 hover:bg-gray-800 text-gray-300 text-sm px-4 py-2 rounded transition"
            >
              Cancel
            </button>
          )}
        </div>
      </form>

      {/* Existing Policies Table */}
      <div className="bg-gray-900 border border-gray-800 rounded-lg p-4">
        <h2 className="text-sm font-semibold mb-3 text-gray-300">Company Policies</h2>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-gray-500 text-left">
              <th className="pb-2">Name</th>
              <th className="pb-2">Endpoint</th>
              <th className="pb-2">Method</th>
              <th className="pb-2">Rate Limit</th>
              <th className="pb-2">Status</th>
              <th className="pb-2 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {policies.length === 0 && (
              <tr>
                <td colSpan="6" className="text-gray-500 py-3 text-center">
                  No policies yet. Create your first company rate limit policy above.
                </td>
              </tr>
            )}
            {policies.map((p) => (
              <tr key={p.id} className="border-t border-gray-800 hover:bg-gray-800/30">
                <td className="py-2.5 font-medium text-gray-200">{p.name}</td>
                <td className="py-2.5 font-mono text-xs text-blue-400">{p.endpoint}</td>
                <td className="py-2.5 font-mono text-xs text-gray-400">{p.method}</td>
                <td className="py-2.5 text-xs text-gray-300">
                  {p.refill_tokens} req / {p.refill_seconds}s (burst {p.capacity})
                </td>
                <td className="py-2.5">
                  <span
                    className={`inline-block px-2 py-0.5 rounded text-xs ${
                      p.enabled
                        ? "bg-green-950 text-green-400 border border-green-800"
                        : "bg-red-950 text-red-400 border border-red-800"
                    }`}
                  >
                    {p.enabled ? "Enabled" : "Disabled"}
                  </span>
                </td>
                <td className="py-2.5 text-right space-x-2">
                  <button
                    onClick={() => startEdit(p)}
                    className="text-xs bg-gray-800 hover:bg-gray-700 text-gray-200 border border-gray-700 px-2.5 py-1 rounded transition"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => handleToggle(p)}
                    className="text-xs border border-gray-700 px-2.5 py-1 rounded hover:bg-gray-800 text-gray-300 transition"
                  >
                    {p.enabled ? "Disable" : "Enable"}
                  </button>
                  <button
                    onClick={() => handleDelete(p)}
                    className="text-xs bg-red-700 hover:bg-red-600 text-white px-2.5 py-1 rounded transition"
                  >
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

function Field({ label, tooltip, children }) {
  return (
    <label className="block">
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs text-gray-400">{label}</span>
        {tooltip && <span className="text-[10px] text-amber-400/90 italic">{tooltip}</span>}
      </div>
      {children}
    </label>
  );
}