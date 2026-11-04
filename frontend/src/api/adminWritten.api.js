import apiClient from "./client";

// Empty filter values are not sent to the server
function clean(params) {
  return Object.fromEntries(
    Object.entries(params).filter(([, value]) => value !== "" && value !== null && value !== undefined)
  );
}

export async function fetchWrittenQuestions(params) {
  const { data } = await apiClient.get("/api/admin/written-questions", { params: clean(params) });
  return data; // { items, total, page, page_size }
}

export async function createWrittenQuestion(payload) {
  const { data } = await apiClient.post("/api/admin/written-questions", payload);
  return data;
}

export async function updateWrittenQuestion(questionId, payload) {
  const { data } = await apiClient.put(`/api/admin/written-questions/${questionId}`, payload);
  return data;
}

export async function setWrittenQuestionStatus(questionId, status) {
  const { data } = await apiClient.patch(`/api/admin/written-questions/${questionId}/status`, { status });
  return data;
}

export async function deleteWrittenQuestion(questionId) {
  await apiClient.delete(`/api/admin/written-questions/${questionId}`);
}