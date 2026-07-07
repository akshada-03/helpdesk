import index from "./index.html";

const server = Bun.serve({
  port: Number(process.env.PORT ?? 3000),
  routes: {
    // SPA: serve the bundled index.html for all navigation routes.
    // Bun's bundler transpiles the referenced TSX/CSS and serves assets.
    "/*": index,
  },
  development: process.env.NODE_ENV !== "production" && {
    hmr: true,
    console: true,
  },
});

console.log(`Client dev server on ${server.url}`);
