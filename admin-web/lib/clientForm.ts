// Shared bits of the client (tenant) create/edit forms. The logo follows the
// "upload only on Save" rule: picking a file only makes a local preview.
export type ClientFormFields = {
  name: string;
  address: string;
  email: string;
  phone: string;
  pib: string;
  registration_number: string;
  bank_account: string;
  logo: string;
  invoice_prefix: string;
  invoice_numbering: "auto" | "manual";
  invoice_next_seq: string; // "" = leave the counter alone
};

export const emptyClientFields: ClientFormFields = {
  name: "",
  address: "",
  email: "",
  phone: "",
  pib: "",
  registration_number: "",
  bank_account: "",
  logo: "",
  invoice_prefix: "",
  invoice_numbering: "auto",
  invoice_next_seq: "",
};

// Uploads the picked logo; returns its URL, or throws with the backend's message.
export async function uploadLogo(file: File): Promise<string> {
  const formData = new FormData();
  formData.append("file", file);
  const res = await fetch("/api/upload-image?kind=client_logo", { method: "POST", body: formData });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(typeof body.detail === "string" ? body.detail : "Upload failed");
  return body.url as string;
}

// Cleanup when the client write fails after its logo was uploaded.
export const deleteUploadedLogo = (url: string) =>
  fetch(`/api/upload-image?url=${encodeURIComponent(url)}`, { method: "DELETE" }).catch(() => {});

// Body for POST/PUT /clients (without the admin fields on create).
export function clientPayload(form: ClientFormFields, logo: string) {
  const next = Math.trunc(Number(form.invoice_next_seq));
  return {
    name: form.name.trim(),
    address: form.address,
    email: form.email,
    phone: form.phone,
    pib: form.pib,
    registration_number: form.registration_number,
    bank_account: form.bank_account,
    logo,
    invoice_prefix: form.invoice_prefix.trim().toUpperCase(),
    invoice_numbering: form.invoice_numbering,
    invoice_next_seq: form.invoice_next_seq !== "" && next >= 1 ? next : null,
  };
}
