import { Request, Response, NextFunction } from "express";
import admin from "firebase-admin";

// Initialize Firebase Admin (for verifying tokens)
// Supports: 1) Service account JSON, 2) Application Default Credentials (gcloud auth), 3) Mock auth
function initializeFirebaseAdmin() {
  if (admin.apps.length) return true;

  // Option 1: Service account JSON from env
  const serviceAccount = process.env.FIREBASE_SERVICE_ACCOUNT
    ? JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)
    : null;

  if (serviceAccount) {
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
    });
    console.log("[auth] Firebase Admin initialized with service account");
    return true;
  }

  // Option 2: Application Default Credentials (gcloud auth application-default login)
  if (process.env.VITE_FIREBASE_PROJECT_ID) {
    try {
      admin.initializeApp({
        credential: admin.credential.applicationDefault(),
        projectId: process.env.VITE_FIREBASE_PROJECT_ID,
      });
      console.log("[auth] Firebase Admin initialized with Application Default Credentials");
      return true;
    } catch (error) {
      // ADC not available
    }
  }

  // Option 3: Mock auth for development
  console.warn("[auth] Firebase Admin not initialized - using mock auth");
  return false;
}

initializeFirebaseAdmin();

export interface AuthRequest extends Request {
  user?: {
    uid: string;
    email: string;
    name?: string;
  };
}

// Middleware to verify Firebase token
export async function requireAuth(req: AuthRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;

  if (!authHeader?.startsWith("Bearer ")) {
    return res.status(401).json({ error: "No token provided" });
  }

  const token = authHeader.split("Bearer ")[1];

  try {
    if (admin.apps.length) {
      // Verify with Firebase Admin
      const decoded = await admin.auth().verifyIdToken(token);
      req.user = {
        uid: decoded.uid,
        email: decoded.email || "",
        name: decoded.name,
      };
    } else {
      // Development mode - decode JWT without verification
      // WARNING: Only for development!
      const payload = JSON.parse(Buffer.from(token.split(".")[1], "base64").toString());
      req.user = {
        uid: payload.user_id || payload.sub,
        email: payload.email || "",
        name: payload.name,
      };
    }
    next();
  } catch (error) {
    console.error("[auth] Token verification failed:", error);
    return res.status(401).json({ error: "Invalid token" });
  }
}

// Optional auth - doesn't fail if no token
export async function optionalAuth(req: AuthRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;

  if (!authHeader?.startsWith("Bearer ")) {
    return next();
  }

  const token = authHeader.split("Bearer ")[1];

  try {
    if (admin.apps.length) {
      const decoded = await admin.auth().verifyIdToken(token);
      req.user = {
        uid: decoded.uid,
        email: decoded.email || "",
        name: decoded.name,
      };
    } else {
      const payload = JSON.parse(Buffer.from(token.split(".")[1], "base64").toString());
      req.user = {
        uid: payload.user_id || payload.sub,
        email: payload.email || "",
        name: payload.name,
      };
    }
  } catch (error) {
    // Ignore errors for optional auth
  }

  next();
}
