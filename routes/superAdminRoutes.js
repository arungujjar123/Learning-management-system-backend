const express = require("express");
const router = express.Router();
const { verify, verifySuperAdmin } = require("../middleware/verify");
const {
  getOverview,
  getRevenueAnalytics,
  getUserGrowth,
  getTeacherPerformance,
  getCoursePerformance,
  getEnrollmentTrends,
  getAllUsers,
  getDeletedUsers,
  restoreUser,
  getCoursesByCategory,
  getDeletedCourses,
  restoreCourse,
} = require("../controller/superAdminController");

// Protect all /superadmin routes with JWT authentication & SuperAdmin role verification
router.use(verify);
router.use(verifySuperAdmin);

// Analytics & Overview
router.get("/overview", getOverview);
router.get("/revenue", getRevenueAnalytics);
router.get("/analytics/user-growth", getUserGrowth);
router.get("/analytics/teacher-performance", getTeacherPerformance);
router.get("/analytics/course-performance", getCoursePerformance);
router.get("/analytics/enrollment-trends", getEnrollmentTrends);

// User Management & Restore
router.get("/users", getAllUsers);
router.get("/users/deleted", getDeletedUsers);
router.put("/users/:userId/restore", restoreUser);

// Course Management & Restore
router.get("/courses/by-category", getCoursesByCategory);
router.get("/courses/deleted", getDeletedCourses);
router.put("/courses/:courseId/restore", restoreCourse);

module.exports = router;
