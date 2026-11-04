import apiClient from "./client";

// A connection test can wait through retries, so it gets a long timeout
const TEST_TIMEOUT_MS = 180000;

export async function testAiConnection() {
  const { data } = await apiClient.post("/api/admin/ai/test", null, { timeout: TEST_TIMEOUT_MS });
  return data; // { ok, message, provider, model, latency_ms }
}

export async function fetchGenerationOverview(materialId) {
  const { data } = await apiClient.get(`/api/admin/ai/materials/${materialId}/overview`);
  return data;
}

export async function startMcqGeneration(materialId, questionsPerChunk) {
  const { data } = await apiClient.post(`/api/admin/ai/materials/${materialId}/generate-mcq`, {
    questions_per_chunk: questionsPerChunk,
  });
  return data;
}

export async function resumeGenerationJob(jobId) {
  const { data } = await apiClient.post(`/api/admin/ai/jobs/${jobId}/resume`);
  return data;
}

export async function stopGenerationJob(jobId) {
  const { data } = await apiClient.post(`/api/admin/ai/jobs/${jobId}/stop`);
  return data;
}

export async function fetchGeneratedQuestions(materialId, params) {
  const { data } = await apiClient.get(`/api/admin/ai/materials/${materialId}/questions`, { params });
  return data; // { items, total, page, page_size }
}