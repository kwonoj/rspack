const fs = require("fs");
const path = require("path");

// PNG signature: 89 50 4E 47 0D 0A 1A 0A
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

// Full minimal PNG (1x1 transparent pixel)
const TEST_PNG = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, // PNG signature
  0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52, // IHDR chunk length + type
  0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, // 1x1 dimensions
  0x08, 0x02, 0x00, 0x00, 0x00, 0x90, 0x77, 0x53, 0xde, // IHDR data + CRC
  0x00, 0x00, 0x00, 0x0c, 0x49, 0x44, 0x41, 0x54, // IDAT chunk
  0x08, 0xd7, 0x63, 0x00, 0x01, 0x00, 0x00, 0x05, 0x00, 0x01, 0x0d, 0x0a,
  0x2d, 0xb4, // IDAT data + CRC
  0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82, // IEND
]);

class BinaryIntegrityPlugin {
  apply(compiler) {
    compiler.hooks.compilation.tap("BinaryIntegrityPlugin", (compilation) => {
      compilation.hooks.processAssets.tap(
        {
          name: "BinaryIntegrityPlugin",
          stage: compilation.PROCESS_ASSETS_STAGE_OPTIMIZE,
        },
        (assets) => {
          for (const [filename, asset] of Object.entries(assets)) {
            if (filename.endsWith(".png")) {
              // Simulate what an image compression plugin does:
              // Get the asset source as buffer using the buffer() method
              const buffer = asset.buffer();

              // Check PNG signature (first 8 bytes)
              const signature = buffer.subarray(0, 8);
              if (!signature.equals(PNG_SIGNATURE)) {
                throw new Error(
                  `Binary data corruption in ${filename}! ` +
                  `Expected PNG signature: ${PNG_SIGNATURE.toString('hex')}, ` +
                  `Got: ${signature.toString('hex')}`
                );
              }
            }
          }
        }
      );
    });
  }
}

/** @type {import('@rspack/test-tools').TCompilerCaseConfig} */
module.exports = {
  description: "should preserve binary asset integrity for plugin access",
  options(context) {
    const sourcePath = context.getSource();

    // Write the test files
    fs.writeFileSync(path.join(sourcePath, "test.png"), TEST_PNG);
    fs.writeFileSync(
      path.join(sourcePath, "index.js"),
      'import img from "./test.png"; export default img;'
    );

    return {
      context: sourcePath,
      entry: "./index.js",
      plugins: [new BinaryIntegrityPlugin()],
    };
  },
  async build(context, compiler) {
    const stats = await new Promise((resolve, reject) => {
      compiler.run((err, stats) => {
        if (err) {
          return reject(err);
        }
        resolve(stats);
      });
    });

    if (stats.hasErrors()) {
      console.log("Compilation errors:");
      for (const error of stats.compilation.errors) {
        console.log(error.message);
      }
    }

    expect(stats.hasErrors()).toBe(false);
  },
};
