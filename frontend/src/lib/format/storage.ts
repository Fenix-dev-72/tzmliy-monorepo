// Backend always stores/returns raw bytes (BIGINT) -- same "canonical unit
// in the API, formatted unit in the UI" convention as money.ts's formatMoney.
export type StorageUnit = "MB" | "GB";

const MB = 1024 ** 2;
const GB = 1024 ** 3;

export function formatBytes(bytes: number): string {
  if (bytes >= GB) {
    return `${(bytes / GB).toLocaleString("en-US", { maximumFractionDigits: 1 })} GB`;
  }
  return `${(bytes / MB).toLocaleString("en-US", { maximumFractionDigits: 1 })} MB`;
}

export function bytesFromUnit(value: number, unit: StorageUnit): number {
  return Math.round(value * (unit === "GB" ? GB : MB));
}

// Picks the unit a byte value would most naturally display in, for
// pre-filling an edit form (e.g. 5368709120 -> {value: 5, unit: "GB"}).
export function unitFromBytes(bytes: number): { value: number; unit: StorageUnit } {
  if (bytes >= GB && bytes % GB === 0) {
    return { value: bytes / GB, unit: "GB" };
  }
  if (bytes >= GB) {
    return { value: Math.round((bytes / GB) * 100) / 100, unit: "GB" };
  }
  return { value: Math.round((bytes / MB) * 100) / 100, unit: "MB" };
}
