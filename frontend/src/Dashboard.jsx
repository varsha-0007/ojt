import { useEffect, useRef, useState } from "react";
import { apiGet } from "./api.js";

export default function Dashboard() {
  const [summary, setSummary] = useState(null);
  const [endpoints, setEndpoints] = useState([]);
  const [timeline, setTimeline] = useState([]);
  const [selectedEndpoint, setSelectedEndpoint] = useState("");
  const [minutes, setMinutes] = useState(60);
  const [error, setError] = useState("");
  const canvasRef = useRef(null);

  async function loadAll() {
    try {
      const [s, eps, tl] = await Promise.all([
        apiGet(`/metrics/summary?minutes=${minutes}`),
        apiGet(`/metrics/endpoints?minutes=${minutes}`),
        apiGet(`/metrics/timeline?minutes=${minutes}${selectedEndpoint ? `&endpoint=${encodeURIComponent(selectedEndpoint)}` : ""}`),
      ]);
      setSummary(s);
      setEndpoints(eps);
      setTimeline(tl);
      setError("");
    } catch (err) {
      setError("Could not reach backend. Check the Backend URL in Settings.");
    }
  }

  useEffect(() => {
    loadAll();
    const id = setInterval(loadAll, 3000);
    return () => clearInterval(id);
  }, [minutes, selectedEndpoint]);

  useEffect(() => {
    drawChart(canvasRef.current, timeline);
  }, [timeline]);

  const mostHit = [...endpoints].sort((a, b) => b.total - a.total).slice(0, 5);
  const leastHit = [...endpoints].sort((a, b) => a.total - b.total).slice(0, 5);

  return (
    <div>
      {error && (
        <div className="bg-red-900/40 border border-red-700 text-red-300 text-sm px-3 py-2 rounded mb-4">
          {error}
        </div>
      )}

      <div className="flex items-center justify-between mb-4">
        <span className="text-xs text-gray-500">Refreshes every 3 seconds</span>
        <select className="input w-40" value={minutes} onChange={(e) => setMinutes(Number(e.target.value))}>
          <option value={15}>Last 15 min</option>
          <option value={60}>Last 1 hour</option>
          <option value={1440}>Last 24 hours</option>
        </select>
      </div>

      {summary && (
        <div className="grid grid-cols-3 gap-4 mb-6">
          <Card label="Total Requests" value={summary.total} />
          <Card label="Allowed" value={summary.allowed} color="text-green-400" />
          <Card label="Rejected (429)" value={summary.rejected} color="text-red-400" />
        </div>
      )}

      <div className="bg-gray-900 border border-gray-800 rounded-lg p-4 mb-6">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-gray-300">Traffic Over Time (Spike Graph)</h2>
          <select className="input w-48" value={selectedEndpoint} onChange={(e) => setSelectedEndpoint(e.target.value)}>
            <option value="">All Endpoints</option>
            {endpoints.map((ep) => (
              <option key={ep.endpoint} value={ep.endpoint}>{ep.endpoint}</option>
            ))}
          </select>
        </div>
        <canvas ref={canvasRef} width={900} height={240} className="w-full bg-gray-950 rounded" />
        <p className="text-xs text-gray-500 mt-2">
          Blue = allowed requests, Red = rejected requests. Pick a specific API above to see exactly
          when it spiked and when it was quiet.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <BarBox title="Most Hit APIs" rows={mostHit} />
        <BarBox title="Least Hit APIs" rows={leastHit} />
      </div>
    </div>
  );
}

function Card({ label, value, color = "text-gray-100" }) {
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-lg p-4 text-center">
      <div className={`text-2xl font-bold ${color}`}>{value ?? 0}</div>
      <div className="text-xs text-gray-500 mt-1">{label}</div>
    </div>
  );
}

function BarBox({ title, rows }) {
  const max = Math.max(...rows.map((r) => r.total), 1);
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-lg p-4">
      <h2 className="text-sm font-semibold mb-3 text-gray-300">{title}</h2>
      {rows.length === 0 && <p className="text-gray-500 text-sm">No traffic yet.</p>}
      {rows.map((r) => (
        <div key={r.endpoint} className="flex items-center gap-2 mb-2 text-sm">
          <div className="w-32 truncate text-gray-300">{r.endpoint}</div>
          <div className="flex-1 bg-gray-950 rounded h-3">
            <div className="bg-blue-600 h-3 rounded" style={{ width: `${(r.total / max) * 100}%` }} />
          </div>
          <div className="w-8 text-right text-gray-500">{r.total}</div>
        </div>
      ))}
    </div>
  );
}

function drawChart(canvas, buckets) {
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  if (!buckets || buckets.length === 0) return;

  const maxTotal = Math.max(...buckets.map((b) => b.total), 1);
  const barWidth = canvas.width / buckets.length;
  const labelSpace = 22;
  const chartHeight = canvas.height - labelSpace;

  buckets.forEach((b, i) => {
    const barHeight = (b.total / maxTotal) * (chartHeight - 10);
    const rejectedHeight = (b.rejected / maxTotal) * (chartHeight - 10);
    const x = i * barWidth;

    ctx.fillStyle = "#3b82f6";
    ctx.fillRect(x, chartHeight - barHeight, barWidth - 1, barHeight);

    ctx.fillStyle = "#ef4444";
    ctx.fillRect(x, chartHeight - rejectedHeight, barWidth - 1, rejectedHeight);
  });

  ctx.fillStyle = "#9ca3af";
  ctx.font = "11px Arial";
  const labelCount = Math.min(6, buckets.length);
  for (let i = 0; i < labelCount; i++) {
    const idx = Math.floor((i / (labelCount - 1 || 1)) * (buckets.length - 1));
    const label = new Date(buckets[idx].time * 1000).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    const x = Math.min(idx * barWidth, canvas.width - 35);
    ctx.fillText(label, x, chartHeight + 16);
  }
}