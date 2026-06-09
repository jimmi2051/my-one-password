import SwiftUI

enum PremiumVaultTheme {
    static let backgroundGradient = LinearGradient(
        colors: [
            Color(red: 0.05, green: 0.07, blue: 0.12),
            Color(red: 0.09, green: 0.12, blue: 0.20),
            Color(red: 0.03, green: 0.04, blue: 0.08)
        ],
        startPoint: .topLeading,
        endPoint: .bottomTrailing
    )

    static let goldGradient = LinearGradient(
        colors: [
            Color(red: 1.00, green: 0.85, blue: 0.42),
            Color(red: 0.94, green: 0.62, blue: 0.22)
        ],
        startPoint: .topLeading,
        endPoint: .bottomTrailing
    )
}

@MainActor
final class VaultViewModel: ObservableObject {
    @Published var entries: [VaultEntry] = []
    @Published var categories: [Category] = []
    @Published var search = ""
    @Published var selectedCategoryId: String?
    @Published var isLoading = false
    @Published var errorMessage: String?
    @Published var autoFillSync = AutoFillSyncSnapshot()

    var selectedCategoryName: String {
        guard let selectedCategoryId else { return "All Items" }
        return categories.first(where: { $0.id == selectedCategoryId })?.name ?? "Category"
    }

    func refresh(syncAutoFill: Bool = true) async {
        isLoading = true
        defer { isLoading = false }
        do {
            async let entries = APIClient.shared.entries(search: search, categoryId: selectedCategoryId)
            async let categories = APIClient.shared.categories()
            self.entries = try await entries
            self.categories = try await categories
            if syncAutoFill {
                await syncAutoFillSuggestions()
            }
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func syncAutoFillSuggestions() async {
        autoFillSync = AutoFillSyncSnapshot(
            outcome: .syncing,
            syncedCredentialCount: autoFillSync.syncedCredentialCount,
            attemptedAt: autoFillSync.attemptedAt,
            isProviderEnabled: autoFillSync.isProviderEnabled
        )
        autoFillSync = await CredentialIdentitySync.sync(entries: entries)
    }

    func deleteEntry(_ entry: VaultEntry) async {
        do {
            try await APIClient.shared.deleteEntry(id: entry.id)
            await refresh()
        } catch {
            errorMessage = error.localizedDescription
        }
    }
}

struct VaultView: View {
    @EnvironmentObject private var appModel: AppModel
    @StateObject private var viewModel = VaultViewModel()
    @State private var showingEditor = false
    @State private var editingEntry: VaultEntry?
    @State private var showingCategories = false
    @State private var deletingEntry: VaultEntry?

    var body: some View {
        NavigationStack {
            ZStack {
                Color(.systemGroupedBackground)
                    .ignoresSafeArea()

                ScrollView {
                    LazyVStack(spacing: 18) {
                        dashboardHeader
                        categoryScroller
                        autoFillCard
                        entrySection
                    }
                    .padding(.horizontal, 18)
                    .padding(.bottom, 24)
                }
                .refreshable {
                    await viewModel.refresh()
                }
            }
            .searchable(text: $viewModel.search, prompt: "Search decrypted vault")
            .navigationTitle("Vault")
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button {
                        showingCategories = true
                    } label: {
                        Label("Categories", systemImage: "folder")
                    }
                }
                ToolbarItem(placement: .topBarTrailing) {
                    Button {
                        showingEditor = true
                    } label: {
                        Label("Add Entry", systemImage: "plus.circle.fill")
                    }
                }
                ToolbarItem(placement: .topBarTrailing) {
                    Menu {
                        Button("Sync AutoFill Suggestions") {
                            Task { await viewModel.syncAutoFillSuggestions() }
                        }
                        Button("Logout", role: .destructive) {
                            Task { await appModel.logout() }
                        }
                    } label: {
                        Image(systemName: "ellipsis.circle")
                    }
                }
            }
            .sheet(isPresented: $showingEditor) {
                EntryEditorView(entry: nil, categories: viewModel.categories) {
                    await viewModel.refresh()
                }
            }
            .sheet(item: $editingEntry) { entry in
                EntryEditorView(entry: entry, categories: viewModel.categories) {
                    await viewModel.refresh()
                }
            }
            .sheet(isPresented: $showingCategories) {
                CategoryListView(categories: viewModel.categories) {
                    await viewModel.refresh()
                }
            }
            .confirmationDialog(
                "Delete this vault entry?",
                isPresented: Binding(
                    get: { deletingEntry != nil },
                    set: { if !$0 { deletingEntry = nil } }
                ),
                presenting: deletingEntry
            ) { entry in
                Button("Delete \(entry.title)", role: .destructive) {
                    Task { await viewModel.deleteEntry(entry) }
                }
            } message: { _ in
                Text("This removes the encrypted entry from your vault.")
            }
            .task {
                await viewModel.refresh()
            }
            .onChange(of: viewModel.search) {
                Task { await viewModel.refresh(syncAutoFill: false) }
            }
            .alert("Vault", isPresented: Binding(
                get: { viewModel.errorMessage != nil },
                set: { if !$0 { viewModel.errorMessage = nil } }
            )) {
                Button("OK", role: .cancel) {}
            } message: {
                Text(viewModel.errorMessage ?? "")
            }
        }
    }

    private var dashboardHeader: some View {
        VStack(alignment: .leading, spacing: 18) {
            HStack {
                VStack(alignment: .leading, spacing: 6) {
                    Text(viewModel.selectedCategoryName)
                        .font(.system(size: 32, weight: .bold, design: .rounded))
                    Text("\(viewModel.entries.count) item\(viewModel.entries.count == 1 ? "" : "s") in your unlocked vault")
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                }
                Spacer()
                Image(systemName: "lock.shield.fill")
                    .font(.system(size: 32, weight: .semibold))
                    .foregroundStyle(PremiumVaultTheme.goldGradient)
                    .padding(12)
                    .background(.thinMaterial, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
            }

            HStack(spacing: 10) {
                Label("Unlocked", systemImage: "checkmark.circle.fill")
                    .foregroundStyle(.green)
                Label("Encrypted fields", systemImage: "key.fill")
                    .foregroundStyle(.secondary)
            }
            .font(.caption.weight(.semibold))
        }
        .padding(.top, 8)
    }

    private var categoryScroller: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 10) {
                categoryChip(title: "All", id: nil)
                ForEach(viewModel.categories) { category in
                    categoryChip(title: category.name, id: category.id)
                }
            }
            .padding(.vertical, 2)
        }
    }

    private func categoryChip(title: String, id: String?) -> some View {
        let selected = viewModel.selectedCategoryId == id
        return Button {
            viewModel.selectedCategoryId = id
            Task { await viewModel.refresh(syncAutoFill: false) }
        } label: {
            Text(title)
                .font(.subheadline.weight(.semibold))
                .foregroundStyle(selected ? .black : .primary)
                .padding(.horizontal, 14)
                .padding(.vertical, 9)
                .background {
                    if selected {
                        Capsule()
                            .fill(PremiumVaultTheme.goldGradient)
                    } else {
                        Capsule()
                            .fill(Color(.secondarySystemGroupedBackground))
                    }
                }
        }
        .buttonStyle(.plain)
    }

    private var autoFillCard: some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack(alignment: .top, spacing: 12) {
                Image(systemName: autoFillIcon)
                    .font(.title2.weight(.semibold))
                    .foregroundStyle(autoFillTint)
                    .frame(width: 34)
                VStack(alignment: .leading, spacing: 5) {
                    Text(viewModel.autoFillSync.title)
                        .font(.headline)
                    Text(viewModel.autoFillSync.detail)
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                }
                Spacer()
            }

            VStack(alignment: .leading, spacing: 6) {
                Label("Enable Associated Domains, App Groups, and Keychain Sharing for both targets.", systemImage: "checklist")
                Label("Install on a real device, then enable My One Password in iOS Password AutoFill settings.", systemImage: "iphone")
                Label("Safari shows suggestions after setup; iOS still requires you to select or approve a credential.", systemImage: "hand.tap")
            }
            .font(.caption)
            .foregroundStyle(.secondary)

            Button {
                Task { await viewModel.syncAutoFillSuggestions() }
            } label: {
                Label("Sync AutoFill Suggestions", systemImage: "arrow.triangle.2.circlepath")
                    .frame(maxWidth: .infinity)
            }
            .buttonStyle(.borderedProminent)
            .disabled(viewModel.autoFillSync.outcome == .syncing)
        }
        .padding(16)
        .background(Color(.secondarySystemGroupedBackground), in: RoundedRectangle(cornerRadius: 18, style: .continuous))
    }

    private var autoFillIcon: String {
        switch viewModel.autoFillSync.outcome {
        case .notStarted:
            return "rectangle.and.pencil.and.ellipsis"
        case .syncing:
            return "arrow.triangle.2.circlepath"
        case .succeeded:
            return "checkmark.seal.fill"
        case .failed:
            return "exclamationmark.triangle.fill"
        }
    }

    private var autoFillTint: Color {
        switch viewModel.autoFillSync.outcome {
        case .succeeded:
            return .green
        case .failed:
            return .orange
        default:
            return .accentColor
        }
    }

    private var entrySection: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                Text("Entries")
                    .font(.title3.bold())
                Spacer()
                if viewModel.isLoading {
                    ProgressView()
                }
            }

            if viewModel.entries.isEmpty && !viewModel.isLoading {
                ContentUnavailableView(
                    viewModel.search.isEmpty ? "No vault entries" : "No matching entries",
                    systemImage: viewModel.search.isEmpty ? "tray" : "magnifyingglass",
                    description: Text(viewModel.search.isEmpty ? "Add your first encrypted login." : "Try a different search or category.")
                )
                .padding(.vertical, 28)
            } else {
                ForEach(viewModel.entries) { entry in
                    VaultEntryRow(entry: entry) {
                        editingEntry = entry
                    } onDelete: {
                        deletingEntry = entry
                    }
                }
            }
        }
    }
}

private struct VaultEntryRow: View {
    let entry: VaultEntry
    let onOpen: () -> Void
    let onDelete: () -> Void

    var body: some View {
        Button(action: onOpen) {
            HStack(spacing: 14) {
                ZStack {
                    RoundedRectangle(cornerRadius: 14, style: .continuous)
                        .fill(PremiumVaultTheme.goldGradient)
                    Text(String(entry.title.prefix(1)).uppercased())
                        .font(.headline.weight(.bold))
                        .foregroundStyle(.black)
                }
                .frame(width: 46, height: 46)

                VStack(alignment: .leading, spacing: 5) {
                    Text(entry.title)
                        .font(.headline)
                        .foregroundStyle(.primary)
                    Text(entry.username ?? entry.url ?? "No username")
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                        .lineLimit(1)
                    if let categoryName = entry.categoryName {
                        Text(categoryName)
                            .font(.caption.weight(.semibold))
                            .foregroundStyle(.secondary)
                    }
                }

                Spacer()
                Image(systemName: "chevron.right")
                    .font(.caption.weight(.bold))
                    .foregroundStyle(.tertiary)
            }
            .padding(14)
            .background(Color(.secondarySystemGroupedBackground), in: RoundedRectangle(cornerRadius: 18, style: .continuous))
        }
        .buttonStyle(.plain)
        .contextMenu {
            Button("Edit", systemImage: "pencil", action: onOpen)
            Button("Delete", systemImage: "trash", role: .destructive, action: onDelete)
        }
    }
}
