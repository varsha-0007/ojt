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
` `
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

async function apiRequest(path, method = "GET", body, hasBody = body !== undefined) {
  const headers = { ...authHeaders() };
  if (hasBody) headers["Content-Type"] = "application/json";

  const res = await fetch(getBackendUrl() + path, {
    method,
    headers,
    ...(hasBody ? { body: JSON.stringify(body) } : {}),
  });
  return handleResponse(res);
}

export const apiGet = (path) => apiRequest(path);
export const apiPost = (path, body) => apiRequest(path, "POST", body, true);
export const apiPut = (path, body) => apiRequest(path, "PUT", body, true);
export const apiPatch = (path, body) => apiRequest(path, "PATCH", body, Boolean(body));
export const apiDelete = (path) => apiRequest(path, "DELETE");

// ---------------- Auth ----------------

export async function signup(companyName, targetUrl, email, password) {
  const data = await apiPost("/auth/signup", {
    company_name: companyName,
    target_url: targetUrl || null,
    email,
    password,
  });
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

export async function recordLogout() {
  return apiPost("/auth/logout", {});
}

export function logout() {
  clearToken();
}