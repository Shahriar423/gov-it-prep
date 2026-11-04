import apiClient from "./client";

// Empty filter values are not sent to the server
function clean(params) {
  return Object.fromEntries(
    Object.entries(params).filter(([, value]) => value !== "" && value !== null && value !== undefined)
  );
}

export async function fetchRevisionSummary() {
  const { data } = await apiClient.get("/api/revision/summary");
  return data;
}

export async function fetchRevisionItems(params) {
  const { data } = await apiClient.get("/api/revision/items", { params: clean(params) });
  return data; // { items, total, page, page_size }
}

export async function startRevision(payload) {
  const { data } = await apiClient.post("/api/revision/start", payload);
  return data; // { questions }
}