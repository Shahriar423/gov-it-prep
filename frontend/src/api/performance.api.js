import apiClient from "./client";

export async function fetchChapterPerformance() {
  const { data } = await apiClient.get("/api/performance/chapters");
  return data;
}

export async function fetchWrittenPrep(params = {}) {
  const { data } = await apiClient.get("/api/performance/written", { params });
  return data;
}

export async function updateWrittenPrep(questionId, payload) {
  const { data } = await apiClient.put(`/api/performance/written/${questionId}`, payload);
  return data;
}