const express = require("express");
const router = express.Router();
const studentController = require("../controller/studentController");
const { verify, verifyStudent } = require("../middleware");

// Test route
router.get("/test", (req, res) => {
  res.json({
    message: "Student routes working!",
    timestamp: new Date().toISOString(),
  });
});

// Student profile & dashboard
router.get("/", studentController.getStudents);
router.get("/profile", verify, verifyStudent, studentController.studentProfile);
router.get("/dashboard", verify, verifyStudent, studentController.getStudentDashboard);
router.get("/my-courses", verify, verifyStudent, studentController.getStudentMyCourses);

// Enrolled courses & quiz
router.put("/update-enrollCourses", verify, verifyStudent, studentController.updateEnrollCourses);
router.post("/quiz_submit", verify, verifyStudent, studentController.quizSubmission);
router.get("/courses", verify, verifyStudent, studentController.getCoursesByStudentId);
router.get("/quiz-submissions", verify, verifyStudent, studentController.getQuizSubmissions);

// Streak / activity analytics
router.get("/streak", verify, verifyStudent, studentController.getStreakStats);

// Course browsing
router.get("/all-courses", studentController.getAllCourses);
router.get("/courses/:courseId", studentController.getCourseById);

// Enrollment routes
router.post("/courses/:courseId/enroll", verify, verifyStudent, studentController.enrollInCourse);
router.get("/enrolled-courses", verify, verifyStudent, studentController.getEnrolledCourses);

// Student progress
router.post("/progress", verify, verifyStudent, studentController.studentProgress);
router.get("/get-progress", verify, verifyStudent, studentController.getStudentProgress);

// Topic completion
router.post("/mark-topic-complete", verify, verifyStudent, studentController.markTopicComplete);
router.get("/topic-completion", verify, verifyStudent, studentController.getTopicCompletionStatus);

module.exports = router;

