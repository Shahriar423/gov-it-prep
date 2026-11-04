import apiClient from "./client";

export async function fetchExamStructure() {
  const { data } = await apiClient.get("/api/admin/exam-structure");
  return data;
}

export async function seedExamStructure() {
  const { data } = await apiClient.post("/api/admin/exam-structure/seed");
  return data; // { created_subjects, created_chapters, structure }
}