import apiClient from "./client";

export async function adminFetchExams() {
  const { data } = await apiClient.get("/api/admin/exams");
  return data;
}

export async function adminFetchExam(examId) {
  const { data } = await apiClient.get(`/api/admin/exams/${examId}`);
  return data;
}

export async function adminCreateExam(payload) {
  const { data } = await apiClient.post("/api/admin/exams", payload);
  return data;
}

export async function adminUpdateExam(examId, payload) {
  const { data } = await apiClient.put(`/api/admin/exams/${examId}`, payload);
  return data;
}

export async function adminDeleteExam(examId) {
  await apiClient.delete(`/api/admin/exams/${examId}`);
}