import SwiftUI

@MainActor
final class VaultViewModel: ObservableObject {
    @Published var entries: [VaultEntry] = []
    @Published var categories: [Category] = []
    @Published var search = ""
    @Published var selectedCategoryId: String?
    @Published var isLoading = false
    @Published var errorMessage: String?

    func refresh() async {
        isLoading = true
        defer { isLoading = false }
        do {
            async let entries = APIClient.shared.entries(search: search, categoryId: selectedCategoryId)
            async let categories = APIClient.shared.categories()
            self.entries = try await entries
            self.categories = try await categories
            CredentialIdentitySync.sync(entries: self.entries)
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func deleteEntry(at offsets: IndexSet) async {
        for index in offsets {
            do {
                try await APIClient.shared.deleteEntry(id: entries[index].id)
            } catch {
                errorMessage = error.localizedDescription
            }
        }
        await refresh()
    }
}

struct VaultView: View {
    @EnvironmentObject private var appModel: AppModel
    @StateObject private var viewModel = VaultViewModel()
    @State private var showingEditor = false
    @State private var editingEntry: VaultEntry?
    @State private var showingCategories = false

    var body: some View {
        NavigationStack {
            List {
                if viewModel.isLoading {
                    ProgressView()
                }
                ForEach(viewModel.entries) { entry in
                    Button {
                        editingEntry = entry
                    } label: {
                        VStack(alignment: .leading, spacing: 4) {
                            Text(entry.title)
                                .font(.headline)
                            Text(entry.username ?? entry.url ?? "")
                                .font(.subheadline)
                                .foregroundStyle(.secondary)
                        }
                    }
                }
                .onDelete { offsets in
                    Task { await viewModel.deleteEntry(at: offsets) }
                }
            }
            .searchable(text: $viewModel.search)
            .navigationTitle("Vault")
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Menu {
                        Button("All Categories") {
                            viewModel.selectedCategoryId = nil
                            Task { await viewModel.refresh() }
                        }
                        ForEach(viewModel.categories) { category in
                            Button(category.name) {
                                viewModel.selectedCategoryId = category.id
                                Task { await viewModel.refresh() }
                            }
                        }
                        Divider()
                        Button("Manage Categories") {
                            showingCategories = true
                        }
                    } label: {
                        Label("Categories", systemImage: "folder")
                    }
                }
                ToolbarItem(placement: .topBarTrailing) {
                    Button {
                        showingEditor = true
                    } label: {
                        Label("Add", systemImage: "plus")
                    }
                }
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Logout") {
                        Task { await appModel.logout() }
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
            .task {
                await viewModel.refresh()
            }
            .onChange(of: viewModel.search) {
                Task { await viewModel.refresh() }
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
}
