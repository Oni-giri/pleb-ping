const esbuild = require("esbuild");
const fs = require("fs");
const path = require("path");

const isWatch = process.argv.includes("--watch");

/** @type {import('esbuild').BuildOptions} */
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
  const srcDir = path.join(__dirname, "src", "hooks");
  const distDir = path.join(__dirname, "dist", "hooks");
  fs.mkdirSync(distDir, { recursive: true });

  const scriptName = "remote-peon.sh";
  const src = path.join(srcDir, scriptName);
  const dest = path.join(distDir, scriptName);

  if (fs.existsSync(src)) {
    fs.copyFileSync(src, dest);
    fs.chmodSync(dest, 0o755);
    console.log(`Copied ${scriptName} to dist/hooks/`);
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
