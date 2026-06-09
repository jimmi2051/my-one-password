import SwiftUI

struct UnlockView: View {
    @EnvironmentObject private var appModel: AppModel
    let email: String

    @State private var masterPassword = ""
    @State private var rememberBiometrics = true
    @State private var isUnlocking = false

    var body: some View {
        Form {
            Section {
                Text(email)
                    .foregroundStyle(.secondary)
                SecureField("Master password", text: $masterPassword)
                    .textContentType(.password)
                Toggle("Use Face ID / Touch ID next time", isOn: $rememberBiometrics)
            }

            Section {
                Button {
                    Task { await unlock() }
                } label: {
                    if isUnlocking {
                        ProgressView()
                    } else {
                        Text("Unlock")
                    }
                }
                .disabled(masterPassword.isEmpty || isUnlocking)

                Button {
                    Task { await appModel.unlockWithBiometrics() }
                } label: {
                    Label("Unlock with Face ID / Touch ID", systemImage: "faceid")
                }
            }
        }
        .navigationTitle("Unlock Vault")
    }

    private func unlock() async {
        isUnlocking = true
        await appModel.unlock(masterPassword: masterPassword, rememberForBiometrics: rememberBiometrics)
        masterPassword = ""
        isUnlocking = false
    }
}
