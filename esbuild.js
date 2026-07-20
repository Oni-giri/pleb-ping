const esbuild = require("esbuild");
const fs = require("fs");
const path = require("path");

const isWatch = process.argv.includes("--watch");

const buildOptions = {
  entryPoints: ["src/extension.ts"],
  bundle: true,
  outfile: "dist/extension.js",
  external: ["vscode"],
  format: "cjs",
  platform: "node",
  target: "node18",
  sourcemap: true,
  minify: false,
};

// Copy hook script to dist
function copyHookScript() {
  const src = path.join(__dirname, "src", "hooks", "remote-peon.sh");
  const destDir = path.join(__dirname, "dist", "hooks");
  const dest = path.join(destDir, "remote-peon.sh");

  fs.mkdirSync(destDir, { recursive: true });
  if (fs.existsSync(src)) {
    fs.copyFileSync(src, dest);
    fs.chmodSync(dest, 0o755);
  }
}

async function main() {
  if (isWatch) {
    const ctx = await esbuild.context(buildOptions);
    await ctx.watch();
    copyHookScript();
    console.log("Watching for changes...");
  } else {
    await esbuild.build(buildOptions);
    copyHookScript();
    console.log("Build complete.");
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
