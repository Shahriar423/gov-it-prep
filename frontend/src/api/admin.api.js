import apiClient from "./client";

export async function adminPing() {
  const { data } = await apiClient.get("/api/admin/ping");
  return data;
}
