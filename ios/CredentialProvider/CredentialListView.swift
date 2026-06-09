import AuthenticationServices
import SwiftUI

@MainActor
final class CredentialListViewModel: ObservableObject {
    enum State: Equatable {
        case loading
        case ready
        case signedOut
        case locked
        case noMatches
        case failed(String)
    }

    @Published var entries: [VaultEntry] = []
    @Published var state: State = .loading

    func load(serviceIdentifiers: [ASCredentialServiceIdentifier]) async {
        state = .loading

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
                .sorted { $0.title.localizedCaseInsensitiveCompare($1.title) == .orderedAscending }
            state = entries.isEmpty ? .noMatches : .ready
        } catch APIError.server(401, _) {
            state = .locked
        } catch APIError.missingSession {
            state = .signedOut
        } catch {
            state = .failed(error.localizedDescription)
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
                switch viewModel.state {
                case .loading:
                    ProgressView("Finding matching credentials...")
                        .frame(maxWidth: .infinity, maxHeight: .infinity)
                case .ready:
                    List(viewModel.entries) { entry in
                        Button {
                            onSelect(viewModel.credential(for: entry))
                        } label: {
                            HStack(spacing: 14) {
                                ZStack {
                                    RoundedRectangle(cornerRadius: 12, style: .continuous)
                                        .fill(.blue.gradient)
                                    Text(String(entry.title.prefix(1)).uppercased())
                                        .font(.headline.weight(.bold))
                                        .foregroundStyle(.white)
                                }
                                .frame(width: 42, height: 42)

                                VStack(alignment: .leading, spacing: 4) {
                                    Text(entry.title)
                                        .font(.headline)
                                        .foregroundStyle(.primary)
                                    Text(entry.username ?? "Username hidden")
                                        .font(.subheadline)
                                        .foregroundStyle(.secondary)
                                }
                                Spacer()
                                Image(systemName: "arrow.up.right.square.fill")
                                    .foregroundStyle(.secondary)
                            }
                            .padding(.vertical, 6)
                        }
                    }
                case .signedOut:
                    stateView(
                        title: "Sign in required",
                        systemImage: "person.crop.circle.badge.exclamationmark",
                        message: "Open My One Password and sign in before using Password AutoFill."
                    )
                case .locked:
                    stateView(
                        title: "Vault locked",
                        systemImage: "lock.fill",
                        message: "Open My One Password and unlock your vault. Credentials are never exposed while locked."
                    )
                case .noMatches:
                    stateView(
                        title: "No matching credentials",
                        systemImage: "magnifyingglass",
                        message: "No username/password entries matched this website."
                    )
                case let .failed(message):
                    stateView(
                        title: "AutoFill unavailable",
                        systemImage: "exclamationmark.triangle.fill",
                        message: message
                    )
                }
            }
            .navigationTitle("My One Password")
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

    private func stateView(title: String, systemImage: String, message: String) -> some View {
        ContentUnavailableView(title, systemImage: systemImage, description: Text(message))
            .frame(maxWidth: .infinity, maxHeight: .infinity)
    }
}
