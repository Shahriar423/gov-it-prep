import apiClient from "./client";

export async function fetchBuilder() {
  const { data } = await apiClient.get("/api/exams/builder");
  return data; // { categories, active_exam }
}

export async function checkAvailability(params) {
  const { data } = await apiClient.get("/api/exams/availability", { params });
  return data; // { ok, type, requested, available, parts, message }
}

export async function createExam(payload) {
  const { data } = await apiClient.post("/api/exams/create", payload);
  return data; // { type, id }
}

export async function fetchWrittenSession(sessionId) {
  const { data } = await apiClient.get(`/api/exams/written/${sessionId}`);
  return data;
}

export async function finishWrittenSession(sessionId) {
  const { data } = await apiClient.post(`/api/exams/written/${sessionId}/finish`);
  return data;
}