import SwiftUI

struct LoginView: View {
    @EnvironmentObject private var appModel: AppModel

    var body: some View {
        VStack(spacing: 24) {
            Spacer()
            Image(systemName: "lock.shield")
                .font(.system(size: 64))
                .foregroundStyle(.blue)
            Text("My One Password")
                .font(.largeTitle.bold())
            Button {
                appModel.signInWithGoogle()
            } label: {
                Label("Continue with Google", systemImage: "globe")
                    .frame(maxWidth: .infinity)
            }
            .buttonStyle(.borderedProminent)
            Spacer()
        }
        .padding()
    }
}
