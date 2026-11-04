import apiClient from "./client";

export async function updateProfile(payload) {
  const { data } = await apiClient.put("/api/users/me", payload);
  return data;
}

export async function changePassword(payload) {
  const { data } = await apiClient.post("/api/users/me/password", payload);
  return data;
}

export async function uploadAvatar(file) {
  const form = new FormData();
  form.append("file", file);
  const { data } = await apiClient.post("/api/users/me/avatar", form, {
    headers: { "Content-Type": "multipart/form-data" },
  });
  return data;
}

export async function deleteAvatar() {
  const { data } = await apiClient.delete("/api/users/me/avatar");
  return data;
}