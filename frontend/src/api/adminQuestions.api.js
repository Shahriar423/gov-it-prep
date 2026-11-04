import apiClient from "./client";

// Empty filter values are not sent to the server
function clean(params) {
  return Object.fromEntries(
    Object.entries(params).filter(([, value]) => value !== "" && value !== null && value !== undefined)
  );
}

export async function adminFetchQuestions(params) {
  const { data } = await apiClient.get("/api/admin/questions", { params: clean(params) });
  return data; // { items, total, page, page_size }
}

export async function adminFetchQuestion(questionId) {
  const { data } = await apiClient.get(`/api/admin/questions/${questionId}`);
  return data;
}

export async function adminCreateQuestion(payload) {
  const { data } = await apiClient.post("/api/admin/questions", payload);
  return data;
}

export async function adminUpdateQuestion(questionId, payload) {
  const { data } = await apiClient.put(`/api/admin/questions/${questionId}`, payload);
  return data;
}

export async function adminSetQuestionStatus(questionId, status) {
  const { data } = await apiClient.patch(`/api/admin/questions/${questionId}/status`, { status });
  return data;
}

export async function adminDeleteQuestion(questionId) {
  await apiClient.delete(`/api/admin/questions/${questionId}`);
}