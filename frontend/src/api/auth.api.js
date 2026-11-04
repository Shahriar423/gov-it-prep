import apiClient from "./client";

export async function registerRequest(payload) {
  const { data } = await apiClient.post("/api/auth/register", payload);
  return data; // { access_token, token_type, user }
}

export async function loginRequest(payload) {
  const { data } = await apiClient.post("/api/auth/login", payload);
  return data;
}

export async function fetchMe() {
  const { data } = await apiClient.get("/api/auth/me");
  return data;
}
