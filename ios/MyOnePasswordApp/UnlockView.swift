import SwiftUI

struct UnlockView: View {
    @EnvironmentObject private var appModel: AppModel
    let email: String

    @State private var masterPassword = ""
    @State private var rememberBiometrics = true
    @State private var isUnlocking = false
    @State private var isBiometricUnlocking = false

    var body: some View {
        ZStack {
            PremiumVaultTheme.backgroundGradient
                .ignoresSafeArea()

            ScrollView {
                VStack(spacing: 24) {
                    VStack(spacing: 14) {
                        Image(systemName: "person.badge.key.fill")
                            .font(.system(size: 56, weight: .semibold))
                            .foregroundStyle(PremiumVaultTheme.goldGradient)
                        Text("Unlock Vault")
                            .font(.system(size: 34, weight: .bold, design: .rounded))
                        Text(email)
                            .font(.subheadline.weight(.medium))
                            .foregroundStyle(.secondary)
                            .lineLimit(1)
                            .minimumScaleFactor(0.75)
                    }
                    .padding(.top, 40)

                    VStack(spacing: 16) {
                        SecureField("Master password", text: $masterPassword)
                            .textContentType(.password)
                            .submitLabel(.go)
                            .onSubmit {
                                Task { await unlock() }
                            }
                            .padding(16)
                            .background(.white.opacity(0.08), in: RoundedRectangle(cornerRadius: 14, style: .continuous))

                        Toggle(isOn: $rememberBiometrics) {
                            VStack(alignment: .leading, spacing: 4) {
                                Text("Enable Face ID / Touch ID")
                                    .font(.subheadline.weight(.semibold))
                                Text("Stores unlock material in protected Keychain only.")
                                    .font(.caption)
                                    .foregroundStyle(.secondary)
                            }
                        }
                        .toggleStyle(.switch)

                        Button {
                            Task { await unlock() }
                        } label: {
                            HStack {
                                if isUnlocking {
                                    ProgressView()
                                        .tint(.black)
                                } else {
                                    Image(systemName: "lock.open.fill")
                                }
                                Text(isUnlocking ? "Unlocking..." : "Unlock Vault")
                                    .fontWeight(.semibold)
                            }
                            .frame(maxWidth: .infinity)
                            .frame(height: 54)
                        }
                        .buttonStyle(PremiumPrimaryButtonStyle())
                        .disabled(masterPassword.isEmpty || isUnlocking || isBiometricUnlocking)

                        Button {
                            Task { await biometricUnlock() }
                        } label: {
                            HStack {
                                if isBiometricUnlocking {
                                    ProgressView()
                                } else {
                                    Image(systemName: "faceid")
                                }
                                Text("Unlock with Face ID / Touch ID")
                                    .fontWeight(.semibold)
                            }
                            .frame(maxWidth: .infinity)
                            .frame(height: 52)
                        }
                        .buttonStyle(.bordered)
                        .tint(.white)
                        .disabled(isUnlocking || isBiometricUnlocking)
                    }
                    .padding(18)
                    .background(.ultraThinMaterial, in: RoundedRectangle(cornerRadius: 22, style: .continuous))

                    Label("Wrong-password and expired-session errors are shown without exposing vault data.", systemImage: "shield.lefthalf.filled")
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                        .multilineTextAlignment(.center)
                }
                .padding(24)
            }
        }
        .preferredColorScheme(.dark)
    }

    private func unlock() async {
        guard !masterPassword.isEmpty else { return }
        isUnlocking = true
        await appModel.unlock(masterPassword: masterPassword, rememberForBiometrics: rememberBiometrics)
        masterPassword = ""
        isUnlocking = false
    }

    private func biometricUnlock() async {
        isBiometricUnlocking = true
        await appModel.unlockWithBiometrics()
        isBiometricUnlocking = false
    }
}
