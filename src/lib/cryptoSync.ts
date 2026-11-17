import type { SignedPlaybackPacket } from '../types/media';

function bytesToB64(value: ArrayBuffer | Uint8Array): string {
  const bytes = value instanceof Uint8Array ? value : new Uint8Array(value);
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
}

function b64ToBytes(value: string): Uint8Array<ArrayBuffer> {
  const binary = atob(String(value || ''));
  const buffer = new ArrayBuffer(binary.length);
  const bytes = new Uint8Array(buffer);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

export function hostKeyStorageName(roomId: string): string {
  return `amstream.room.host-key.v1:${roomId}`;
}

export interface GeneratedHostKeyPair {
  publicKey: string;
  privateKey: string;
  cryptoPrivateKey: CryptoKey;
}

export async function generateHostKeyPair(): Promise<GeneratedHostKeyPair> {
  if (!window.crypto?.subtle) {
    throw new Error('This browser does not support Web Crypto ECDSA signing for Watch Rooms.');
  }
  const pair = await crypto.subtle.generateKey(
    { name: 'ECDSA', namedCurve: 'P-256' },
    true,
    ['sign', 'verify']
  );
  const spki = await crypto.subtle.exportKey('spki', pair.publicKey);
  const pkcs8 = await crypto.subtle.exportKey('pkcs8', pair.privateKey);
  return {
    publicKey: bytesToB64(spki),
    privateKey: bytesToB64(pkcs8),
    cryptoPrivateKey: pair.privateKey,
  };
}

export function saveHostKeyToSession(roomId: string, publicKey: string, privateKey: string): void {
  sessionStorage.setItem(hostKeyStorageName(roomId), JSON.stringify({ publicKey, privateKey }));
}

export function clearHostKeyFromSession(roomId: string): void {
  try {
    sessionStorage.removeItem(hostKeyStorageName(roomId));
  } catch {
    // ignore storage errors
  }
}

export async function loadHostPrivateKey(
  roomId: string
): Promise<{ publicKey: string; cryptoPrivateKey: CryptoKey } | null> {
  try {
    const raw = sessionStorage.getItem(hostKeyStorageName(roomId));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed?.privateKey || !parsed?.publicKey) return null;
    const cryptoPrivateKey = await crypto.subtle.importKey(
      'pkcs8',
      b64ToBytes(parsed.privateKey),
      { name: 'ECDSA', namedCurve: 'P-256' },
      false,
      ['sign']
    );
    return { publicKey: parsed.publicKey, cryptoPrivateKey };
  } catch {
    return null;
  }
}

export async function importGuestVerifyKey(publicKeyB64: string): Promise<CryptoKey | null> {
  if (!publicKeyB64) return null;
  try {
    return await crypto.subtle.importKey(
      'spki',
      b64ToBytes(publicKeyB64),
      { name: 'ECDSA', namedCurve: 'P-256' },
      false,
      ['verify']
    );
  } catch {
    return null;
  }
}

export async function signPlaybackPacket(
  unsignedPayload: Omit<SignedPlaybackPacket, 'signature'>,
  privateKey: CryptoKey
): Promise<SignedPlaybackPacket> {
  const encoded = new TextEncoder().encode(JSON.stringify(unsignedPayload));
  const sigBuf = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, privateKey, encoded);
  return {
    ...unsignedPayload,
    signature: bytesToB64(sigBuf),
  };
}

export async function verifyPlaybackPacket(
  packet: SignedPlaybackPacket,
  expectedHostUid: string,
  verifyKey: CryptoKey
): Promise<boolean> {
  if (!packet || packet.host_uid !== expectedHostUid || !packet.signature) return false;
  try {
    const { signature, ...unsigned } = packet;
    const encoded = new TextEncoder().encode(JSON.stringify(unsigned));
    return await crypto.subtle.verify(
      { name: 'ECDSA', hash: 'SHA-256' },
      verifyKey,
      b64ToBytes(signature),
      encoded
    );
  } catch {
    return false;
  }
}
