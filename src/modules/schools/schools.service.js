const schoolRepository = require('./schools.repository');
const authRepository = require('../auth/auth.repository');
const bcrypt = require('bcrypt');

const onboard = async ({ schoolName, schoolEmail, schoolPhone, county, adminUsername, adminEmail, adminPassword }) => {
  // 1. Check if school slug already exists
  const slug = schoolName.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
  const existing = await schoolRepository.findBySlug(slug);
  if (existing) throw new Error('A school with this name already exists');

  // 2. Create school
  const school = await schoolRepository.create({
    name: schoolName,
    slug,
    email: schoolEmail,
    phone: schoolPhone,
    county,
  });

  // 3. Hash password and create admin user
  const passwordHash = await bcrypt.hash(adminPassword, 10);
  const admin = await authRepository.create({
    school_id: school.id,
    username: adminUsername,
    email: adminEmail,
    password_hash: passwordHash,
    role: 'ADMIN',
  });

  return {
    school: { id: school.id, name: school.name, slug: school.slug },
    admin: { id: admin.id, username: admin.username, email: admin.email },
  };
};

module.exports = { onboard };