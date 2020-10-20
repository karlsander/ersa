// some code here is copied/rewriten from https://github.com/FormidableLabs/urql/blob/main/exchanges/persisted-fetch/src/sha256.ts

async function hashDocument(query) {
  const buffer = new TextEncoder().encode(query);
  const hashed = await crypto.subtle.digest({ name: "SHA-256" }, buffer);
  const out = new Uint8Array(hashed);

  let hash = "";
  for (let i = 0, l = out.length; i < l; i++) {
    const hex = out[i].toString(16);
    hash += "00".slice(0, Math.max(0, 2 - hex.length)) + hex;
  }

  return hash;
}
