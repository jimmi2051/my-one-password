import AuthenticationServices
import Foundation

struct AutoFillSyncSnapshot: Equatable {
    enum Outcome: Equatable {
        case notStarted
        case syncing
        case succeeded
        case failed(String)
    }

    var outcome: Outcome = .notStarted
    var syncedCredentialCount = 0
    var attemptedAt: Date?
    var isProviderEnabled: Bool?

    var title: String {
        switch outcome {
        case .notStarted:
            return "AutoFill not synced yet"
        case .syncing:
            return "Syncing AutoFill suggestions"
        case .succeeded:
            return "AutoFill suggestions synced"
        case .failed:
            return "AutoFill sync needs attention"
        }
    }

    var detail: String {
        switch outcome {
        case .notStarted:
            return "Load your vault, then sync suggestions for Safari and other iOS password fields."
        case .syncing:
            return "Updating iOS with credential suggestions from your unlocked vault."
        case .succeeded:
            let enabledText = isProviderEnabled == false ? " Enable My One Password in iOS Password AutoFill settings." : ""
            return "\(syncedCredentialCount) username/password suggestion\(syncedCredentialCount == 1 ? "" : "s") available.\(enabledText)"
        case let .failed(message):
            return message
        }
    }
}

enum CredentialIdentitySync {
    static func sync(entries: [VaultEntry]) async -> AutoFillSyncSnapshot {
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

        return await withCheckedContinuation { continuation in
            ASCredentialIdentityStore.shared.getCredentialIdentityStoreState { state in
                ASCredentialIdentityStore.shared.replaceCredentialIdentities(with: identities) { success, error in
                    let attemptedAt = Date()
                    if let error {
                        continuation.resume(returning: AutoFillSyncSnapshot(
                            outcome: .failed(error.localizedDescription),
                            syncedCredentialCount: identities.count,
                            attemptedAt: attemptedAt,
                            isProviderEnabled: state.isEnabled
                        ))
                    } else if !success {
                        continuation.resume(returning: AutoFillSyncSnapshot(
                            outcome: .failed("iOS did not accept the credential identity update. Check Associated Domains, App Groups, Keychain Sharing, and Password AutoFill settings."),
                            syncedCredentialCount: identities.count,
                            attemptedAt: attemptedAt,
                            isProviderEnabled: state.isEnabled
                        ))
                    } else {
                        continuation.resume(returning: AutoFillSyncSnapshot(
                            outcome: .succeeded,
                            syncedCredentialCount: identities.count,
                            attemptedAt: attemptedAt,
                            isProviderEnabled: state.isEnabled
                        ))
                    }
                }
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
