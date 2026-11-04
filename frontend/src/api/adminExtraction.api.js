import apiClient from "./client";

// Empty filter values are not sent to the server
function clean(params) {
  return Object.fromEntries(
    Object.entries(params).filter(([, value]) => value !== "" && value !== null && value !== undefined)
  );
}

// ---------------------------------------------------------------- previous-year PDFs
export async function fetchPyqMaterials(params) {
  const { data } = await apiClient.get("/api/admin/extraction/materials", { params: clean(params) });
  return data; // { items, total, page, page_size, summary }
}

export async function fetchPyqMaterial(materialId) {
  const { data } = await apiClient.get(`/api/admin/extraction/materials/${materialId}`);
  return data;
}

export async function startExtraction(materialId) {
  const { data } = await apiClient.post(`/api/admin/extraction/materials/${materialId}/start`);
  return data;
}

export async function setPaperType(materialId, paperType) {
  const { data } = await apiClient.post(`/api/admin/extraction/materials/${materialId}/paper-type`, null, {
    params: { paper_type: paperType },
  });
  return data;
}

export async function resumeExtraction(jobId) {
  const { data } = await apiClient.post(`/api/admin/extraction/jobs/${jobId}/resume`);
  return data;
}

export async function stopExtraction(jobId) {
  const { data } = await apiClient.post(`/api/admin/extraction/jobs/${jobId}/stop`);
  return data;
}

// ---------------------------------------------------------------- reviewing extracted MCQs
export async function fetchExtractedQuestions(materialId, params) {
  const { data } = await apiClient.get(`/api/admin/extraction/materials/${materialId}/questions`, {
    params: clean(params),
  });
  return data; // { items, total, page, page_size, counts }
}

export async function updateExtractedQuestion(questionId, payload) {
  const { data } = await apiClient.put(`/api/admin/extraction/questions/${questionId}`, payload);
  return data;
}

export async function approveExtractedQuestion(questionId) {
  const { data } = await apiClient.post(`/api/admin/extraction/questions/${questionId}/approve`);
  return data;
}

export async function rejectExtractedQuestion(questionId, reason = "") {
  const { data } = await apiClient.post(`/api/admin/extraction/questions/${questionId}/reject`, { reason });
  return data;
}

export async function restoreExtractedQuestion(questionId) {
  const { data } = await apiClient.post(`/api/admin/extraction/questions/${questionId}/restore`);
  return data;
}

export async function approveCleanQuestions(materialId) {
  const { data } = await apiClient.post(`/api/admin/extraction/materials/${materialId}/approve-clean`);
  return data; // { approved, skipped, more }
}

// ---------------------------------------------------------------- reviewing extracted written questions
export async function fetchExtractedWritten(materialId, params) {
  const { data } = await apiClient.get(`/api/admin/extraction/written/materials/${materialId}/questions`, {
    params: clean(params),
  });
  return data; // { items, total, page, page_size, counts }
}

export async function updateExtractedWritten(questionId, payload) {
  const { data } = await apiClient.put(`/api/admin/extraction/written/questions/${questionId}`, payload);
  return data;
}

export async function approveExtractedWritten(questionId) {
  const { data } = await apiClient.post(`/api/admin/extraction/written/questions/${questionId}/approve`);
  return data;
}

export async function rejectExtractedWritten(questionId, reason = "") {
  const { data } = await apiClient.post(`/api/admin/extraction/written/questions/${questionId}/reject`, { reason });
  return data;
}

export async function restoreExtractedWritten(questionId) {
  const { data } = await apiClient.post(`/api/admin/extraction/written/questions/${questionId}/restore`);
  return data;
}

export async function approveCleanWritten(materialId) {
  const { data } = await apiClient.post(`/api/admin/extraction/written/materials/${materialId}/approve-clean`);
  return data; // { approved, skipped, more }
}