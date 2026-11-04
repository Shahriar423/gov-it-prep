import apiClient from "./client";

export async function fetchSubjects() {
  const { data } = await apiClient.get("/api/subjects");
  return data;
}

export async function fetchSubject(subjectId) {
  const { data } = await apiClient.get(`/api/subjects/${subjectId}`);
  return data;
}

export async function fetchChapter(chapterId) {
  const { data } = await apiClient.get(`/api/chapters/${chapterId}`);
  return data;
}

export async function setChapterCompletion(chapterId, completed) {
  const { data } = await apiClient.put(`/api/chapters/${chapterId}/completion`, { completed });
  return data;
}