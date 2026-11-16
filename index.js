const express = require("express");
require("dotenv").config(); // Load environment variables FIRST
const app = express();
const mongoose = require("mongoose");
const cors = require("cors");
const path = require("path");
const morgan = require("morgan");
const { errorHandler, notFound } = require("./middleware");

const authRoutes = require("./routes/authRoutes");
const courseRoutes = require("./routes/courseRoutes");
const teacherRoutes = require("./routes/teacherRoutes");
const studentRoutes = require("./routes/studentRoutes");
const adminRoutes = require("./routes/adminRoutes");
const assignmentRoutes = require("./routes/assignmentRoutes");
const contactRoutes = require("./routes/contactRoutes");
const cartRoutes = require("./routes/cartRoutes");
const statsRoutes = require("./routes/statsRoutes");
const superAdminRoutes = require("./routes/superAdminRoutes");

// Request logging
app.use(morgan("dev"));

// CORS configuration
const VERCEL_PREVIEW_ORIGIN = /^https:\/\/learning-management-system-frontend[a-z0-9-]*\.vercel\.app$/;
const allowedOrigins = [
  'http://localhost:5173',
  'http://localhost:5174',
  'http://localhost:3000',
  'https://learning-management-system-frontend-gold.vercel.app',
  process.env.FRONTEND_URL,
  process.env.CLIENT_URL,
].filter(Boolean);

app.use(
  cors({
    origin: function (origin, callback) {
      if (!origin) return callback(null, true);
      // Exact allowlist + this project's own Vercel preview URLs only.
      // (A bare endsWith('.vercel.app') would trust every app hosted on Vercel.)
      if (allowedOrigins.includes(origin) || VERCEL_PREVIEW_ORIGIN.test(origin)) {
        return callback(null, true);
      }
      return callback(new Error('Not allowed by CORS'));
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  })
);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use("/uploads", express.static(path.join(__dirname, "uploads")));

const MONGO_URL = process.env.MONGO_URL_ATLAS || process.env.MONGO_URI;

if (!MONGO_URL) {
  console.error(
    "❌ Error: MONGO_URL_ATLAS is not defined. Please check your .env file in backend_lms."
  );
  process.exit(1);
}

// Creates the first SuperAdmin from environment variables, so no default
// password lives in the source code. Additional Admins are created by the
// SuperAdmin through POST /superadmin/admins.
const seedInitialAdmins = async () => {
  try {
    const bcrypt = require("bcryptjs");
    const Admin = require("./models/Admin");

    const existingSuperAdmin = await Admin.findOne({ role: "SuperAdmin" });
    if (existingSuperAdmin) return;

    const email = process.env.SUPERADMIN_EMAIL;
    const password = process.env.SUPERADMIN_PASSWORD;
    if (!email || !password) {
      console.warn(
        "⚠️  No SuperAdmin exists. Set SUPERADMIN_EMAIL and SUPERADMIN_PASSWORD in .env to create one."
      );
      return;
    }
    if (password.length < 12) {
      console.warn("⚠️  SUPERADMIN_PASSWORD must be at least 12 characters. SuperAdmin not created.");
      return;
    }

    await Admin.create({
      name: process.env.SUPERADMIN_NAME || "Platform Owner (SuperAdmin)",
      email,
      password: await bcrypt.hash(password, 10),
      role: "SuperAdmin",
    });
    console.log(`✅ SuperAdmin created: ${email}`);
  } catch (err) {
    console.error("Error seeding admin accounts:", err);
  }
};

mongoose
  .connect(MONGO_URL)
  .then(async () => {
    console.log("mongodb connected successfully");
    await seedInitialAdmins();
  })
  .catch((err) => {
    console.log("err in mongodb connection:", err);
    process.exit(1);
  });

app.use("/auth", authRoutes);
app.use("/courses", courseRoutes);
app.use('/contact', contactRoutes);
app.use('/cart', cartRoutes);
app.use("/teacher", teacherRoutes);
app.use("/student", studentRoutes);
app.use("/admin", adminRoutes);
app.use("/superadmin", superAdminRoutes);
app.use("/assignments", assignmentRoutes);
app.use("/stats", statsRoutes);

app.get("/", (req, res) => {
  res.send("Welcome to server");
});

// Error handling middlewares (must be last)
app.use(notFound);
app.use(errorHandler);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`backend server is running on port ${PORT}....`);
});
