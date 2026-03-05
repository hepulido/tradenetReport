import express, { type Express } from "express";
import fs from "fs";
import path from "path";

export function serveStatic(app: Express) {
  const distPath = path.resolve(__dirname, "public");
  if (!fs.existsSync(distPath)) {
    throw new Error(
      `Could not find the build directory: ${distPath}, make sure to build the client first`,
    );
  }

  app.use(express.static(distPath));

  // SPA fallback - only for GET requests to non-API paths
  app.use("*", (req, res) => {
    const url = req.originalUrl;

    // Don't serve HTML for API routes
    if (url.startsWith("/api")) {
      return res.status(404).json({ message: "Not found" });
    }

    // Don't serve HTML for non-GET requests
    if (req.method !== "GET") {
      return res.status(404).json({ message: "Not found" });
    }

    res.sendFile(path.resolve(distPath, "index.html"));
  });
}
