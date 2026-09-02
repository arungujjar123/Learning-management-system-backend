const express = require("express");
const router = express.Router();
const teacherController = require("../controller/teacherController");
const { verify, verifyTeacher, upload } = require("../middleware");

// ── Create course ──
router.post(
  "/courses/create_course",
  verify,
  verifyTeacher,
  upload.any(),
  teacherController.createCourse
);

// ── Update course ──
router.put(
  "/courses/:courseId",
  verify,
  verifyTeacher,
  upload.any(),
  teacherController.updateCourse
);

// ── Teacher's own courses ──
router.get(
  "/courses",
  verify,
  verifyTeacher,
  teacherController.getTeacherCourses
);

// ── Teacher qualification verification ──
router.post(
  "/verification/upload",
  verify,
  verifyTeacher,
  upload.single("qualification"),
  teacherController.uploadQualification
);

router.get(
  "/verification/status",
  verify,
  verifyTeacher,
  teacherController.getQualificationStatus
);

// ── Public routes ──
router.get("/courses/get_courses", teacherController.getCourses);
router.get("/courses/get_course_by_id/:courseId", teacherController.getcourseById);
router.get("/", teacherController.getTeachers);

// ── Dashboard routes ──
router.get(
  "/metrics",
  verify,
  verifyTeacher,
  teacherController.getTeacherMetrics
);
router.get(
  "/students",
  verify,
  verifyTeacher,
  teacherController.getEnrolledStudents
);
router.get(
  "/dashboard",
  verify,
  verifyTeacher,
  teacherController.getTeacherDashboard
);

module.exports = router;

