// Production build for the client.
//
// This exists because `bun build` (the CLI) does not read the plugin list in
// bunfig.toml — that `[serve.static]` section applies only to the dev server in
// serve.ts. Building via the CLI therefore emitted CSS with the @tailwind and
// @theme directives untouched and not a single utility class, so the deployed
// app rendered unstyled while localhost looked correct. The plugin has to be
// passed explicitly, which means going through the JS API.
import { rm } from "node:fs/promises";
import tailwind from "bun-plugin-tailwind";

const outdir = "./dist";

// Output filenames are content-hashed, so stale bundles from earlier builds
// would otherwise accumulate and ship alongside the current ones.
await rm(outdir, { recursive: true, force: true });

const result = await Bun.build({
  entrypoints: ["./index.html"],
  outdir,
  minify: true,
  plugins: [tailwind],
});

if (!result.success) {
  console.error("Build failed:");
  for (const log of result.logs) console.error(log);
  process.exit(1);
}

console.log(`Built ${result.outputs.length} files to ${outdir}`);
