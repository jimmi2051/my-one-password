import SwiftUI

struct EntryEditorView: View {
    @Environment(\.dismiss) private var dismiss

    let entry: VaultEntry?
    let categories: [Category]
    let onSave: () async -> Void

    @State private var title: String
    @State private var username: String
    @State private var password: String
    @State private var url: String
    @State private var notes: String
    @State private var categoryId: String
    @State private var length = 20.0
    @State private var includeSymbols = false
    @State private var errorMessage: String?

    init(entry: VaultEntry?, categories: [Category], onSave: @escaping () async -> Void) {
        self.entry = entry
        self.categories = categories
        self.onSave = onSave
        _title = State(initialValue: entry?.title ?? "")
        _username = State(initialValue: entry?.username ?? "")
        _password = State(initialValue: entry?.password ?? "")
        _url = State(initialValue: entry?.url ?? "")
        _notes = State(initialValue: entry?.notes ?? "")
        _categoryId = State(initialValue: entry?.categoryId ?? "")
    }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    TextField("Title", text: $title)
                    TextField("Username", text: $username)
                        .textContentType(.username)
                    SecureField("Password", text: $password)
                        .textContentType(.password)
                    TextField("URL", text: $url)
                        .keyboardType(.URL)
                        .textInputAutocapitalization(.never)
                    TextField("Notes", text: $notes, axis: .vertical)
                        .lineLimit(3...8)
                }

                Section("Category") {
                    Picker("Category", selection: $categoryId) {
                        Text("None").tag("")
                        ForEach(categories) { category in
                            Text(category.name).tag(category.id)
                        }
                    }
                }

                Section("Password Generator") {
                    Stepper("Length: \(Int(length))", value: $length, in: 8...64, step: 1)
                    Toggle("Symbols", isOn: $includeSymbols)
                    Button("Generate Password") {
                        Task { await generatePassword() }
                    }
                }
            }
            .navigationTitle(entry == nil ? "New Entry" : "Edit Entry")
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Save") {
                        Task { await save() }
                    }
                    .disabled(title.isEmpty || password.isEmpty)
                }
            }
            .alert("Entry", isPresented: Binding(
                get: { errorMessage != nil },
                set: { if !$0 { errorMessage = nil } }
            )) {
                Button("OK", role: .cancel) {}
            } message: {
                Text(errorMessage ?? "")
            }
        }
    }

    private func generatePassword() async {
        do {
            password = try await APIClient.shared.generatePassword(
                PasswordGenerateRequest(length: Int(length), symbols: includeSymbols)
            )
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    private func save() async {
        let payload = EntryPayload(
            title: title,
            username: username.nilIfEmpty,
            password: password,
            url: url.nilIfEmpty,
            notes: notes.nilIfEmpty,
            categoryId: categoryId.nilIfEmpty
        )
        do {
            if let entry {
                _ = try await APIClient.shared.updateEntry(id: entry.id, payload: payload)
            } else {
                _ = try await APIClient.shared.createEntry(payload)
            }
            await onSave()
            dismiss()
        } catch {
            errorMessage = error.localizedDescription
        }
    }
}

private extension String {
    var nilIfEmpty: String? {
        isEmpty ? nil : self
    }
}
