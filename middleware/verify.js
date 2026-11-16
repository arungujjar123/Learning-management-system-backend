const jwt = require("jsonwebtoken");
const Admin = require("../models/Admin");
const { JWT_SECRET, RESET_TOKEN_PURPOSE } = require("../config/jwt");
const { getModelForRole } = require("../utils/userModels");

// Middleware to verify any logged-in user (Student / Teacher / Admin / SuperAdmin).
// Besides checking the signature and expiry, it loads the user so that a
// soft-deleted account loses access immediately, not only at its next login.
async function verify(req, res, next) {
  try {
    let token;

    // Check for token in Authorization header first
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith("Bearer ")) {
      token = authHeader.split(" ")[1];
    } else if (authHeader) {
      token = authHeader;
    } else if (req.query?.token) {
      token = req.query.token;
    } else if (req.body?.token) {
      token = req.body.token;
    }

    if (!token) {
      return res.status(401).json({ message: "Access denied, no token provided", success: false, error: true });
    }

    let payload;
    try {
      payload = jwt.verify(token, JWT_SECRET);
    } catch (error) {
      return res.status(401).json({ message: "Invalid or expired token", success: false, error: true });
    }

    // A password-reset token is signed with the same secret but is not a login token.
    if (payload.purpose === RESET_TOKEN_PURPOSE) {
      return res.status(401).json({ message: "Invalid or expired token", success: false, error: true });
    }

    const Model = getModelForRole(payload.role);
    const user = Model ? await Model.findById(payload._id).select("role isDeleted").lean() : null;
    if (!user || user.role !== payload.role) {
      return res.status(401).json({ message: "Invalid or expired token", success: false, error: true });
    }
    if (user.isDeleted) {
      return res.status(401).json({ message: "This account has been deactivated", success: false, error: true });
    }

    req.user = payload;
    next();
  } catch (error) {
    console.error("Error in verify middleware:", error.message);
    return res.status(500).json({ message: "Server error during authentication", success: false, error: true });
  }
}

// Middleware to verify Admin only
async function verifyAdmin(req, res, next) {
  try {
    if (!req.user) {
      return res.status(401).json({ message: "Access denied, not authenticated", success: false, error: true });
    }

    const admin = await Admin.findById(req.user._id);
    if (!admin || (admin.role.toLowerCase() !== "admin" && admin.role.toLowerCase() !== "superadmin")) {
      return res.status(403).json({ message: "Access denied, Admins only", success: false, error: true });
    }

    req.user = admin;
    next();
  } catch (error) {
    console.error("Error in verifyAdmin middleware:", error.message);
    return res.status(403).json({ message: "Access denied or invalid token", success: false, error: true });
  }
}

// Middleware to verify SuperAdmin only
async function verifySuperAdmin(req, res, next) {
  try {
    if (!req.user) {
      return res.status(401).json({ message: "Access denied, not authenticated", success: false, error: true });
    }

    const admin = await Admin.findById(req.user._id);
    if (!admin || admin.role !== "SuperAdmin") {
      return res.status(403).json({ message: "Access denied, SuperAdmins only", success: false, error: true });
    }

    req.user = admin;
    next();
  } catch (error) {
    console.error("Error in verifySuperAdmin middleware:", error.message);
    return res.status(403).json({ message: "Access denied or invalid token", success: false, error: true });
  }
}

// Middleware to verify Teacher only
function verifyTeacher(req, res, next) {
  try {
    if (!req.user) {
      return res.status(401).json({ message: "Access denied, not authenticated", success: false, error: true });
    }
    if (req.user.role !== "Teacher") {
      return res.status(403).json({ message: "Only teachers can access this resource", success: false, error: true });
    }
    next();
  } catch (error) {
    console.error("Error in verifyTeacher middleware:", error.message);
    return res.status(500).json({ message: "Server error", success: false, error: true });
  }
}

// Middleware to verify Student only
function verifyStudent(req, res, next) {
  try {
    if (!req.user) {
      return res.status(401).json({ message: "Access denied, not authenticated", success: false, error: true });
    }
    if (req.user.role !== "Student") {
      return res.status(403).json({ message: "Only students can access this resource", success: false, error: true });
    }
    next();
  } catch (error) {
    console.error("Error in verifyStudent middleware:", error.message);
    return res.status(500).json({ message: "Server error", success: false, error: true });
  }
}

module.exports = { verify, verifyAdmin, verifySuperAdmin, verifyTeacher, verifyStudent };
