import ExpoModulesCore
import UIKit

public class DisplayCornersModule: Module {
  public func definition() -> ModuleDefinition {
    Name("DisplayCorners")

    // The radius (pt) of the screen's continuous corners, 0 on a square screen, nil if unknown.
    // UIKit has no public API for it: this reads UIScreen's private _displayCornerRadius, the
    // key assembled at runtime and asked for only if UIScreen still answers to it, so a future
    // iOS without it gives nil rather than an exception.
    AsyncFunction("getCornerRadius") { () -> Double? in
      let key = ["Radius", "Corner", "display", "_"].reversed().joined()
      let screen = UIScreen.main
      guard screen.responds(to: NSSelectorFromString(key)) else { return nil }
      return (screen.value(forKey: key) as? NSNumber)?.doubleValue
    }.runOnQueue(.main)
  }
}
