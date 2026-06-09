import SwiftUI

@main
struct MyOnePasswordApp: App {
    @StateObject private var appModel = AppModel()

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
    }
}
