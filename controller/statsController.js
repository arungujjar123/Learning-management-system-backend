const Student = require("../models/Student");
const Teacher = require("../models/Teacher");
const Course = require("../models/Course");

const notDeleted = { isDeleted: { $ne: true } };

/**
 * Platform counts shown on the public home page. Students and teachers live in
 * separate collections, so they are counted per model rather than by a role
 * string. Soft-deleted users and courses are not counted.
 */
async function computePlatformStats() {
  const [students, instructors, courses, materials, videoData] = await Promise.all([
    Student.countDocuments(notDeleted),
    Teacher.countDocuments(notDeleted),
    Course.countDocuments(notDeleted),
    Course.countDocuments({ ...notDeleted, notes: { $exists: true, $ne: "" } }),
    // Each topic in each chapter has one video
    Course.aggregate([
      { $match: notDeleted },
      { $unwind: "$chapters" },
      { $project: { topics: { $size: { $ifNull: ["$chapters.topics", []] } } } },
      { $group: { _id: null, total: { $sum: "$topics" } } },
    ]),
  ]);

  return {
    students,
    instructors,
    videos: videoData[0]?.total || 0,
    materials,
    courses,
  };
}

// GET /courses/stats/public
async function getPublicStats(req, res) {
  try {
    const stats = await computePlatformStats();
    res.status(200).json({ success: true, stats });
  } catch (error) {
    console.error("Error fetching stats:", error);
    res.status(500).json({ success: false, message: "Server Error" });
  }
}

module.exports = { computePlatformStats, getPublicStats };
