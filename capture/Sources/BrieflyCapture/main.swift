import Foundation

guard CommandLine.arguments.count > 1 else {
    fputs("Usage: BrieflyCapture <session|list-windows>\n", stderr)
    exit(1)
}

switch CommandLine.arguments[1] {
case "session":
    let session = SessionMode()
    session.run()  // blocks until stop_recording received + file flushed
case "list-windows":
    ListWindows.run()  // prints JSON to stdout, exits
default:
    fputs("Unknown mode: \(CommandLine.arguments[1])\n", stderr)
    exit(1)
}
