/**
 * Staff Controller
 * req.schoolId passed to every service call for multi-tenancy
 */

const staffService = require('./staff.service');
const { asyncHandler } = require('../../shared/middleware/errorHandler');
const { successResponse } = require('../../shared/utils/response');

class StaffController {

  createStaff = asyncHandler(async (req, res) => {
    const staff = await staffService.createStaff(req.body, req.schoolId, req.user.id);
    successResponse(res, staff, 'Staff member created successfully', 201);
  });


  
  getAllStaff = asyncHandler(async (req, res) => {
     console.log('[STAFF] req.schoolId =', req.schoolId); 
    const { page, limit, department, position, isActive, search } = req.query;

    const filters = {
      page:     page  ? parseInt(page)  : 1,
      limit:    limit ? parseInt(limit) : 20,
      department,
      position,
      isActive: isActive !== undefined ? isActive === 'true' : undefined,
      search
    };

    const result = await staffService.getAllStaff(req.schoolId, filters);
    successResponse(res, result.data, 'Staff members retrieved successfully', 200, {
      pagination: result.pagination
    });
  });

  getStaffById = asyncHandler(async (req, res) => {
    const staff = await staffService.getStaffById(req.schoolId, req.params.id);
    successResponse(res, staff, 'Staff member retrieved successfully');
  });

  getStaffByEmployeeNumber = asyncHandler(async (req, res) => {
    const staff = await staffService.getStaffByEmployeeNumber(req.schoolId, req.params.employeeNumber);
    successResponse(res, staff, 'Staff member retrieved successfully');
  });

  getStaffByDepartment = asyncHandler(async (req, res) => {
    const staff = await staffService.getStaffByDepartment(req.schoolId, req.params.department);
    successResponse(res, staff, 'Staff members retrieved successfully');
  });

  updateStaff = asyncHandler(async (req, res) => {
    const updatedStaff = await staffService.updateStaff(req.schoolId, req.params.id, req.body);
    successResponse(res, updatedStaff, 'Staff member updated successfully');
  });

  deactivateStaff = asyncHandler(async (req, res) => {
    const staff = await staffService.deactivateStaff(req.schoolId, req.params.id);
    successResponse(res, staff, 'Staff member deactivated successfully');
  });

  reactivateStaff = asyncHandler(async (req, res) => {
    const staff = await staffService.reactivateStaff(req.schoolId, req.params.id);
    successResponse(res, staff, 'Staff member reactivated successfully');
  });

  deleteStaff = asyncHandler(async (req, res) => {
    await staffService.deleteStaff(req.schoolId, req.params.id);
    successResponse(res, null, 'Staff member deleted successfully');
  });

  getStaffStats = asyncHandler(async (req, res) => {
    const stats = await staffService.getStaffStats(req.schoolId);
    successResponse(res, stats, 'Staff statistics retrieved successfully');
  });

  updatePassword = asyncHandler(async (req, res) => {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword)
      return res.status(400).json({ success: false, message: 'Current password and new password are required' });
    if (newPassword.length < 6)
      return res.status(400).json({ success: false, message: 'New password must be at least 6 characters long' });

    const result = await staffService.updatePassword(req.schoolId, req.params.id, currentPassword, newPassword);
    successResponse(res, result, 'Password updated successfully');
  });

  resetPassword = asyncHandler(async (req, res) => {
    const { newPassword } = req.body;
    if (!newPassword)
      return res.status(400).json({ success: false, message: 'New password is required' });
    if (newPassword.length < 6)
      return res.status(400).json({ success: false, message: 'Password must be at least 6 characters long' });

    const result = await staffService.resetPassword(req.schoolId, req.params.id, newPassword);
    successResponse(res, result, 'Password reset successfully');
  });

  getMyProfile = asyncHandler(async (req, res) => {
    const staff = await staffService.getMyProfile(req.schoolId, req.user.id);
    successResponse(res, staff, 'Profile retrieved successfully');
  });

  updateMyProfile = asyncHandler(async (req, res) => {
    const updatedProfile = await staffService.updateMyProfile(req.schoolId, req.user.id, req.body);
    successResponse(res, updatedProfile, 'Profile updated successfully');
  });
}

module.exports = new StaffController();