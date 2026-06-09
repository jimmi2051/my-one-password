import SwiftUI

struct RootView: View {
    @EnvironmentObject private var appModel: AppModel

    var body: some View {
        Group {
            switch appModel.state {
            case .loading:
                ProgressView()
            case .signedOut:
                LoginView()
            case let .locked(session):
                UnlockView(email: session.email)
            case .unlocked:
                VaultView()
            }
        }
        .alert("My One Password", isPresented: Binding(
            get: { appModel.errorMessage != nil },
            set: { if !$0 { appModel.errorMessage = nil } }
        )) {
            Button("OK", role: .cancel) {}
        } message: {
            Text(appModel.errorMessage ?? "")
        }
    }
}
