import "server-only";

const DEFAULT_VAPID_SUBJECT = "mailto:contact@itsmarian.dev";

export function getVapidPublicKey(): string | null {
  const publicKey = process.env.VAPID_PUBLIC_KEY?.trim();
  const privateKey = process.env.VAPID_PRIVATE_KEY?.trim();
  return publicKey && privateKey ? publicKey : null;
}

export function getVapidConfig(): {
  publicKey: string;
  privateKey: string;
  subject: string;
} | null {
  const publicKey = process.env.VAPID_PUBLIC_KEY?.trim();
  const privateKey = process.env.VAPID_PRIVATE_KEY?.trim();
  if (!publicKey || !privateKey) return null;

  return {
    publicKey,
    privateKey,
    subject: process.env.VAPID_SUBJECT?.trim() || DEFAULT_VAPID_SUBJECT,
  };
}

export { DEFAULT_VAPID_SUBJECT };
