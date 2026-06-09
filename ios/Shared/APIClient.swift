import Foundation

enum APIError: LocalizedError {
    case missingSession
    case invalidResponse
    case server(Int, String)

    var errorDescription: String? {
        switch self {
        case .missingSession:
            return "You are not signed in."
        case .invalidResponse:
            return "The server returned an invalid response."
        case let .server(status, message):
            return "\(status): \(message)"
        }
    }
}

final class APIClient {
    static let shared = APIClient()

    var sessionProvider: () -> UserSession? = {
        try? KeychainStore.shared.loadSession()
    }

    private let baseURL: URL
    private let urlSession: URLSession
    private let decoder: JSONDecoder
    private let encoder: JSONEncoder

    init(baseURL: URL = AppConfiguration.apiBaseURL, urlSession: URLSession = .shared) {
        self.baseURL = baseURL
        self.urlSession = urlSession
        decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        encoder = JSONEncoder()
    }

    func makeGoogleLoginURL() -> URL {
        var components = URLComponents(url: endpointURL(path: "/auth/google"), resolvingAgainstBaseURL: false)!
        components.queryItems = [
            URLQueryItem(name: "mobile_redirect_uri", value: AppConfiguration.callbackURL)
        ]
        return components.url!
    }

    func me() async throws -> MeResponse {
        try await request("GET", path: "/auth/me")
    }

    func unlock(masterPassword: String) async throws -> UnlockResponse {
        try await request("POST", path: "/auth/unlock", body: ["master_password": masterPassword])
    }

    func logout() async throws {
        let _: EmptyResponse = try await request("POST", path: "/auth/logout")
    }

    func entries(search: String? = nil, categoryId: String? = nil) async throws -> [VaultEntry] {
        var query: [URLQueryItem] = []
        if let search, !search.isEmpty {
            query.append(URLQueryItem(name: "search", value: search))
        }
        if let categoryId, !categoryId.isEmpty {
            query.append(URLQueryItem(name: "category_id", value: categoryId))
        }
        return try await request("GET", path: "/api/entries", queryItems: query)
    }

    func autofillEntries(hostname: String) async throws -> [VaultEntry] {
        try await request("GET", path: "/api/entries/autofill", queryItems: [
            URLQueryItem(name: "url", value: hostname)
        ])
    }

    func createEntry(_ payload: EntryPayload) async throws -> VaultEntry {
        try await request("POST", path: "/api/entries", body: payload)
    }

    func updateEntry(id: String, payload: EntryPayload) async throws -> VaultEntry {
        try await request("PUT", path: "/api/entries/\(id)", body: payload)
    }

    func deleteEntry(id: String) async throws {
        let _: EmptyResponse = try await request("DELETE", path: "/api/entries/\(id)")
    }

    func categories() async throws -> [Category] {
        try await request("GET", path: "/api/categories")
    }

    func createCategory(name: String) async throws -> Category {
        try await request("POST", path: "/api/categories", body: ["name": name])
    }

    func updateCategory(id: String, name: String) async throws -> Category {
        try await request("PUT", path: "/api/categories/\(id)", body: ["name": name])
    }

    func deleteCategory(id: String) async throws {
        let _: EmptyResponse = try await request("DELETE", path: "/api/categories/\(id)")
    }

    func generatePassword(_ request: PasswordGenerateRequest) async throws -> String {
        let response: PasswordGenerateResponse = try await self.request("POST", path: "/api/generate", body: request)
        return response.password
    }

    private func request<Response: Decodable>(
        _ method: String,
        path: String,
        queryItems: [URLQueryItem] = [],
        body: Encodable? = nil
    ) async throws -> Response {
        var components = URLComponents(url: endpointURL(path: path), resolvingAgainstBaseURL: false)!
        if !queryItems.isEmpty {
            components.queryItems = queryItems
        }
        guard let url = components.url else {
            throw APIError.invalidResponse
        }

        var request = URLRequest(url: url)
        request.httpMethod = method
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        if let session = sessionProvider() {
            request.setValue("Bearer \(session.token)", forHTTPHeaderField: "Authorization")
        } else if path != "/auth/google" {
            throw APIError.missingSession
        }
        if let body {
            request.httpBody = try encoder.encode(AnyEncodable(body))
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        }

        let (data, response) = try await urlSession.data(for: request)
        guard let http = response as? HTTPURLResponse else {
            throw APIError.invalidResponse
        }
        guard 200..<300 ~= http.statusCode else {
            let message = String(data: data, encoding: .utf8) ?? HTTPURLResponse.localizedString(forStatusCode: http.statusCode)
            throw APIError.server(http.statusCode, message)
        }
        if Response.self == EmptyResponse.self {
            return EmptyResponse() as! Response
        }
        return try decoder.decode(Response.self, from: data)
    }

    private func endpointURL(path: String) -> URL {
        baseURL.appendingPathComponent(path.trimmingCharacters(in: CharacterSet(charactersIn: "/")))
    }
}

struct EmptyResponse: Decodable {}

private struct AnyEncodable: Encodable {
    private let encode: (Encoder) throws -> Void

    init(_ value: Encodable) {
        encode = value.encode
    }

    func encode(to encoder: Encoder) throws {
        try encode(encoder)
    }
}
