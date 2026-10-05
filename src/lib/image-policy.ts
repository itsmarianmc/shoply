export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
export const MAX_IMAGE_DIMENSION = 8192;
export const MAX_IMAGE_PIXELS = 40_000_000;
export const MIN_IMAGE_QUOTA = 100_000_000;
export const MAX_IMAGE_QUOTA = 10_000_000_000;
export const DEFAULT_IMAGE_QUOTA = 1_000_000_000;
export const IMAGE_QUOTA_MESSAGE = "Image storage is full. Please contact your organization administrator.";

export interface ImageStorageUsage {
  usedBytes: number;
  limitBytes: number;
  fileCount: number;
}

export interface StoredImage {
  id: string;
  itemName: string;
  sizeBytes: number;
  pendingDeletion: boolean;
}

export function formatImageBytes(bytes: number): string {
  if (bytes < 1000) return `${bytes} B`;
  if (bytes < 1_000_000) return `${(bytes / 1000).toLocaleString("en-GB", { maximumFractionDigits: 1 })} KB`;
  return bytes >= 1_000_000_000
    ? `${(bytes / 1_000_000_000).toLocaleString("en-GB", { maximumFractionDigits: 2 })} GB`
    : `${(bytes / 1_000_000).toLocaleString("en-GB", { maximumFractionDigits: 2 })} MB`;
}
