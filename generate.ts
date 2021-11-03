import { Har, Header } from "har-format";
import MIMEType from "whatwg-mimetype";
import * as OHHTTPStubsTemplates from "./ohhttpstubs-templates";
import * as StubURLProtocol from "./stuburlprotocol-templates";
import { Buffer } from "buffer";
import { URL } from "url";

export type HTTPMethods = "GET" | "POST" | "PUT" | "PATCH" | "DELETE" | "HEAD";

function convertHeaderArrayToHeaderMap(
  headers: Array<Header>
): Record<string, string> {
  return headers.reduce((m, h) => ({ ...m, [h.name]: h.value }), {});
}

const blacklistedRequestHeaders: Array<string> = ["Host"]

const blacklistedResponseHeaders: Array<string> = []

function removeBlacklistedRequestHeaders(headerMap: Record<string, string>): Record<string, string> {
  let ret = { ...headerMap };
  blacklistedRequestHeaders.forEach(name => {
    if (ret[name]) {
      OHHTTPStubsTemplates.registerStub
      delete ret[name];
    }
  })
  return ret;
}

function removeBlacklistedResponseHeaders(headerMap: Record<string, string>): Record<string, string> {
  let ret = { ...headerMap };
  blacklistedResponseHeaders.forEach(name => {
    if (ret[name]) {
      delete ret[name];
    }
  })
  return ret;
}

export function generateOHHTTPStubsStubs(har: Har): string {
  let indexes: Array<number> = [];
  let output = har.log.entries
    .filter((entry) => {
      // We only allow json requests and response here,
      // since that is what we will use. Filter out all non-JSON requests/responses.
      // All HTTP requests that will be involved in getTorusKey are JSON anyway.
      return (
        (entry.request.method === "GET" ||
          entry.request.method === "DELETE" ||
          entry.request.method === "HEAD" ||
          MIMEType.parse(entry.request.postData?.mimeType)?.subtype ===
          "json") &&
        MIMEType.parse(entry.response.content?.mimeType)?.subtype === "json"
      );
    })
    .map((entry, id) => {
      indexes.push(id);
      const hasRequestBody = !!entry.request.postData;
      const url = new URL(entry.request.url);
      return OHHTTPStubsTemplates.registerStub({
        requestBody: hasRequestBody
          ? JSON.parse(entry.request.postData.text)
          : {},
        requestHeader: removeBlacklistedRequestHeaders(convertHeaderArrayToHeaderMap(entry.request.headers)),
        responseBody: JSON.parse(
          entry.response.content.encoding &&
            entry.response.content.encoding === "base64"
            ? Buffer.from(entry.response.content.text, "base64").toString(
              "utf8"
            )
            : entry.response.content.text
        ),
        responseHeader: removeBlacklistedResponseHeaders(convertHeaderArrayToHeaderMap(entry.response.headers)),
        hasRequestBody,
        host: url.host,
        method: entry.request.method as HTTPMethods,
        path: url.pathname,
        scheme: url.protocol.replace(":", ""),
        statusCode: entry.response.status,
        id,
      });
    })
    .join("\n");
  output = OHHTTPStubsTemplates.preStubs(indexes) + output;
  return output;
}

export function generateStubs(har: Har, type: string): string {
  if (type == "ohhttpstubs") {
    return generateOHHTTPStubsStubs(har);
  } else if (type == "stuburlprotocol") {
    return generateStubURLProtocolStubs(har);
  }
  return "";
}

export function generateStubURLProtocolStubs(har: Har): string {
  let paramsArr = har.log.entries
    .filter((entry) => {
      // We only allow json requests and response here,
      // since that is what we will use. Filter out all non-JSON requests/responses.
      // All HTTP requests that will be involved in getTorusKey are JSON anyway.
      return (
        (entry.request.method === "GET" ||
          entry.request.method === "DELETE" ||
          entry.request.method === "HEAD" ||
          MIMEType.parse(entry.request.postData?.mimeType)?.subtype ===
          "json") &&
        MIMEType.parse(entry.response.content?.mimeType)?.subtype === "json"
      );
    })
    .map((entry) => {
      const hasRequestBody = !!entry.request.postData;
      const url = new URL(entry.request.url);
      return {
        requestBody: hasRequestBody
          ? JSON.parse(entry.request.postData.text)
          : {},
        requestHeader: removeBlacklistedRequestHeaders(convertHeaderArrayToHeaderMap(entry.request.headers)),
        responseBody: JSON.parse(
          entry.response.content.encoding &&
            entry.response.content.encoding === "base64"
            ? Buffer.from(entry.response.content.text, "base64").toString(
              "utf8"
            )
            : entry.response.content.text
        ),
        responseHeader: removeBlacklistedResponseHeaders(convertHeaderArrayToHeaderMap(entry.response.headers)),
        hasRequestBody,
        host: url.host,
        method: entry.request.method as HTTPMethods,
        path: url.pathname,
        scheme: url.protocol.replace(":", ""),
        statusCode: entry.response.status,
      };
    });
  return StubURLProtocol.template(paramsArr);
}