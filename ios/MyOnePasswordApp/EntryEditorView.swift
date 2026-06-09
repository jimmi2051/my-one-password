import SwiftUI
import UIKit

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
    @State private var isPasswordVisible = false
    @State private var isGenerating = false
    @State private var isSaving = false
    @State private var copiedField: String?
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
                        .textContentType(.name)
                    copyableField("Username", text: $username, systemImage: "person.crop.circle", contentType: .username)
                    passwordField
                    copyableField("Website", text: $url, systemImage: "link", keyboard: .URL)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                    TextField("Notes", text: $notes, axis: .vertical)
                        .lineLimit(4...10)
                } header: {
                    Text("Credential")
                } footer: {
                    Text("Password values are only shown in this unlocked editor and are never persisted locally.")
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
                    Toggle("Include symbols", isOn: $includeSymbols)
                    Button {
                        Task { await generatePassword() }
                    } label: {
                        HStack {
                            if isGenerating {
                                ProgressView()
                            } else {
                                Image(systemName: "sparkles")
                            }
                            Text(isGenerating ? "Generating..." : "Generate Password")
                        }
                    }
                    .disabled(isGenerating)
                }
            }
            .navigationTitle(entry == nil ? "New Entry" : "Edit Entry")
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                        .disabled(isSaving)
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button {
                        Task { await save() }
                    } label: {
                        if isSaving {
                            ProgressView()
                        } else {
                            Text("Save")
                        }
                    }
                    .disabled(title.isEmpty || password.isEmpty || isSaving)
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

    private var passwordField: some View {
        HStack(spacing: 10) {
            Image(systemName: "key.fill")
                .foregroundStyle(.secondary)
            Group {
                if isPasswordVisible {
                    TextField("Password", text: $password)
                        .textContentType(.password)
                } else {
                    SecureField("Password", text: $password)
                        .textContentType(.password)
                }
            }
            .textInputAutocapitalization(.never)
            .autocorrectionDisabled()

            Button {
                isPasswordVisible.toggle()
            } label: {
                Image(systemName: isPasswordVisible ? "eye.slash" : "eye")
            }
            .buttonStyle(.borderless)

            Button {
                copy(password, label: "password")
            } label: {
                Image(systemName: copiedField == "password" ? "checkmark" : "doc.on.doc")
            }
            .buttonStyle(.borderless)
            .disabled(password.isEmpty)
        }
    }

    private func copyableField(
        _ placeholder: String,
        text: Binding<String>,
        systemImage: String,
        keyboard: UIKeyboardType = .default,
        contentType: UITextContentType? = nil
    ) -> some View {
        HStack(spacing: 10) {
            Image(systemName: systemImage)
                .foregroundStyle(.secondary)
            TextField(placeholder, text: text)
                .keyboardType(keyboard)
                .textContentType(contentType)
            Button {
                copy(text.wrappedValue, label: placeholder.lowercased())
            } label: {
                Image(systemName: copiedField == placeholder.lowercased() ? "checkmark" : "doc.on.doc")
            }
            .buttonStyle(.borderless)
            .disabled(text.wrappedValue.isEmpty)
        }
    }

    private func copy(_ value: String, label: String) {
        guard !value.isEmpty else { return }
        UIPasteboard.general.string = value
        copiedField = label
        Task {
            try? await Task.sleep(nanoseconds: 1_500_000_000)
            await MainActor.run {
                if copiedField == label {
                    copiedField = nil
                }
            }
        }
    }

    private func generatePassword() async {
        isGenerating = true
        defer { isGenerating = false }
        do {
            password = try await APIClient.shared.generatePassword(
                PasswordGenerateRequest(length: Int(length), symbols: includeSymbols)
            )
            isPasswordVisible = true
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    private func save() async {
        isSaving = true
        defer { isSaving = false }
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
