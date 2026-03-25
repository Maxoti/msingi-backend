const db = require('../../shared/database/client');

const findBySlug = async (slug) => {
  return db.queryOne('SELECT id FROM schools WHERE slug = $1', [slug]);
};

const create = async ({ name, slug, email, phone, county }) => {
  return db.queryOne(
    `INSERT INTO schools (name, slug, email, phone, county)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING *`,
    [name, slug, email, phone, county]
  );
};

module.exports = { findBySlug, create };