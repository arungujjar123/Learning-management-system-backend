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
      if (allowedOrigins.includes(origin) || origin.endsWith('.vercel.app')) {
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

const seedInitialAdmins = async () => {
  try {
    const bcrypt = require("bcryptjs");
    const Admin = require("./models/Admin");

    // Seed SuperAdmin if not exists
    const existingSuperAdmin = await Admin.findOne({ role: "SuperAdmin" });
    if (!existingSuperAdmin) {
      const hashedPassword = await bcrypt.hash("superadmin123", 10);
      await Admin.create({
        name: "Platform Owner (SuperAdmin)",
        email: "superadmin@lms.com",
        password: hashedPassword,
        role: "SuperAdmin",
      });
      console.log("✅ SuperAdmin seeded: superadmin@lms.com / superadmin123");
    }

    // Seed Admin if not exists
    const existingAdmin = await Admin.findOne({ email: "admin@lms.com" });
    if (!existingAdmin) {
      const hashedPassword = await bcrypt.hash("admin123", 10);
      await Admin.create({
        name: "Platform Manager (Admin)",
        email: "admin@lms.com",
        password: hashedPassword,
        role: "Admin",
      });
      console.log("✅ Admin seeded: admin@lms.com / admin123");
    }
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
