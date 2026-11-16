// One-time backfill: creates a completed Order for every existing enrollment
// that has none, so revenue analytics include purchases made before checkout
// started recording orders.
//
// The amount is the course's CURRENT price (the price paid back then was never
// stored), and createdAt is the enrollment date.
//
//   node scripts/backfillOrders.js           # dry run: only prints what it would create
//   node scripts/backfillOrders.js --apply   # writes the orders
require("dotenv").config();
const mongoose = require("mongoose");
const Student = require("../models/Student");
const Course = require("../models/Course");
const Order = require("../models/Order");

async function main() {
  const apply = process.argv.includes("--apply");
  const url = process.env.MONGO_URL_ATLAS || process.env.MONGO_URI;
  if (!url) throw new Error("MONGO_URL_ATLAS is not set");
  await mongoose.connect(url);

  const prices = new Map(
    (await Course.find().select("price").lean()).map((c) => [c._id.toString(), c.price || 0])
  );
  const existing = new Set(
    (await Order.find().select("userId courseId").lean()).map((o) => `${o.userId}:${o.courseId}`)
  );

  const toCreate = [];
  const students = await Student.find({ "enrolledCourses.0": { $exists: true } })
    .select("enrolledCourses.course enrolledCourses.enrolledAt")
    .lean();
  for (const s of students) {
    for (const e of s.enrolledCourses) {
      const courseId = e.course?.toString();
      const key = `${s._id}:${courseId}`;
      if (!courseId || !prices.has(courseId) || existing.has(key)) continue;
      existing.add(key); // duplicate enrollment rows get one order
      toCreate.push({
        userId: s._id,
        courseId: e.course,
        amount: prices.get(courseId),
        status: "completed",
        createdAt: e.enrolledAt || s._id.getTimestamp(),
      });
    }
  }

  const total = toCreate.reduce((sum, o) => sum + o.amount, 0);
  console.log(`${toCreate.length} enrollments have no order (total ₹${total.toLocaleString("en-IN")}).`);

  if (!apply) {
    console.log("Dry run. Re-run with --apply to create them.");
  } else if (toCreate.length > 0) {
    await Order.insertMany(toCreate);
    console.log(`Created ${toCreate.length} orders.`);
  }
  await mongoose.disconnect();
}

main().catch(async (err) => {
  console.error(err);
  await mongoose.disconnect();
  process.exit(1);
});
