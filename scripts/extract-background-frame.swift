// macOS: swiftc -parse-as-library scripts/extract-background-frame.swift -o /tmp/extract-background-frame
// /tmp/extract-background-frame input.mp4 output.png
// Decode at time zero, without re-encoding the video or changing its framing.
import AVFoundation
import ImageIO
import UniformTypeIdentifiers

@main
struct ExtractBackgroundFrame {
    static func main() async throws {
        guard CommandLine.arguments.count == 3 else {
            fatalError("Usage: extract-background-frame input.mp4 output.png")
        }
        let asset = AVURLAsset(url: URL(fileURLWithPath: CommandLine.arguments[1]))
        let generator = AVAssetImageGenerator(asset: asset)
        generator.appliesPreferredTrackTransform = true
        generator.requestedTimeToleranceBefore = .zero
        generator.requestedTimeToleranceAfter = .zero
        let frame = try await generator.image(at: .zero)
        guard frame.actualTime == .zero else {
            fatalError("Decoder did not return the exact first frame")
        }
        let output = URL(fileURLWithPath: CommandLine.arguments[2])
        guard let destination = CGImageDestinationCreateWithURL(output as CFURL,
            UTType.png.identifier as CFString, 1, nil) else {
            fatalError("Cannot create PNG output")
        }
        CGImageDestinationAddImage(destination, frame.image, nil)
        guard CGImageDestinationFinalize(destination) else {
            fatalError("Cannot save PNG output")
        }
        print("First frame: \(frame.image.width)×\(frame.image.height), time \(frame.actualTime.seconds)s")
    }
}
