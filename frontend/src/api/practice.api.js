import apiClient from "./client";

export async function fetchPracticeOptions() {
  const { data } = await apiClient.get("/api/practice/options");
  return data;
}

export async function fetchPracticeStats() {
  const { data } = await apiClient.get("/api/practice/stats");
  return data;
}

export async function startPractice(settings) {
  const { data } = await apiClient.post("/api/practice/start", settings);
  return data; // { questions }
}

export async function submitAnswer(payload) {
  const { data } = await apiClient.post("/api/practice/answer", payload);
  return data;
}