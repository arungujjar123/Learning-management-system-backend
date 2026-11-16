const Student = require("../models/Student");
const Teacher = require("../models/Teacher");
const Course = require("../models/Course");
const Order = require("../models/Order");
const Admin = require("../models/Admin");
const bcrypt = require("bcryptjs");
const mongoose = require("mongoose");
const { buildBuckets } = require("../utils/analyticsBuckets");

// Revenue split on every completed order. Teacher share is the remainder so
// the two always add up to the total.
const PLATFORM_SHARE = 0.3;
function splitRevenue(total) {
  const platformRevenue = Math.round(total * PLATFORM_SHARE);
  return { platformRevenue, teacherRevenue: total - platformRevenue };
}

// Completed-order revenue and order count per course id
async function revenueByCourse() {
  const rows = await Order.aggregate([
    { $match: { status: "completed" } },
    { $group: { _id: "$courseId", revenue: { $sum: "$amount" }, orders: { $sum: 1 } } },
  ]);
  return new Map(rows.map((r) => [r._id.toString(), r]));
}

function averageRating(ratings) {
  const valid = (ratings || []).filter((r) => typeof r.rating === "number");
  if (valid.length === 0) return { rating: null, reviewCount: 0 };
  const avg = valid.reduce((sum, r) => sum + r.rating, 0) / valid.length;
  return { rating: Math.round(avg * 10) / 10, reviewCount: valid.length };
}

/**
 * SuperAdmin Overview Stats
 * @route GET /superadmin/overview
 */
async function getOverview(req, res) {
  try {
    const totalStudents = await Student.countDocuments({ isDeleted: { $ne: true } });
    const totalTeachers = await Teacher.countDocuments({ isDeleted: { $ne: true } });
    const totalCourses = await Course.countDocuments({ isDeleted: { $ne: true } });
    const totalAdmins = await Admin.countDocuments();
    const deletedStudents = await Student.countDocuments({ isDeleted: true });
    const deletedTeachers = await Teacher.countDocuments({ isDeleted: true });
    const deletedCourses = await Course.countDocuments({ isDeleted: true });

    const orders = await Order.find({ status: "completed" }).select("amount");
    const totalRevenue = orders.reduce((sum, order) => sum + (order.amount || 0), 0);
    const totalOrdersCount = await Order.countDocuments();
    const pendingOrders = await Order.countDocuments({ status: "pending" });
    const failedOrders = await Order.countDocuments({ status: "failed" });
    const { platformRevenue, teacherRevenue } = splitRevenue(totalRevenue);

    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const newStudents = await Student.countDocuments({ _id: { $gte: Math.floor(sevenDaysAgo.getTime() / 1000).toString(16) + "0000000000000000" } });
    const newCourses = await Course.countDocuments({ _id: { $gte: Math.floor(sevenDaysAgo.getTime() / 1000).toString(16) + "0000000000000000" } });
    const newOrders = await Order.countDocuments({ createdAt: { $gte: sevenDaysAgo } });

    res.json({
      success: true,
      data: {
        users: {
          total: totalStudents + totalTeachers + totalAdmins,
          students: totalStudents,
          teachers: totalTeachers,
          admins: totalAdmins,
          deleted: deletedStudents + deletedTeachers,
        },
        courses: {
          total: totalCourses,
          deleted: deletedCourses,
        },
        revenue: {
          total: totalRevenue,
          platformRevenue,
          teacherRevenue,
          totalOrders: totalOrdersCount,
          completedOrders: orders.length,
          pendingOrders,
          failedOrders,
        },
        recentActivity: {
          newStudents,
          newCourses,
          newOrders,
        },
      },
    });
  } catch (error) {
    console.error("Error in getOverview:", error);
    res.status(500).json({ success: false, message: "Server error fetching overview" });
  }
}

/**
 * SuperAdmin Revenue Analytics
 * @route GET /superadmin/revenue
 */
async function getRevenueAnalytics(req, res) {
  try {
    const orders = await Order.find({ status: "completed" }).populate("courseId");
    const totalRevenue = orders.reduce((sum, order) => sum + (order.amount || 0), 0);

    const catTotals = {};
    orders.forEach((o) => {
      const cat = o.courseId?.category || "General";
      catTotals[cat] = (catTotals[cat] || 0) + (o.amount || 0);
    });
    const revenueByCategory = Object.entries(catTotals).map(([cat, total]) => ({
      _id: cat,
      totalRevenue: total,
      ...splitRevenue(total),
    }));

    res.json({
      success: true,
      data: {
        totalRevenue,
        ...splitRevenue(totalRevenue),
        revenueByCategory,
        orders,
      },
    });
  } catch (error) {
    console.error("Error in getRevenueAnalytics:", error);
    res.status(500).json({ success: false, message: "Server error fetching revenue analytics" });
  }
}

/**
 * User Growth Analytics
 * @route GET /superadmin/analytics/user-growth
 */
async function getUserGrowth(req, res) {
  try {
    const range = buildBuckets(req.query.period);
    // Student has no createdAt field; the ObjectId carries the creation time.
    const students = await Student.find({ isDeleted: { $ne: true } }).select("_id").lean();

    const newPerBucket = new Array(range.buckets.length).fill(0);
    let before = 0;
    students.forEach((s) => {
      const createdAt = s._id.getTimestamp();
      if (createdAt < range.start) {
        before += 1;
        return;
      }
      const i = range.indexOf(createdAt);
      if (i >= 0) newPerBucket[i] += 1;
    });

    let running = before;
    const studentGrowth = range.buckets.map((b, i) => {
      running += newPerBucket[i];
      return { _id: b.label, date: b.start, newStudents: newPerBucket[i], count: running };
    });

    res.json({
      success: true,
      data: {
        studentGrowth,
        period: range.period,
        unit: range.unit,
      },
    });
  } catch (error) {
    console.error("Error in getUserGrowth:", error);
    res.status(500).json({ success: false, message: "Server error fetching user growth" });
  }
}

/**
 * Teacher Performance Analytics
 * @route GET /superadmin/analytics/teacher-performance
 */
async function getTeacherPerformance(req, res) {
  try {
    const [teachers, revenueMap] = await Promise.all([
      Teacher.find({ isDeleted: { $ne: true } }).select("-password").populate("courses"),
      revenueByCourse(),
    ]);

    const teacherPerformance = teachers
      .map((t) => {
        const courses = (t.courses || []).filter((c) => c && !c.isDeleted);
        const totalCourses = courses.length;
        let totalStudents = 0;
        let totalRevenue = 0;

        courses.forEach((c) => {
          totalStudents += c.students ? c.students.length : 0;
          totalRevenue += revenueMap.get(c._id.toString())?.revenue || 0;
        });

        return {
          teacherId: t._id,
          name: t.name,
          email: t.email,
          totalCourses,
          totalStudents,
          totalRevenue,
          averageRevenuePerCourse: totalCourses ? Math.round(totalRevenue / totalCourses) : 0,
          verificationStatus: t.verificationStatus || "NotSubmitted",
        };
      })
      .sort((a, b) => b.totalRevenue - a.totalRevenue);

    res.json({
      success: true,
      data: teacherPerformance,
    });
  } catch (error) {
    console.error("Error in getTeacherPerformance:", error);
    res.status(500).json({ success: false, message: "Server error fetching teacher performance" });
  }
}

/**
 * Course Performance Analytics
 * @route GET /superadmin/analytics/course-performance
 */
async function getCoursePerformance(req, res) {
  try {
    const [courses, revenueMap] = await Promise.all([
      Course.find({ isDeleted: { $ne: true } })
        .populate("teacher", "name email")
        .populate("students", "name email"),
      revenueByCourse(),
    ]);

    const coursePerformance = courses.map((c) => {
      const enrolledStudents = c.students ? c.students.length : 0;
      const sales = revenueMap.get(c._id.toString());
      // rating is null when nobody has rated the course yet
      const { rating, reviewCount } = averageRating(c.ratings);

      return {
        courseId: c._id,
        title: c.title,
        level: c.level || "Beginner",
        category: c.category || "General",
        price: c.price || 0,
        teacher: c.teacher,
        enrolledStudents,
        totalRevenue: sales?.revenue || 0,
        orders: sales?.orders || 0,
        rating,
        reviewCount,
      };
    });

    res.json({
      success: true,
      data: coursePerformance,
    });
  } catch (error) {
    console.error("Error in getCoursePerformance:", error);
    res.status(500).json({ success: false, message: "Server error fetching course performance" });
  }
}

/**
 * Enrollment Trends
 * @route GET /superadmin/analytics/enrollment-trends
 */
async function getEnrollmentTrends(req, res) {
  try {
    const range = buildBuckets(req.query.period);

    const [courses, students, orders] = await Promise.all([
      Course.find({ isDeleted: { $ne: true } }).select("category students").lean(),
      Student.find({ "enrolledCourses.enrolledAt": { $gte: range.start } })
        .select("enrolledCourses.enrolledAt")
        .lean(),
      Order.find({ status: "completed", createdAt: { $gte: range.start } })
        .select("amount createdAt")
        .lean(),
    ]);

    // All-time enrollments per category (current students of each course)
    const catMap = {};
    courses.forEach((c) => {
      const cat = c.category || "General";
      catMap[cat] = (catMap[cat] || 0) + (c.students ? c.students.length : 0);
    });
    const categoryEnrollments = Object.keys(catMap).map((cat) => ({
      _id: cat,
      enrollments: catMap[cat],
    }));

    // Enrollments and revenue inside the selected period
    const dailyTrends = range.buckets.map((b) => ({ _id: b.label, date: b.start, enrollments: 0, revenue: 0 }));
    students.forEach((s) => {
      (s.enrolledCourses || []).forEach((e) => {
        const i = e.enrolledAt ? range.indexOf(e.enrolledAt) : -1;
        if (i >= 0) dailyTrends[i].enrollments += 1;
      });
    });
    orders.forEach((o) => {
      const i = range.indexOf(o.createdAt);
      if (i >= 0) dailyTrends[i].revenue += o.amount || 0;
    });

    res.json({
      success: true,
      data: {
        dailyTrends,
        categoryEnrollments,
        period: range.period,
        unit: range.unit,
      },
    });
  } catch (error) {
    console.error("Error in getEnrollmentTrends:", error);
    res.status(500).json({ success: false, message: "Server error fetching enrollment trends" });
  }
}

/**
 * Create an Admin account. Admins cannot self-register.
 * @route POST /superadmin/admins
 */
async function createAdmin(req, res) {
  try {
    const { name, email, password } = req.body || {};
    if (typeof name !== "string" || typeof email !== "string" || typeof password !== "string" || !name.trim() || !email.trim()) {
      return res.status(400).json({ success: false, message: "Name, email and password are required" });
    }
    if (password.length < 8) {
      return res.status(400).json({ success: false, message: "Password must be at least 8 characters" });
    }

    const taken =
      (await Admin.exists({ email })) || (await Teacher.exists({ email })) || (await Student.exists({ email }));
    if (taken) {
      return res.status(409).json({ success: false, message: "User already exists with this email" });
    }

    const admin = await Admin.create({
      name: name.trim(),
      email: email.trim(),
      password: await bcrypt.hash(password, 10),
      role: "Admin",
    });

    res.status(201).json({
      success: true,
      message: "Admin created successfully",
      data: { id: admin._id, name: admin.name, email: admin.email, role: admin.role },
    });
  } catch (error) {
    console.error("Error in createAdmin:", error);
    res.status(500).json({ success: false, message: "Server error creating admin" });
  }
}

/**
 * Fetch All Users (Students, Teachers, Admins)
 * @route GET /superadmin/users
 */
async function getAllUsers(req, res) {
  try {
    const includeDeleted = req.query.includeDeleted === "true";
    const userQuery = includeDeleted ? {} : { isDeleted: { $ne: true } };

    const students = await Student.find(userQuery).select("-password");
    const teachers = await Teacher.find(userQuery).select("-password").populate("courses");
    const admins = await Admin.find().select("-password");

    res.json({
      success: true,
      data: {
        stats: {
          totalUsers: students.length + teachers.length + admins.length,
          students: students.length,
          teachers: teachers.length,
          admins: admins.length,
        },
        students,
        teachers,
        admins,
      },
    });
  } catch (error) {
    console.error("Error in getAllUsers:", error);
    res.status(500).json({ success: false, message: "Server error fetching users" });
  }
}

/**
 * Fetch Deleted Users
 * @route GET /superadmin/users/deleted
 */
async function getDeletedUsers(req, res) {
  try {
    const students = await Student.find({ isDeleted: true }).select("-password");
    const teachers = await Teacher.find({ isDeleted: true }).select("-password");

    res.json({
      success: true,
      data: {
        students,
        teachers,
      },
    });
  } catch (error) {
    console.error("Error in getDeletedUsers:", error);
    res.status(500).json({ success: false, message: "Server error fetching deleted users" });
  }
}

/**
 * Restore Soft-Deleted User
 * @route PUT /superadmin/users/:userId/restore
 */
async function restoreUser(req, res) {
  try {
    const { userId } = req.params;
    const { userType } = req.body;

    const Model = userType === "Teacher" ? Teacher : Student;
    const user = await Model.findById(userId);
    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }
    if (!user.isDeleted) {
      return res.status(400).json({ success: false, message: "User is not deleted" });
    }

    let restoredCoursesCount = 0;
    await mongoose.connection.transaction(async (session) => {
      // Cascade restore: only courses deleted together with this teacher
      // (same deletedAt). Courses an admin deleted on their own stay deleted.
      if (userType === "Teacher" && user.deletedAt) {
        const result = await Course.updateMany(
          { teacher: user._id, isDeleted: true, deletedAt: user.deletedAt },
          { isDeleted: false, deletedAt: null },
          { session }
        );
        restoredCoursesCount = result.modifiedCount;
      }
      user.isDeleted = false;
      user.deletedAt = null;
      await user.save({ session });
    });

    const data = user.toObject();
    delete data.password;
    res.json({
      success: true,
      message: `${userType || "User"} restored successfully`,
      data,
      restoredCoursesCount,
    });
  } catch (error) {
    console.error("Error in restoreUser:", error);
    res.status(500).json({ success: false, message: "Server error restoring user" });
  }
}

/**
 * Courses by Category
 * @route GET /superadmin/courses/by-category
 */
async function getCoursesByCategory(req, res) {
  try {
    const includeDeleted = req.query.includeDeleted === "true";
    const query = includeDeleted ? {} : { isDeleted: { $ne: true } };

    const courses = await Course.find(query).populate("teacher", "name email");

    const categoryMap = {};
    courses.forEach((c) => {
      const catName = c.category || "General";
      if (!categoryMap[catName]) {
        categoryMap[catName] = {
          _id: catName,
          totalCourses: 0,
          totalStudents: 0,
          courses: [],
        };
      }
      categoryMap[catName].totalCourses += 1;
      const studentCount = c.students ? c.students.length : 0;
      categoryMap[catName].totalStudents += studentCount;
      categoryMap[catName].courses.push({
        id: c._id,
        _id: c._id,
        title: c.title,
        price: c.price || 0,
        level: c.level || "Beginner",
        teacher: c.teacher,
        studentCount: studentCount,
      });
    });

    const categoryArray = Object.values(categoryMap);

    res.json({
      success: true,
      data: categoryArray,
    });
  } catch (error) {
    console.error("Error in getCoursesByCategory:", error);
    res.status(500).json({ success: false, message: "Server error fetching courses by category" });
  }
}

/**
 * Fetch Deleted Courses
 * @route GET /superadmin/courses/deleted
 */
async function getDeletedCourses(req, res) {
  try {
    const courses = await Course.find({ isDeleted: true }).populate("teacher", "name email");
    res.json({
      success: true,
      data: courses,
    });
  } catch (error) {
    console.error("Error in getDeletedCourses:", error);
    res.status(500).json({ success: false, message: "Server error fetching deleted courses" });
  }
}

/**
 * Restore Soft-Deleted Course
 * @route PUT /superadmin/courses/:courseId/restore
 */
async function restoreCourse(req, res) {
  try {
    const { courseId } = req.params;
    const existing = await Course.findById(courseId).populate("teacher", "isDeleted");
    if (!existing) {
      return res.status(404).json({ success: false, message: "Course not found" });
    }
    // Referential integrity: a course cannot come back while its teacher is deleted
    if (existing.teacher && existing.teacher.isDeleted) {
      return res.status(409).json({
        success: false,
        message: "Restore the teacher first; this course's teacher is deleted",
      });
    }

    const course = await Course.findByIdAndUpdate(
      courseId,
      { isDeleted: false, deletedAt: null },
      { new: true }
    );

    res.json({
      success: true,
      message: "Course restored successfully",
      data: course,
    });
  } catch (error) {
    console.error("Error in restoreCourse:", error);
    res.status(500).json({ success: false, message: "Server error restoring course" });
  }
}

module.exports = {
  createAdmin,
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
};
