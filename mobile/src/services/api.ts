import * as SecureStore from "expo-secure-store";
import { API_URL } from "../config";

const TOKEN_KEY = "peoplepay_jwt";

export async function getToken() {
  return SecureStore.getItemAsync(TOKEN_KEY);
}
export async function setToken(token: string) {
  await SecureStore.setItemAsync(TOKEN_KEY, token);
}
export async function clearToken() {
  await SecureStore.deleteItemAsync(TOKEN_KEY);
}

export async function api<T = any>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (!(init.body instanceof FormData) && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  const token = await getToken();
  if (token) headers.set("Authorization", `Bearer ${token}`);
  const res = await fetch(`${API_URL}${path}`, { ...init, headers });
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) throw Object.assign(new Error(data?.error || "Request failed"), data);
  return data as T;
}

export async function login(loginId: string, password: string) {
  const res = await api<{ token: string; user: any }>("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ login: loginId, password, portal: "staff" }),
  });
  await setToken(res.token);
  return res.user;
}
