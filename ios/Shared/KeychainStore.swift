import Foundation
import LocalAuthentication
import Security

enum KeychainError: Error {
    case notFound
    case unexpectedStatus(OSStatus)
    case encodingFailed
}

final class KeychainStore {
    static let shared = KeychainStore()

    private let service = "com.example.myonepassword"
    private let sessionAccount = "session"
    private let unlockAccount = "biometric-master-password"

    func saveSession(_ session: UserSession) throws {
        let data = try JSONEncoder().encode(session)
        try save(data, account: sessionAccount, accessControl: nil)
        UserDefaults(suiteName: AppConfiguration.appGroupIdentifier)?.set(session.email, forKey: "lastEmail")
    }

    func loadSession() throws -> UserSession {
        let data = try load(account: sessionAccount, context: nil)
        return try JSONDecoder().decode(UserSession.self, from: data)
    }

    func saveBiometricUnlockSecret(_ masterPassword: String) throws {
        guard let data = masterPassword.data(using: .utf8) else {
            throw KeychainError.encodingFailed
        }
        var error: Unmanaged<CFError>?
        guard let access = SecAccessControlCreateWithFlags(
            nil,
            kSecAttrAccessibleWhenUnlockedThisDeviceOnly,
            [.biometryCurrentSet, .userPresence],
            &error
        ) else {
            throw error?.takeRetainedValue() ?? KeychainError.encodingFailed
        }
        try save(data, account: unlockAccount, accessControl: access)
    }

    func loadBiometricUnlockSecret(reason: String) throws -> String {
        let context = LAContext()
        context.localizedReason = reason
        let data = try load(account: unlockAccount, context: context)
        guard let secret = String(data: data, encoding: .utf8) else {
            throw KeychainError.encodingFailed
        }
        return secret
    }

    func clearAll() {
        delete(account: sessionAccount)
        delete(account: unlockAccount)
        UserDefaults(suiteName: AppConfiguration.appGroupIdentifier)?.removeObject(forKey: "lastEmail")
    }

    private func baseQuery(account: String) -> [String: Any] {
        var query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account
        ]
        if let accessGroup = AppConfiguration.keychainAccessGroup {
            query[kSecAttrAccessGroup as String] = accessGroup
        }
        return query
    }

    private func save(_ data: Data, account: String, accessControl: SecAccessControl?) throws {
        delete(account: account)
        var query = baseQuery(account: account)
        query[kSecValueData as String] = data
        if let accessControl {
            query[kSecAttrAccessControl as String] = accessControl
        } else {
            query[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
        }
        let status = SecItemAdd(query as CFDictionary, nil)
        guard status == errSecSuccess else {
            throw KeychainError.unexpectedStatus(status)
        }
    }

    private func load(account: String, context: LAContext?) throws -> Data {
        var query = baseQuery(account: account)
        query[kSecReturnData as String] = true
        query[kSecMatchLimit as String] = kSecMatchLimitOne
        if let context {
            query[kSecUseAuthenticationContext as String] = context
        }
        var item: CFTypeRef?
        let status = SecItemCopyMatching(query as CFDictionary, &item)
        guard status != errSecItemNotFound else {
            throw KeychainError.notFound
        }
        guard status == errSecSuccess, let data = item as? Data else {
            throw KeychainError.unexpectedStatus(status)
        }
        return data
    }

    private func delete(account: String) {
        SecItemDelete(baseQuery(account: account) as CFDictionary)
    }
}
