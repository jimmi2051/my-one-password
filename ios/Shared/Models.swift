import Foundation

struct UserSession: Codable, Equatable {
    let email: String
    let token: String
}

struct MeResponse: Decodable {
    let email: String
    let unlocked: Bool
}

struct UnlockResponse: Decodable {
    let message: String
    let email: String
}

struct VaultEntry: Codable, Identifiable, Equatable {
    let id: String
    var title: String
    var username: String?
    var password: String
    var url: String?
    var notes: String?
    var categoryId: String?
    var categoryName: String?
    var createdAt: Date?
    var updatedAt: Date?

    enum CodingKeys: String, CodingKey {
        case id, title, username, password, url, notes
        case categoryId = "category_id"
        case categoryName = "category_name"
        case createdAt = "created_at"
        case updatedAt = "updated_at"
    }
}

struct EntryPayload: Encodable {
    var title: String
    var username: String?
    var password: String?
    var url: String?
    var notes: String?
    var categoryId: String?

    enum CodingKeys: String, CodingKey {
        case title, username, password, url, notes
        case categoryId = "category_id"
    }
}

struct Category: Codable, Identifiable, Equatable {
    let id: String
    var name: String
    var createdAt: Date?

    enum CodingKeys: String, CodingKey {
        case id, name
        case createdAt = "created_at"
    }
}

struct PasswordGenerateRequest: Encodable {
    var length = 20
    var uppercase = true
    var lowercase = true
    var digits = true
    var symbols = false
}

struct PasswordGenerateResponse: Decodable {
    let password: String
}
