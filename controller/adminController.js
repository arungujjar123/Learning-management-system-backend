const Student = require("../models/Student");
const Teacher = require("../models/Teacher");
const Course = require("../models/Course");
const mongoose = require("mongoose");

// 🟢 Dashboard Data
const getDashboardData = async (req, res) => {
  try {
    const studentCount = await Student.countDocuments({ isDeleted: { $ne: true } });
    const teacherCount = await Teacher.countDocuments({ isDeleted: { $ne: true } });
    const courseCount = await Course.countDocuments({ isDeleted: { $ne: true } });

    res.status(200).json({
      success: true,
      message: "Dashboard data fetched successfully",
      data: { studentCount, teacherCount, courseCount },
    });
  } catch (error) {
    console.error("Dashboard Error:", error);
    res.status(500).json({
      success: false,
      message: "Server error while fetching dashboard data",
    });
  }
};

// 👥 Get All Users
const getAllUsers = async (req, res) => {
  try {
    const students = await Student.find({ isDeleted: { $ne: true } }).select(
      "-password",
    ); // hide passwords and exclude deleted
    const teachers = await Teacher.find({ isDeleted: { $ne: true } }).select(
      "-password",
    );

    res.status(200).json({
      success: true,
      message: "All users retrieved successfully",
      data: { students, teachers },
    });
  } catch (error) {
    console.error("Users Error:", error);
    res.status(500).json({
      success: false,
      message: "Server error while fetching users",
    });
  }
};

// 📚 Get All Courses
const getAllCourses = async (req, res) => {
  try {
    const courses = await Course.find({ isDeleted: { $ne: true } }).populate(
      "teacher",
      "name email",
    );
    res.status(200).json({
      success: true,
      message: "All courses retrieved successfully",
      data: courses,
    });
  } catch (error) {
    console.error("Courses Error:", error);
    res.status(500).json({
      success: false,
      message: "Server error while fetching courses",
    });
  }
};

// ❌ Delete Course (Soft Delete)
const deleteCourse = async (req, res) => {
  try {
    const course = await Course.findById(req.params.id);
    if (!course) {
      return res.status(404).json({
        success: false,
        message: "Course not found",
      });
    }

    // Soft delete
    course.isDeleted = true;
    course.deletedAt = new Date();
    await course.save();

    res.status(200).json({
      success: true,
      message: "Course deleted successfully",
    });
  } catch (error) {
    console.error("Delete Error:", error);
    res.status(500).json({
      success: false,
      message: "Server error while deleting course",
    });
  }
};

// 📖 Get Course by ID for Admin
const getCourseById = async (req, res) => {
  try {
    const { courseId } = req.params;

    const course = await Course.findById(courseId)
      .populate("teacher", "name email verificationStatus");

    if (!course) {
      return res.status(404).json({
        success: false,
        message: "Course not found",
      });
    }

    // Find all students who have enrolled in this course
    const enrolledStudents = await Student.find({
      "enrolledCourses.course": courseId,
      isDeleted: { $ne: true }
    })
      .select("name email enrolledCourses")
      .lean();

    // Format student data with enrollment details
    const studentsWithDetails = enrolledStudents.map(student => {
      const enrollment = student.enrolledCourses.find(
        ec => ec.course.toString() === courseId
      );
      
      return {
        _id: student._id,
        name: student.name,
        email: student.email,
        enrolledAt: enrollment?.enrolledAt,
        quizScoresCount: enrollment?.quizScores?.length || 0,
        completedTopicsCount: enrollment?.completedTopics?.length || 0
      };
    });

    res.status(200).json({
      success: true,
      message: "Course retrieved successfully",
      data: {
        ...course.toObject(),
        enrolledStudents: studentsWithDetails,
        enrolledCount: studentsWithDetails.length
      },
    });
  } catch (error) {
    console.error("Course Detail Error:", error);
    res.status(500).json({
      success: false,
      message: "Server error while fetching course details",
    });
  }
};

// 👨‍🏫 Get Teacher Details by ID
const getTeacherById = async (req, res) => {
  try {
    const { teacherId } = req.params;

    const teacher = await Teacher.findById(teacherId)
      .select("-password")
      .populate("courses", "title description thumbnail");

    if (!teacher) {
      return res.status(404).json({
        success: false,
        message: "Teacher not found",
      });
    }

    res.status(200).json({
      success: true,
      message: "Teacher details retrieved successfully",
      data: teacher,
    });
  } catch (error) {
    console.error("Teacher Detail Error:", error);
    res.status(500).json({
      success: false,
      message: "Server error while fetching teacher details",
    });
  }
};

// ❌ Delete Teacher (Soft Delete)
const deleteTeacher = async (req, res) => {
  try {
    const { teacherId } = req.params;

    // Find teacher first to check if they have courses
    const teacher = await Teacher.findById(teacherId);

    if (!teacher) {
      return res.status(404).json({
        success: false,
        message: "Teacher not found",
      });
    }

    // Teacher + their live courses are soft-deleted in ONE transaction with the
    // SAME timestamp. Same timestamp marks "deleted by this cascade", so restore
    // brings back exactly these courses, not ones an admin removed separately.
    // Transaction: no half-deleted state if one of the writes fails.
    const deletedAt = new Date();
    let deletedCoursesCount = 0;
    await mongoose.connection.transaction(async (session) => {
      const result = await Course.updateMany(
        { teacher: teacherId, isDeleted: { $ne: true } },
        { isDeleted: true, deletedAt },
        { session }
      );
      deletedCoursesCount = result.modifiedCount;

      teacher.isDeleted = true;
      teacher.deletedAt = deletedAt;
      await teacher.save({ session });
    });

    res.status(200).json({
      success: true,
      message: "Teacher and their courses deleted successfully",
      data: {
        deletedCoursesCount,
      },
    });
  } catch (error) {
    console.error("Delete Teacher Error:", error);
    res.status(500).json({
      success: false,
      message: "Server error while deleting teacher",
    });
  }
};

// ❌ Delete Student (Soft Delete)
const deleteStudent = async (req, res) => {
  try {
    const { studentId } = req.params;

    const student = await Student.findById(studentId);

    if (!student) {
      return res.status(404).json({
        success: false,
        message: "Student not found",
      });
    }

    // Soft delete the student
    student.isDeleted = true;
    student.deletedAt = new Date();
    await student.save();

    res.status(200).json({
      success: true,
      message: "Student deleted successfully",
    });
  } catch (error) {
    console.error("Delete Student Error:", error);
    res.status(500).json({
      success: false,
      message: "Server error while deleting student",
    });
  }
};

// ✅ Approve Teacher Verification
const approveTeacher = async (req, res) => {
  try {
    const { teacherId } = req.params;
    const { notes } = req.body;

    const teacher = await Teacher.findById(teacherId);

    if (!teacher) {
      return res.status(404).json({
        success: false,
        message: "Teacher not found",
      });
    }

    teacher.verificationStatus = "Verified";
    teacher.verificationNotes =
      notes || "Your qualification has been verified and approved by admin.";
    await teacher.save();

    res.status(200).json({
      success: true,
      message: "Teacher verification approved successfully",
      data: teacher,
    });
  } catch (error) {
    console.error("Approve Teacher Error:", error);
    res.status(500).json({
      success: false,
      message: "Server error while approving teacher",
    });
  }
};

// ❌ Reject Teacher Verification
const rejectTeacher = async (req, res) => {
  try {
    const { teacherId } = req.params;
    const { notes } = req.body;

    const teacher = await Teacher.findById(teacherId);

    if (!teacher) {
      return res.status(404).json({
        success: false,
        message: "Teacher not found",
      });
    }

    teacher.verificationStatus = "Rejected";
    teacher.verificationNotes =
      notes ||
      "Your qualification document was rejected. Please re-upload a valid document.";
    await teacher.save();

    res.status(200).json({
      success: true,
      message: "Teacher verification rejected",
      data: teacher,
    });
  } catch (error) {
    console.error("Reject Teacher Error:", error);
    res.status(500).json({
      success: false,
      message: "Server error while rejecting teacher",
    });
  }
};

// 🗑️ Get Deleted Members (Students and Teachers)
const getDeletedMembers = async (req, res) => {
  try {
    const deletedStudents = await Student.find({ isDeleted: true })
      .select("-password")
      .sort({ deletedAt: -1 });

    const deletedTeachers = await Teacher.find({ isDeleted: true })
      .select("-password")
      .sort({ deletedAt: -1 });

    res.status(200).json({
      success: true,
      message: "Deleted members retrieved successfully",
      data: {
        students: deletedStudents,
        teachers: deletedTeachers,
      },
    });
  } catch (error) {
    console.error("Get Deleted Members Error:", error);
    res.status(500).json({
      success: false,
      message: "Server error while fetching deleted members",
    });
  }
};

module.exports = {
  getDashboardData,
  getAllUsers,
  getAllCourses,
  deleteCourse,
  getCourseById,
  getTeacherById,
  deleteTeacher,
  deleteStudent,
  approveTeacher,
  rejectTeacher,
  getDeletedMembers,
};
