import SwiftUI

struct CategoryListView: View {
    @Environment(\.dismiss) private var dismiss

    @State var categories: [Category]
    let onChange: () async -> Void

    @State private var newName = ""
    @State private var pendingDelete: Category?
    @State private var isSaving = false
    @State private var errorMessage: String?

    var body: some View {
        NavigationStack {
            List {
                Section {
                    HStack {
                        TextField("New category name", text: $newName)
                            .submitLabel(.done)
                            .onSubmit {
                                Task { await createCategory() }
                            }
                        Button {
                            Task { await createCategory() }
                        } label: {
                            if isSaving {
                                ProgressView()
                            } else {
                                Text("Add")
                                    .fontWeight(.semibold)
                            }
                        }
                        .disabled(newName.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || isSaving)
                    }
                } header: {
                    Text("Create")
                } footer: {
                    Text("Categories are filters for your encrypted entries. Deleting a category does not delete vault entries.")
                }

                Section("Categories") {
                    if categories.isEmpty {
                        ContentUnavailableView("No categories", systemImage: "folder.badge.plus")
                    } else {
                        ForEach($categories) { $category in
                            HStack {
                                Image(systemName: "folder.fill")
                                    .foregroundStyle(PremiumVaultTheme.goldGradient)
                                TextField("Name", text: $category.name)
                                    .onSubmit {
                                        Task { await updateCategory(category) }
                                    }
                                Button {
                                    pendingDelete = category
                                } label: {
                                    Image(systemName: "trash")
                                }
                                .buttonStyle(.borderless)
                                .foregroundStyle(.red)
                            }
                        }
                    }
                }
            }
            .navigationTitle("Categories")
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("Done") {
                        Task {
                            await onChange()
                            dismiss()
                        }
                    }
                }
            }
            .confirmationDialog(
                "Delete category?",
                isPresented: Binding(
                    get: { pendingDelete != nil },
                    set: { if !$0 { pendingDelete = nil } }
                ),
                presenting: pendingDelete
            ) { category in
                Button("Delete \(category.name)", role: .destructive) {
                    Task { await deleteCategory(category) }
                }
            } message: { _ in
                Text("Entries remain in your vault and will show without this category.")
            }
            .alert("Categories", isPresented: Binding(
                get: { errorMessage != nil },
                set: { if !$0 { errorMessage = nil } }
            )) {
                Button("OK", role: .cancel) {}
            } message: {
                Text(errorMessage ?? "")
            }
        }
    }

    private func createCategory() async {
        let name = newName.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !name.isEmpty else { return }
        isSaving = true
        defer { isSaving = false }
        do {
            let category = try await APIClient.shared.createCategory(name: name)
            categories.append(category)
            newName = ""
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    private func updateCategory(_ category: Category) async {
        let name = category.name.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !name.isEmpty else { return }
        do {
            _ = try await APIClient.shared.updateCategory(id: category.id, name: name)
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    private func deleteCategory(_ category: Category) async {
        do {
            try await APIClient.shared.deleteCategory(id: category.id)
            categories.removeAll { $0.id == category.id }
        } catch {
            errorMessage = error.localizedDescription
        }
    }
}
