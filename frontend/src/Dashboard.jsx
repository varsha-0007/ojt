import { useEffect, useRef, useState } from "react";
import { apiGet } from "./api.js";

export default function Dashboard() {
  const [summary, setSummary] = useState(null);
  const [policies, setPolicies] = useState([]);
  const [endpoints, setEndpoints] = useState([]);
  const [timeline, setTimeline] = useState([]);
  const [selectedEndpoint, setSelectedEndpoint] = useState("");
  const [minutes, setMinutes] = useState(60);
  const [error, setError] = useState("");
  const [hoveredBucket, setHoveredBucket] = useState(null);
  const canvasRef = useRef(null);

  async function loadAll() {
    try {
      const [s, eps, tl, pols] = await Promise.all([
        apiGet(`/metrics/summary?minutes=${minutes}`),
        apiGet(`/metrics/endpoints?minutes=${minutes}`),
        apiGet(`/metrics/timeline?minutes=${minutes}${selectedEndpoint ? `&endpoint=${encodeURIComponent(selectedEndpoint)}` : ""}`),
        apiGet("/policies").catch(() => []),
      ]);
      setSummary(s);
      setEndpoints(eps);
      setTimeline(tl);
      setPolicies(pols || []);
      setError("");
    } catch (err) {
      setError(`Could not load dashboard data: ${err.message}`);
    }
  }

  useEffect(() => {
    loadAll();
    const id = setInterval(loadAll, 1500);
    return () => clearInterval(id);
  }, [minutes, selectedEndpoint]);

  useEffect(() => {
    drawChart(canvasRef.current, timeline);
  }, [timeline]);

  const mostHit = [...endpoints].sort((a, b) => b.total - a.total);
  const leastHit = [...endpoints].sort((a, b) => a.total - b.total);

  function handleChartMouseMove(event) {
    const rect = event.currentTarget.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const index = Math.min(timeline.length - 1, Math.floor((x / rect.width) * timeline.length));
    if (index < 0 || !timeline[index]) {
      setHoveredBucket(null);
      return;
    }
    setHoveredBucket({
      bucket: timeline[index],
      left: Math.min(Math.max((x / rect.width) * 100, 12), 88),
    });
  }

  return (
    <div>
      {error && (
        <div className="bg-red-900/40 border border-red-700 text-red-300 text-sm px-3 py-2 rounded mb-4">
          {error}
        </div>
      )}

      <div className="flex items-center justify-between mb-4">
        <span className="text-xs text-gray-500">Refreshes every 1.5 seconds</span>
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
          <select className="input w-56 text-sm" value={selectedEndpoint} onChange={(e) => setSelectedEndpoint(e.target.value)}>
            <option value="">All Endpoints</option>
            {policies.map((p) => (
              <option key={p.id} value={p.endpoint}>{p.endpoint} ({p.name})</option>
            ))}
            {endpoints
              .filter((ep) => !policies.some((p) => p.endpoint === ep.endpoint))
              .map((ep) => (
                <option key={ep.endpoint} value={ep.endpoint}>{ep.endpoint}</option>
              ))}
          </select>
        </div>
        <div className="relative">
          <canvas
            ref={canvasRef}
            width={900}
            height={240}
            className="w-full bg-gray-950 rounded cursor-crosshair"
            onMouseMove={handleChartMouseMove}
            onMouseLeave={() => setHoveredBucket(null)}
          />
          {hoveredBucket && (
            <div
              className="absolute z-10 top-2 min-w-48 max-w-72 rounded border border-gray-700 bg-gray-900/95 p-3 text-xs shadow-lg pointer-events-none"
              style={{ left: `${hoveredBucket.left}%`, transform: "translateX(-50%)" }}
            >
              <div className="font-semibold text-gray-100 mb-2">
                {new Date(hoveredBucket.bucket.time * 1000).toLocaleString()}
              </div>
              <div className="flex justify-between gap-4">
                <span className="text-gray-300">Total</span>
                <span>{hoveredBucket.bucket.total}</span>
              </div>
              <div className="flex justify-between gap-4">
                <span className="text-blue-400">Allowed</span>
                <span>{hoveredBucket.bucket.allowed}</span>
              </div>
              <div className="flex justify-between gap-4 mb-2">
                <span className="text-red-400">Rejected</span>
                <span>{hoveredBucket.bucket.rejected}</span>
              </div>
              <div className="border-t border-gray-700 pt-2 font-medium text-gray-300">APIs hit</div>
              {(hoveredBucket.bucket.endpoints || []).length > 0 ? (
                <>
                  {(hoveredBucket.bucket.endpoints || []).slice(0, 5).map((item) => {
                    const apiLabel = `${item.method || "API"} ${item.endpoint}`;
                    return (
                      <div key={apiLabel} className="mt-1">
                        <div className="truncate text-gray-200" title={apiLabel}>{apiLabel}</div>
                        <div className="text-gray-400">
                          {item.total} total · {item.allowed} allowed · {item.rejected} rejected
                        </div>
                      </div>
                    );
                  })}
                  {(hoveredBucket.bucket.endpoints || []).length > 5 && (
                    <div className="mt-1 text-gray-500">
                      +{hoveredBucket.bucket.endpoints.length - 5} more APIs
                    </div>
                  )}
                </>
              ) : (
                <div className="mt-1 text-gray-500">No API requests in this time bucket.</div>
              )}
            </div>
          )}
        </div>
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
      <div className="max-h-64 overflow-y-auto pr-2">
        {rows.map((r) => (
          <div key={r.endpoint} className="flex items-center gap-2 mb-2 text-sm">
            <div className="w-32 truncate text-gray-300" title={r.endpoint}>{r.endpoint}</div>
            <div className="flex-1 bg-gray-950 rounded h-3">
              <div className="bg-blue-600 h-3 rounded" style={{ width: `${(r.total / max) * 100}%` }} />
            </div>
            <div className="w-8 text-right text-gray-500">{r.total}</div>
          </div>
        ))}
      </div>
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
    const allowedHeight = ((b.total - b.rejected) / maxTotal) * (chartHeight - 10);
    const rejectedHeight = (b.rejected / maxTotal) * (chartHeight - 10);
    const x = i * barWidth;

    ctx.fillStyle = "#3b82f6";
    ctx.fillRect(x, chartHeight - allowedHeight, Math.max(1, barWidth - 1), allowedHeight);

    ctx.fillStyle = "#ef4444";
    ctx.fillRect(
      x,
      chartHeight - allowedHeight - rejectedHeight,
      Math.max(1, barWidth - 1),
      rejectedHeight,
    );
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