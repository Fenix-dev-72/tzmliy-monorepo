import { apiFetch } from "./client";

export type ComplaintStatus = "open" | "in_progress" | "resolved";

export interface Complaint {
  id: string;
  tenant_id: string;
  created_by_user_id: string;
  subject: string;
  message: string;
  status: ComplaintStatus;
  resolved_by_admin_id: string | null;
  resolved_at: string | null;
  created_at: string;
}

// Tenant-facing: any authenticated employee can submit one.
export function createComplaint(accessToken: string, params: { subject: string; message: string }) {
  return apiFetch<Complaint>("/api/v1/complaints", { method: "POST", accessToken, body: params });
}

// Platform-facing.
export function listComplaints(accessToken: string, status?: ComplaintStatus) {
  const query = status ? `?status=${status}` : "";
  return apiFetch<Complaint[]>(`/platform/v1/complaints${query}`, { accessToken });
}

export function updateComplaintStatus(accessToken: string, complaintId: string, status: ComplaintStatus) {
  return apiFetch<Complaint>(`/platform/v1/complaints/${complaintId}`, {
    method: "PATCH",
    accessToken,
    body: { status },
  });
}
