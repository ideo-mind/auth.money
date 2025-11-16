import base64url from "base64url";
import { Buffer } from "buffer";

export function base64UrlDecodeUsingBufferByBase64(input: String) {
  return Buffer.from(
    // input.replace(/-/g, "+").replace(/_/g, "/"),
    "base64",
  ).toString("ascii");
}

export function base64UrlDecodeUsingBuffer(input: String) {
  return Buffer.from(
    input.replace(/-/g, "+").replace(/_/g, "/"),
    "base64",
  ).toString("ascii");
}
// export function base64UrlDecodeUsingBuffer(input:string) {
//   // return Buffer.from(
//   //   input,
//   //   "base64url",
//   // ).toString("ascii");

//   return base64url.decode(input);

// }

export function convertToBase64Url(inputText: string): string {
  const base64 = btoa(inputText);
  // return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return base64;
}

export function bufferToBase64URL(buffer: Buffer) {
  const bytes = new Uint8Array(buffer);
  let str = "";
  for (const byte of bytes) {
    str += String.fromCharCode(byte);
  }
  return btoa(str).replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}

export function base64URLToBuffer(base64URL: string) {
  const base64 = base64URL.replace(/-/g, "+").replace(/_/g, "/");
  const padLen = (4 - (base64.length % 4)) % 4;
  const padded = base64.padEnd(base64.length + padLen, "=");
  const binary = atob(padded);
  const buffer = new ArrayBuffer(binary.length);
  const bytes = new Uint8Array(buffer);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return buffer;
}
