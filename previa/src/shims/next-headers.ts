// "next/headers" na prévia.
import { cookieStore, requestHeaders } from "../runtime/request";

export async function cookies() {
  return cookieStore;
}

export async function headers() {
  return requestHeaders();
}

export async function draftMode() {
  return { isEnabled: false, enable() {}, disable() {} };
}
