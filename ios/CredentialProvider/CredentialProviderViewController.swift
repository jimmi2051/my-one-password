import AuthenticationServices
import SwiftUI

final class CredentialProviderViewController: ASCredentialProviderViewController {
    override func viewDidLoad() {
        super.viewDidLoad()
    }

    override func prepareCredentialList(for serviceIdentifiers: [ASCredentialServiceIdentifier]) {
        let view = CredentialListView(serviceIdentifiers: serviceIdentifiers) { credential in
            self.extensionContext.completeRequest(withSelectedCredential: credential)
        } onCancel: {
            self.extensionContext.cancelRequest(withError: NSError(
                domain: ASExtensionErrorDomain,
                code: ASExtensionError.userCanceled.rawValue
            ))
        }
        embed(view)
    }

    override func provideCredentialWithoutUserInteraction(for credentialIdentity: ASPasswordCredentialIdentity) {
        Task {
            do {
                guard let recordIdentifier = credentialIdentity.recordIdentifier else {
                    throw APIError.invalidResponse
                }
                let entries = try await APIClient.shared.entries()
                guard let entry = entries.first(where: { $0.id == recordIdentifier }) else {
                    throw APIError.invalidResponse
                }
                let credential = ASPasswordCredential(
                    user: entry.username ?? "",
                    password: entry.password
                )
                extensionContext.completeRequest(withSelectedCredential: credential)
            } catch {
                extensionContext.cancelRequest(withError: NSError(
                    domain: ASExtensionErrorDomain,
                    code: ASExtensionError.userInteractionRequired.rawValue
                ))
            }
        }
    }

    override func prepareInterfaceToProvideCredential(for credentialIdentity: ASPasswordCredentialIdentity) {
        let view = CredentialListView(serviceIdentifiers: [
            credentialIdentity.serviceIdentifier
        ]) { credential in
            self.extensionContext.completeRequest(withSelectedCredential: credential)
        } onCancel: {
            self.extensionContext.cancelRequest(withError: NSError(
                domain: ASExtensionErrorDomain,
                code: ASExtensionError.userCanceled.rawValue
            ))
        }
        embed(view)
    }

    private func embed<Content: View>(_ content: Content) {
        let hosting = UIHostingController(rootView: content)
        addChild(hosting)
        hosting.view.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(hosting.view)
        NSLayoutConstraint.activate([
            hosting.view.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            hosting.view.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            hosting.view.topAnchor.constraint(equalTo: view.topAnchor),
            hosting.view.bottomAnchor.constraint(equalTo: view.bottomAnchor)
        ])
        hosting.didMove(toParent: self)
    }
}
