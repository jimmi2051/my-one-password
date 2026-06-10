import AuthenticationServices
import Foundation
import SwiftUI

@MainActor
final class AppModel: NSObject, ObservableObject {
    enum State: Equatable {
        case loading
        case signedOut
        case locked(UserSession)
        case unlocked(UserSession)
    }

    @Published private(set) var state: State = .loading
    @Published private(set) var hasBiometricSecret = KeychainStore.shared.hasBiometricUnlockSecret
    @Published var errorMessage: String?
    @Published var isSigningIn = false

    private var authSession: ASWebAuthenticationSession?

    func restoreSession() async {
        do {
            let session = try KeychainStore.shared.loadSession()
            let response = try await APIClient.shared.me()
            state = response.unlocked ? .unlocked(session) : .locked(session)
        } catch {
            state = .signedOut
        }
    }

    func signInWithGoogle() {
        isSigningIn = true
        let session = ASWebAuthenticationSession(
            url: APIClient.shared.makeGoogleLoginURL(),
            callbackURLScheme: AppConfiguration.callbackScheme
        ) { [weak self] callbackURL, error in
            Task { @MainActor in
                self?.isSigningIn = false
                if let error {
                    self?.errorMessage = error.localizedDescription
                    return
                }
                guard let callbackURL else {
                    self?.errorMessage = "Missing Google callback URL."
                    return
                }
                self?.handleCallback(callbackURL)
            }
        }
        session.presentationContextProvider = self
        session.prefersEphemeralWebBrowserSession = false
        authSession = session
        session.start()
    }

    func handleCallback(_ url: URL) {
        isSigningIn = false
        guard
            url.scheme == AppConfiguration.callbackScheme,
            let components = URLComponents(url: url, resolvingAgainstBaseURL: false),
            let token = components.queryItems?.first(where: { $0.name == "token" })?.value,
            let email = components.queryItems?.first(where: { $0.name == "email" })?.value
        else {
            return
        }

        let session = UserSession(email: email, token: token)
        do {
            try KeychainStore.shared.saveSession(session)
            state = .locked(session)
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func checkSession() async {
        guard case .unlocked(let session) = state else { return }
        do {
            let response = try await APIClient.shared.me()
            if !response.unlocked {
                state = .locked(session)
            }
        } catch {
            state = .signedOut
        }
    }

    func unlock(masterPassword: String, rememberForBiometrics: Bool) async {
        do {
            _ = try await APIClient.shared.unlock(masterPassword: masterPassword)
            if rememberForBiometrics {
                try KeychainStore.shared.saveBiometricUnlockSecret(masterPassword)
                hasBiometricSecret = true
            }
            if let session = try? KeychainStore.shared.loadSession() {
                state = .unlocked(session)
            }
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func unlockWithBiometrics(silent: Bool = false) async {
        do {
            let masterPassword = try KeychainStore.shared.loadBiometricUnlockSecret(
                reason: "Unlock My One Password"
            )
            await unlock(masterPassword: masterPassword, rememberForBiometrics: false)
        } catch {
            if !silent {
                errorMessage = "Biometric unlock is not available. Unlock with your master password first."
            }
        }
    }

    func logout() async {
        do {
            try await APIClient.shared.logout()
        } catch {
            errorMessage = error.localizedDescription
        }
        KeychainStore.shared.clearAll()
        hasBiometricSecret = false
        state = .signedOut
    }
}

extension AppModel: ASWebAuthenticationPresentationContextProviding {
    nonisolated func presentationAnchor(for session: ASWebAuthenticationSession) -> ASPresentationAnchor {
        ASPresentationAnchor()
    }
}
