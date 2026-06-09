import SwiftUI

struct LoginView: View {
    @EnvironmentObject private var appModel: AppModel

    var body: some View {
        ZStack {
            PremiumVaultTheme.backgroundGradient
                .ignoresSafeArea()

            VStack(spacing: 28) {
                Spacer()

                VStack(spacing: 18) {
                    ZStack {
                        Circle()
                            .fill(.white.opacity(0.14))
                            .frame(width: 112, height: 112)
                        Image(systemName: "lock.shield.fill")
                            .font(.system(size: 54, weight: .semibold))
                            .foregroundStyle(PremiumVaultTheme.goldGradient)
                    }

                    VStack(spacing: 8) {
                        Text("My One Password")
                            .font(.system(size: 40, weight: .bold, design: .rounded))
                            .multilineTextAlignment(.center)
                        Text("Your encrypted vault, ready when you are.")
                            .font(.headline)
                            .foregroundStyle(.secondary)
                            .multilineTextAlignment(.center)
                    }
                }

                VStack(spacing: 14) {
                    Button {
                        appModel.signInWithGoogle()
                    } label: {
                        HStack {
                            if appModel.isSigningIn {
                                ProgressView()
                                    .tint(.black)
                            } else {
                                Image(systemName: "globe")
                            }
                            Text(appModel.isSigningIn ? "Opening Google..." : "Continue with Google")
                                .fontWeight(.semibold)
                        }
                        .frame(maxWidth: .infinity)
                        .frame(height: 54)
                    }
                    .buttonStyle(PremiumPrimaryButtonStyle())
                    .disabled(appModel.isSigningIn)

                    Text("Sign in uses Google OAuth. Vault contents stay encrypted until you unlock with your master password.")
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                        .multilineTextAlignment(.center)
                }

                Spacer()

                HStack(spacing: 10) {
                    Image(systemName: "checkmark.seal.fill")
                        .foregroundStyle(.green)
                    Text("AES-256-GCM vault encryption")
                        .font(.footnote.weight(.medium))
                        .foregroundStyle(.secondary)
                }
            }
            .padding(24)
        }
        .preferredColorScheme(.dark)
    }
}

struct PremiumPrimaryButtonStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .foregroundStyle(.black)
            .background(PremiumVaultTheme.goldGradient)
            .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
            .shadow(color: .yellow.opacity(configuration.isPressed ? 0.12 : 0.28), radius: 18, y: 10)
            .scaleEffect(configuration.isPressed ? 0.98 : 1)
    }
}
