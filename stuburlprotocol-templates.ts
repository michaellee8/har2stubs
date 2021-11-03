import { HTTPMethods } from "./generate";

export function template(paramsArr: Array<{
    requestBody: Record<string, any>;
    requestHeader: Record<string, string>;
    responseBody: Record<string, any>;
    responseHeader: Record<string, string>;
    host: string;
    scheme: string;
    path: string;
    method: HTTPMethods;
    statusCode: number;
    hasRequestBody: boolean;
}>): string {
    return `
import Foundation

fileprivate func mustDecodeJSON(_ s: String) -> [String: Any] {
    return try! JSONSerialization.jsonObject(with: Data(s.utf8), options: []) as! [String: Any]
}

fileprivate func httpBodyStreamToData(stream: InputStream?) -> Data? {
    guard let bodyStream = stream else { return nil }
    bodyStream.open()

    // Will read 16 chars per iteration. Can use bigger buffer if needed
    let bufferSize: Int = 16

    let buffer = UnsafeMutablePointer<UInt8>.allocate(capacity: bufferSize)

    var dat = Data()

    while bodyStream.hasBytesAvailable {

        let readDat = bodyStream.read(buffer, maxLength: bufferSize)
        dat.append(buffer, count: readDat)
    }

    buffer.deallocate()

    bodyStream.close()
    
    return dat
}

fileprivate func stubMatcher(host: String, scheme: String, path: String, method: String, requestHeaders: [String: String]) -> (URLRequest) -> Bool {
    return { (req: URLRequest) -> Bool in
        if req.url?.host != host || req.url?.scheme != scheme || req.url?.path != path || req.httpMethod != method {
            return false
        }
        for (name, value) in requestHeaders {
            if req.value(forHTTPHeaderField: name) != value {
                return false
            }
        }
        return true
    }
}

fileprivate func stubMatcherWithBody(host: String, scheme: String, path: String, method: String, requestHeaders: [String: String], body: [String: Any]) -> (URLRequest) -> Bool {
    return { (req: URLRequest) -> Bool in
        if !stubMatcher(host: host, scheme: scheme, path: path, method: method, requestHeaders: requestHeaders)(req){
            return false
        }
        guard
            let bodyData = StubURLProtocol.property(forKey: httpBodyKey, in: req) as? Data,
            let jsonBody = (try? JSONSerialization.jsonObject(with: bodyData, options: [])) as? [String : Any]
        else {
            return false
        }
        return NSDictionary(dictionary: jsonBody).isEqual(to: body)
    }
}

fileprivate let injectedURLs: Set = [
${paramsArr.map(params => `    URL(string: "${params.scheme}://${params.host}${params.path}"),`).join("\n")}
]

fileprivate let injectedStubs: [Stub] = [
    ${paramsArr.map(params => !params.hasRequestBody ? `
    Stub(
        requestMatcher: stubMatcher(
            host: "${params.host}",
            scheme: "${params.scheme}",
            path: "${params.path}",
            method: "${params.method}",
            requestHeaders: mustDecodeJSON(#"${JSON.stringify(params.requestHeader)}"#) as! [String: String]
        ),
        responseBody: Data(#"${JSON.stringify(params.responseBody)}"#.utf8),
        statusCode: ${params.statusCode},
        responseHeaders: mustDecodeJSON(#"${JSON.stringify(params.responseHeader)}"#) as! [String: String]
    ),
` : `
    Stub(
        requestMatcher: stubMatcherWithBody(
            host: "${params.host}",
            scheme: "${params.scheme}",
            path: "${params.path}",
            method: "${params.method}",
            requestHeaders: mustDecodeJSON(#"${JSON.stringify(params.requestHeader)}"#) as! [String: String],
            body: mustDecodeJSON(#"${JSON.stringify(params.requestBody)}"#) as! [String: Any]
        ),
        responseBody: Data(#"${JSON.stringify(params.responseBody)}"#.utf8),
        statusCode: ${params.statusCode},
        responseHeaders: mustDecodeJSON(#"${JSON.stringify(params.responseHeader)}"#) as! [String: String]
    ),
`).join("\n")}
]

fileprivate let httpBodyKey = "StubURLProtocolHTTPBody"

fileprivate struct Stub {
    let requestMatcher: (URLRequest) -> Bool
    let responseBody: Data?
    let statusCode: Int
    let responseHeaders: [String: String]
}

public class StubURLProtocol: URLProtocol {
    private static let terminateUnknownRequest = true
    
    private static let stubs = injectedStubs
    
    private static let urls = injectedURLs
    
    private class func matchStub(req: URLRequest) -> Stub? {
        var inputReq: URLRequest
        if let httpBodyData = httpBodyStreamToData(stream: req.httpBodyStream) {
            let mutableReq = (req as NSURLRequest).mutableCopy() as! NSMutableURLRequest
            setProperty(httpBodyData, forKey: httpBodyKey, in: mutableReq)
            inputReq = mutableReq as URLRequest
        } else {
            inputReq = req
        }
        for stub in stubs {
            if stub.requestMatcher(inputReq) {
                return stub
            }
        }
        return nil
    }
    
    public override class func canInit(with request: URLRequest) -> Bool {
        var cleanURL: URL? {
            var comp = URLComponents()
            comp.scheme = request.url?.scheme
            comp.host = request.url?.host
            comp.path = request.url?.path ?? "/"
            return comp.url
        }
        if urls.contains(cleanURL){
            return true
        }
        return terminateUnknownRequest
    }
    
    public override class func canonicalRequest(for request: URLRequest) -> URLRequest {
        return request
    }
    
    public override func startLoading() {
        guard let url = request.url else {
            fatalError("Request has no URL")
        }
        var cleanURL: URL? {
            var comp = URLComponents()
            comp.scheme = url.scheme
            comp.host = url.host
            comp.path = url.path
            return comp.url
        }
        if !StubURLProtocol.urls.contains(cleanURL){
            fatalError("URL not mocked, inconsistent injectedURLs: \\(url.absoluteString)")
        }
        if let stub = StubURLProtocol.matchStub(req: request){
            let res = HTTPURLResponse(url: url, statusCode: stub.statusCode, httpVersion: nil, headerFields: stub.responseHeaders)!
            self.client?.urlProtocol(self, didReceive: res, cacheStoragePolicy: .notAllowed)
            if let d = stub.responseBody {
                self.client?.urlProtocol(self, didLoad: d)
            }
        }else{
            fatalError("URL not mocked: \\(url.absoluteString)")
        }
        self.client?.urlProtocolDidFinishLoading(self)
    }
    
    public override func stopLoading() {
        
    }
}
`
}