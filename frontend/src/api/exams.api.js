import apiClient from "./client";

export async function fetchExams() {
  const { data } = await apiClient.get("/api/exams");
  return data; // { exams, active_attempt, history }
}

export async function startExam(payload) {
  const { data } = await apiClient.post("/api/exams/start", payload);
  return data; // { attempt_id }
}

export async function fetchAttempt(attemptId) {
  const { data } = await apiClient.get(`/api/exams/attempts/${attemptId}`);
  return data;
}

export async function saveAnswers(attemptId, answers) {
  const { data } = await apiClient.put(`/api/exams/attempts/${attemptId}/answers`, { answers });
  return data; // { status, remaining_seconds }
}

// Grading can take a moment on a long exam, so this request waits longer than the default
export async function submitExam(attemptId, answers) {
  const { data } = await apiClient.post(
    `/api/exams/attempts/${attemptId}/submit`,
    { answers },
    { timeout: 30000 }
  );
  return data;
}

export async function fetchResult(attemptId) {
  const { data } = await apiClient.get(`/api/exams/attempts/${attemptId}/result`);
  return data;
}