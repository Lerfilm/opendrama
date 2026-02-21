/**
 * Volcengine API HMAC-SHA256 signing utility.
 * Used by Jimeng AI (即梦) video/image generation APIs.
 *
 * Reference: https://www.volcengine.com/docs/6369/67270
 */

import crypto from "crypto"

const REGION = "cn-north-1"
const SERVICE = "cv"
const HOST = "visual.volcengineapi.com"

function hmac(secret: string | Buffer, data: string): Buffer {
  return crypto.createHmac("sha256", secret).update(data, "utf8").digest()
}

function sha256(data: string): string {
  return crypto.createHash("sha256").update(data, "utf8").digest("hex")
}

function getDateTimeNow(): string {
  // Remove dashes, colons, and milliseconds from ISO 8601 string
  // e.g. "2026-02-21T11:03:12.000Z" → "20260221T110312Z"
  return new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "")
}

function uriEscape(str: string): string {
  try {
    return encodeURIComponent(str)
      .replace(/[^A-Za-z0-9_.~\-%]+/g, escape)
      .replace(/[*]/g, (ch) => `%${ch.charCodeAt(0).toString(16).toUpperCase()}`)
  } catch {
    return ""
  }
}

function queryParamsToString(params: Record<string, string>): string {
  return Object.keys(params)
    .sort()
    .map((key) => `${uriEscape(key)}=${uriEscape(params[key])}`)
    .join("&")
}

interface SignedRequest {
  url: string
  headers: Record<string, string>
}

/**
 * Sign a Volcengine API request and return the full URL + headers.
 */
export function signRequest(
  action: string,
  version: string,
  body: string
): SignedRequest {
  const accessKeyId = process.env.VOLC_ACCESSKEY
  const secretAccessKey = process.env.VOLC_SECRETKEY

  if (!accessKeyId || !secretAccessKey) {
    throw new Error("VOLC_ACCESSKEY and VOLC_SECRETKEY must be set")
  }

  const datetime = getDateTimeNow()
  const date = datetime.substring(0, 8)

  const queryParams: Record<string, string> = {
    Action: action,
    Version: version,
  }

  const bodySha = sha256(body)

  // Canonical headers
  const headers: Record<string, string> = {
    host: HOST,
    "x-date": datetime,
    "x-content-sha256": bodySha,
    "content-type": "application/json",
  }

  // Signed headers (sorted, lowercase) — host is NOT signed, matching official SDK behavior
  const signedHeaderKeys = ["x-content-sha256", "x-date"]
  const signedHeaders = signedHeaderKeys.join(";")
  const canonicalHeaders = signedHeaderKeys
    .map((k) => `${k}:${headers[k]}`)
    .join("\n")

  // Canonical request
  const canonicalRequest = [
    "POST",
    "/",
    queryParamsToString(queryParams),
    `${canonicalHeaders}\n`,
    signedHeaders,
    bodySha,
  ].join("\n")

  // Credential scope
  const credentialScope = [date, REGION, SERVICE, "request"].join("/")

  // String to sign
  const stringToSign = [
    "HMAC-SHA256",
    datetime,
    credentialScope,
    sha256(canonicalRequest),
  ].join("\n")

  // Signing key (multi-layer HMAC)
  const kDate = hmac(secretAccessKey, date)
  const kRegion = hmac(kDate, REGION)
  const kService = hmac(kRegion, SERVICE)
  const kSigning = hmac(kService, "request")
  const signature = hmac(kSigning, stringToSign).toString("hex")

  // Authorization header
  const authorization = `HMAC-SHA256 Credential=${accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`

  const qs = queryParamsToString(queryParams)
  return {
    url: `https://${HOST}/?${qs}`,
    headers: {
      "Content-Type": "application/json",
      Host: HOST,
      "X-Date": datetime,
      "X-Content-Sha256": bodySha,
      Authorization: authorization,
    },
  }
}

/**
 * Make a signed POST request to Volcengine visual API.
 */
export async function volcRequest<T = Record<string, unknown>>(
  action: string,
  body: Record<string, unknown>,
  version = "2022-08-31"
): Promise<T> {
  const bodyStr = JSON.stringify(body)
  const { url, headers } = signRequest(action, version, bodyStr)

  const res = await fetch(url, {
    method: "POST",
    headers,
    body: bodyStr,
  })

  const json = await res.json() as {
    ResponseMetadata?: { Error?: { Code?: string; Message?: string } }
    code?: number
    data?: T
  }

  // Check for API-level errors
  if (json.ResponseMetadata?.Error) {
    const err = json.ResponseMetadata.Error
    throw new Error(`Volcengine API error: ${err.Code} - ${err.Message}`)
  }

  // Some endpoints return { code: 10000, data: ... }
  if (json.code && json.code !== 10000) {
    throw new Error(`Volcengine API error code ${json.code}: ${JSON.stringify(json)}`)
  }

  return (json.data ?? json) as T
}
