import apiClient from "./client";

// Uploads can take a while: the server extracts the text before it answers
const UPLOAD_TIMEOUT_MS = 180000;

// Empty filter values are not sent to the server
function clean(params) {
  return Object.fromEntries(
    Object.entries(params).filter(([, value]) => value !== "" && value !== null && value !== undefined)
  );
}

function progressHandler(onProgress) {
  return (event) => {
    if (onProgress && event.total) onProgress(Math.round((event.loaded * 100) / event.total));
  };
}

export async function fetchMaterialOptions() {
  const { data } = await apiClient.get("/api/admin/materials/options");
  return data; // { target_exams, kinds, limits }
}

export async function fetchMaterials(params) {
  const { data } = await apiClient.get("/api/admin/materials", { params: clean(params) });
  return data; // { items, total, page, page_size }
}

export async function fetchMaterial(materialId) {
  const { data } = await apiClient.get(`/api/admin/materials/${materialId}`);
  return data;
}

export async function fetchMaterialChunks(materialId, params) {
  const { data } = await apiClient.get(`/api/admin/materials/${materialId}/chunks`, { params });
  return data;
}

export async function updateMaterial(materialId, payload) {
  const { data } = await apiClient.put(`/api/admin/materials/${materialId}`, payload);
  return data;
}

export async function deleteMaterial(materialId) {
  await apiClient.delete(`/api/admin/materials/${materialId}`);
}

export async function uploadMaterial(payload, file, onProgress) {
  const form = new FormData();
  form.append("title", payload.title);
  form.append("kind", payload.kind);
  form.append("subject_id", payload.subject_id);
  if (payload.chapter_id) form.append("chapter_id", payload.chapter_id);
  payload.exam_tags.forEach((tag) => form.append("exam_tags", tag));
  if (payload.year !== null && payload.year !== undefined) form.append("year", String(payload.year));
  if (payload.paper_type) form.append("paper_type", payload.paper_type);
  form.append("file", file);

  const { data } = await apiClient.post("/api/admin/materials", form, {
    timeout: UPLOAD_TIMEOUT_MS,
    onUploadProgress: progressHandler(onProgress),
  });
  return data;
}

// Question text pasted into a box instead of a PDF. It is saved like a previous-year PDF and then
// extracted and reviewed the same way.
export async function createMaterialFromText(payload) {
  const { data } = await apiClient.post("/api/admin/materials/text", payload, { timeout: 60000 });
  return data;
}

// Retry for a failed material: the PDF is not stored on the server, so the file is sent again
export async function reprocessMaterial(materialId, file, onProgress) {
  const form = new FormData();
  form.append("file", file);

  const { data } = await apiClient.post(`/api/admin/materials/${materialId}/reprocess`, form, {
    timeout: UPLOAD_TIMEOUT_MS,
    onUploadProgress: progressHandler(onProgress),
  });
  return data;
}