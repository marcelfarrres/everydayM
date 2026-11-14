import Foundation
import Vision
import CoreImage
import AppKit

let args = CommandLine.arguments
let url = URL(fileURLWithPath: args[1])
let out = URL(fileURLWithPath: args[2])
guard let src = CIImage(contentsOf: url, options: [.applyOrientationProperty: true]) else { fatalError("no image") }
let handler = VNImageRequestHandler(ciImage: src)
let request = VNGenerateForegroundInstanceMaskRequest()
try handler.perform([request])
guard let result = request.results?.first else { fatalError("no subject") }
let buffer = try result.generateMaskedImage(ofInstances: result.allInstances, from: handler, croppedToInstancesExtent: CommandLine.arguments.count < 4)
let cut = CIImage(cvPixelBuffer: buffer)
let ctx = CIContext()
let cs = CGColorSpace(name: CGColorSpace.sRGB)!
try ctx.writePNGRepresentation(of: cut, to: out, format: .RGBA8, colorSpace: cs)
print("ok", cut.extent.size)
