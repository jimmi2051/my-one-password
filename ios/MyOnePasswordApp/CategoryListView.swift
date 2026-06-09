import SwiftUI

struct CategoryListView: View {
    @Environment(\.dismiss) private var dismiss

    @State var categories: [Category]
    let onChange: () async -> Void

    @State private var newName = ""
    @State private var errorMessage: String?

    var body: some View {
        NavigationStack {
            List {
                Section("New Category") {
                    HStack {
                        TextField("Name", text: $newName)
                        Button("Add") {
                            Task { await createCategory() }
                        }
                        .disabled(newName.isEmpty)
                    }
                }

                Section("Categories") {
                    ForEach($categories) { $category in
                        TextField("Name", text: $category.name)
                            .onSubmit {
                                Task { await updateCategory(category) }
                            }
                    }
                    .onDelete { offsets in
                        Task { await deleteCategories(offsets) }
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
        do {
            let category = try await APIClient.shared.createCategory(name: newName)
            categories.append(category)
            newName = ""
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    private func updateCategory(_ category: Category) async {
        do {
            _ = try await APIClient.shared.updateCategory(id: category.id, name: category.name)
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    private func deleteCategories(_ offsets: IndexSet) async {
        for index in offsets {
            do {
                try await APIClient.shared.deleteCategory(id: categories[index].id)
            } catch {
                errorMessage = error.localizedDescription
            }
        }
        categories.remove(atOffsets: offsets)
    }
}
