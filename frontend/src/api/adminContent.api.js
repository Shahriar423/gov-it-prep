import apiClient from "./client";

// ----- subjects -----
export async function adminFetchSubjects() {
  const { data } = await apiClient.get("/api/admin/subjects");
  return data;
}

export async function adminCreateSubject(payload) {
  const { data } = await apiClient.post("/api/admin/subjects", payload);
  return data;
}

export async function adminUpdateSubject(subjectId, payload) {
  const { data } = await apiClient.put(`/api/admin/subjects/${subjectId}`, payload);
  return data;
}

export async function adminDeleteSubject(subjectId) {
  await apiClient.delete(`/api/admin/subjects/${subjectId}`);
}

// ----- chapters -----
export async function adminFetchChapters(subjectId) {
  const { data } = await apiClient.get(`/api/admin/subjects/${subjectId}/chapters`);
  return data;
}

export async function adminCreateChapter(subjectId, payload) {
  const { data } = await apiClient.post(`/api/admin/subjects/${subjectId}/chapters`, payload);
  return data;
}

export async function adminFetchChapter(chapterId) {
  const { data } = await apiClient.get(`/api/admin/chapters/${chapterId}`);
  return data;
}

export async function adminUpdateChapter(chapterId, payload) {
  const { data } = await apiClient.put(`/api/admin/chapters/${chapterId}`, payload);
  return data;
}

export async function adminDeleteChapter(chapterId) {
  await apiClient.delete(`/api/admin/chapters/${chapterId}`);
}