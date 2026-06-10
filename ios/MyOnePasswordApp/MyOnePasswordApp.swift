import SwiftUI

@main
struct MyOnePasswordApp: App {
    @StateObject private var appModel = AppModel()
    @Environment(\.scenePhase) private var scenePhase

    var body: some Scene {
        WindowGroup {
            RootView()
                .environmentObject(appModel)
                .onOpenURL { url in
                    appModel.handleCallback(url)
                }
                .task {
                    await appModel.restoreSession()
                }
        }
        .onChange(of: scenePhase) { newPhase in
            if newPhase == .active {
                Task { await appModel.checkSession() }
            }
        }
    }
}
