const Student = require("../models/Student");
const Teacher = require("../models/Teacher");
const Admin = require("../models/Admin");

// Admins and SuperAdmins live in the same collection.
function getModelForRole(role) {
  if (role === "Student") return Student;
  if (role === "Teacher") return Teacher;
  if (role === "Admin" || role === "SuperAdmin") return Admin;
  return null;
}

async function findUserByEmail(email) {
  return (
    (await Admin.findOne({ email })) ||
    (await Teacher.findOne({ email })) ||
    (await Student.findOne({ email }))
  );
}

module.exports = { getModelForRole, findUserByEmail };
