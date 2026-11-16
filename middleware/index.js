// Centralized middleware exports
const {
  verify,
  verifyAdmin,
  verifyTeacher,
  verifySuperAdmin,
  verifyStudent,
  requireVerifiedTeacher,
} = require("./verify");
const { upload, cloudinary } = require("./upload");
const { errorHandler, notFound } = require("./errorHandler");

module.exports = {
  // Authentication & Authorization
  verify,
  verifyAdmin,
  verifySuperAdmin,
  verifyTeacher,
  verifyStudent,
  requireVerifiedTeacher,

  // File upload
  upload,
  cloudinary,

  // Error handling
  errorHandler,
  notFound,
};

