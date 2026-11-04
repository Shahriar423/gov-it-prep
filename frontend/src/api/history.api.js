import apiClient from "./client";

/**
 * Fetch paginated exam history with optional filters.
 * @param {object} params - { exam_type, status, q, date_from, date_to, page, page_size, sort }
 */
export async function fetchExamHistory(params = {}) {
  const { data } = await apiClient.get("/api/exams/history", { params });
  return data; // { items, total, page, page_size, stats }
}

export async function fetchExamAnalytics() {
  const { data } = await apiClient.get("/api/exams/history/analytics");
  return data;
}

export async function fetchWrittenHistoryDetail(sessionId) {
  const { data } = await apiClient.get(`/api/exams/history/written/${sessionId}`);
  return data;
}