const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || "http://localhost:8000";

export function getBackendUrl() {
  return localStorage.getItem("backendUrl") || BACKEND_URL;
}

export function setBackendUrl(url) {
  localStorage.setItem("backendUrl", url);
}

export function getToken() {
  return localStorage.getItem("authToken") || "";
}

export function setToken(token) {
  localStorage.setItem("authToken", token);
}

export function clearToken() {
  localStorage.removeItem("authToken");
}

function authHeaders() {
  const token = getToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function handleResponse(res) {
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.detail || `Request failed (${res.status})`);
  }
  return res.json();
}

export async function apiGet(path) {
  const res = await fetch(getBackendUrl() + path, {
    headers: { ...authHeaders() },
  });
  return handleResponse(res);
}

export async function apiPost(path, body) {
  const res = await fetch(getBackendUrl() + path, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify(body),
  });
  return handleResponse(res);
}

export async function apiPatch(path) {
  const res = await fetch(getBackendUrl() + path, {
    method: "PATCH",
    headers: { ...authHeaders() },
  });
  return handleResponse(res);
}

export async function apiDelete(path) {
  const res = await fetch(getBackendUrl() + path, {
    method: "DELETE",
    headers: { ...authHeaders() },
  });
  return handleResponse(res);
}

// ---------------- Auth ----------------

export async function signup(email, password) {
  const data = await apiPost("/auth/signup", { email, password });
  setToken(data.access_token);
  return data.user;
}

export async function login(email, password) {
  const data = await apiPost("/auth/login", { email, password });
  setToken(data.access_token);
  return data.user;
}

export async function fetchCurrentUser() {
  return apiGet("/auth/me");
}

export function logout() {
  clearToken();
}