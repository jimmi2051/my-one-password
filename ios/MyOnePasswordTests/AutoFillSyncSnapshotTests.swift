import AuthenticationServices
import XCTest
@testable import MyOnePassword

final class AutoFillSyncSnapshotTests: XCTestCase {
    func testSucceededDetailIncludesCountAndSettingsHintWhenProviderDisabled() {
        let snapshot = AutoFillSyncSnapshot(
            outcome: .succeeded,
            syncedCredentialCount: 2,
            attemptedAt: Date(timeIntervalSince1970: 0),
            isProviderEnabled: false
        )

        XCTAssertEqual(snapshot.title, "AutoFill suggestions synced")
        XCTAssertTrue(snapshot.detail.contains("2 username/password suggestions available."))
        XCTAssertTrue(snapshot.detail.contains("Enable My One Password in iOS Password AutoFill settings."))
    }

    func testFailedDetailShowsActionableFailureMessage() {
        let snapshot = AutoFillSyncSnapshot(
            outcome: .failed("Check Associated Domains and App Groups."),
            syncedCredentialCount: 0,
            attemptedAt: Date(timeIntervalSince1970: 0),
            isProviderEnabled: nil
        )

        XCTAssertEqual(snapshot.title, "AutoFill sync needs attention")
        XCTAssertEqual(snapshot.detail, "Check Associated Domains and App Groups.")
    }

    func testServiceIdentifierNormalizesBareDomains() throws {
        let identifier = try XCTUnwrap(CredentialIdentitySync.serviceIdentifier(for: "example.com/login"))

        XCTAssertEqual(identifier.identifier, "example.com")
        XCTAssertEqual(identifier.type, .domain)
    }

    func testServiceIdentifierRejectsEmptyURL() {
        XCTAssertNil(CredentialIdentitySync.serviceIdentifier(for: ""))
        XCTAssertNil(CredentialIdentitySync.serviceIdentifier(for: nil))
    }
}
