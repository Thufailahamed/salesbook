/** Time-sortable 26-char ids (ULID-style, Crockford base32). */
const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

export function newId(): string {
  let time = Date.now();
  let ts = "";
  for (let i = 0; i < 10; i++) {
    ts = ALPHABET[time % 32] + ts;
    time = Math.floor(time / 32);
  }
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  let rand = "";
  for (let i = 0; i < 16; i++) rand += ALPHABET[bytes[i]! % 32];
  return ts + rand;
}

/** Human-friendly random code (no ambiguous chars), e.g. for gift cards. */
export function randomCode(length = 12): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  let out = "";
  for (let i = 0; i < length; i++) out += alphabet[bytes[i]! % alphabet.length];
  return out;
}
