const mongoose = require("mongoose");
const Student = require("../models/Student");
const Course = require("../models/Course");
const Order = require("../models/Order");

class EnrollmentError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

/**
 * Enrolls a student in the given courses and records one completed Order per
 * newly enrolled course, at the course's current price. Revenue analytics read
 * these orders, so every enrollment path must go through this function.
 *
 * Runs in a transaction: the enrollment, the course's student list and the
 * order are written together or not at all. Two concurrent checkouts for the
 * same student both write the same Student document, so MongoDB aborts one
 * with a write conflict and withTransaction retries it, at which point the
 * course already shows as enrolled and no duplicate order is created.
 *
 * @returns {Promise<{ enrolledCourseIds: string[] }>} only the courses that were newly enrolled
 */
async function enrollStudentInCourses(studentId, courseIds) {
  const ids = [...new Set((courseIds || []).map((id) => id?.toString()))].filter((id) =>
    mongoose.isValidObjectId(id)
  );
  if (ids.length === 0) {
    throw new EnrollmentError(400, "Invalid course identifiers provided");
  }

  const session = await mongoose.startSession();
  try {
    let enrolledCourseIds = [];

    await session.withTransaction(async () => {
      const student = await Student.findById(studentId)
        .select("enrolledCourses.course")
        .session(session);
      if (!student) {
        throw new EnrollmentError(404, "Student not found");
      }

      const alreadyEnrolled = new Set(student.enrolledCourses.map((e) => e.course.toString()));
      const courses = await Course.find({ _id: { $in: ids }, isDeleted: { $ne: true } })
        .select("price")
        .session(session);
      const toEnroll = courses.filter((c) => !alreadyEnrolled.has(c._id.toString()));

      enrolledCourseIds = toEnroll.map((c) => c._id.toString());
      if (toEnroll.length === 0) return;

      const now = new Date();
      await Student.updateOne(
        { _id: studentId },
        {
          $push: {
            enrolledCourses: { $each: toEnroll.map((c) => ({ course: c._id, enrolledAt: now })) },
          },
        },
        { session }
      );
      await Course.updateMany(
        { _id: { $in: toEnroll.map((c) => c._id) } },
        { $addToSet: { students: studentId } },
        { session }
      );
      await Order.insertMany(
        toEnroll.map((c) => ({
          userId: studentId,
          courseId: c._id,
          amount: c.price || 0,
          status: "completed",
          createdAt: now,
        })),
        { session }
      );
    });

    return { enrolledCourseIds };
  } finally {
    await session.endSession();
  }
}

module.exports = { enrollStudentInCourses, EnrollmentError };
