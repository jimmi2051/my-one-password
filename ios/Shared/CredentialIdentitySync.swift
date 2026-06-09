import AuthenticationServices
import Foundation

enum CredentialIdentitySync {
    static func sync(entries: [VaultEntry]) {
        let identities = entries.compactMap { entry -> ASPasswordCredentialIdentity? in
            guard
                let username = entry.username,
                let serviceIdentifier = serviceIdentifier(for: entry.url)
            else {
                return nil
            }
            return ASPasswordCredentialIdentity(
                serviceIdentifier: serviceIdentifier,
                user: username,
                recordIdentifier: entry.id
            )
        }

        ASCredentialIdentityStore.shared.replaceCredentialIdentities(with: identities) { success, error in
            if let error {
                print("Credential identity sync failed: \(error)")
            } else if !success {
                print("Credential identity sync was not accepted by the system")
            }
        }
    }

    static func serviceIdentifier(for rawURL: String?) -> ASCredentialServiceIdentifier? {
        guard var rawURL, !rawURL.isEmpty else {
            return nil
        }
        if !rawURL.contains("://") {
            rawURL = "https://\(rawURL)"
        }
        guard let host = URL(string: rawURL)?.host else {
            return nil
        }
        return ASCredentialServiceIdentifier(identifier: host, type: .domain)
    }
}
