import AuthenticationServices
import SwiftUI

@MainActor
final class CredentialListViewModel: ObservableObject {
    @Published var entries: [VaultEntry] = []
    @Published var isLoading = true
    @Published var message: String?

    func load(serviceIdentifiers: [ASCredentialServiceIdentifier]) async {
        isLoading = true
        defer { isLoading = false }

        do {
            let hostnames = serviceIdentifiers
                .filter { $0.type == .domain }
                .map(\.identifier)

            var matches: [VaultEntry] = []
            for hostname in hostnames {
                let entries = try await APIClient.shared.autofillEntries(hostname: hostname)
                matches.append(contentsOf: entries)
            }
            entries = Array(Dictionary(grouping: matches, by: \.id).values.compactMap(\.first))
            if entries.isEmpty {
                message = "No matching credentials."
            }
        } catch APIError.server(401, _) {
            message = "Vault is locked. Open My One Password and unlock your vault."
        } catch APIError.missingSession {
            message = "Sign in to My One Password first."
        } catch {
            message = error.localizedDescription
        }
    }

    func credential(for entry: VaultEntry) -> ASPasswordCredential {
        ASPasswordCredential(user: entry.username ?? "", password: entry.password)
    }
}

struct CredentialListView: View {
    let serviceIdentifiers: [ASCredentialServiceIdentifier]
    let onSelect: (ASPasswordCredential) -> Void
    let onCancel: () -> Void

    @StateObject private var viewModel = CredentialListViewModel()

    var body: some View {
        NavigationStack {
            Group {
                if viewModel.isLoading {
                    ProgressView()
                } else if let message = viewModel.message, viewModel.entries.isEmpty {
                    ContentUnavailableView("My One Password", systemImage: "lock", description: Text(message))
                } else {
                    List(viewModel.entries) { entry in
                        Button {
                            onSelect(viewModel.credential(for: entry))
                        } label: {
                            VStack(alignment: .leading, spacing: 4) {
                                Text(entry.title)
                                    .font(.headline)
                                Text(entry.username ?? "")
                                    .font(.subheadline)
                                    .foregroundStyle(.secondary)
                            }
                        }
                    }
                }
            }
            .navigationTitle("Choose Password")
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel", action: onCancel)
                }
            }
        }
        .task {
            await viewModel.load(serviceIdentifiers: serviceIdentifiers)
        }
    }
}
