
const Database = require('better-sqlite3');
const path = require('path');
const crypto = require('crypto');
const fs = require('fs');
const { app } = require('electron');

class SoldierDB {
  constructor() {
    // SECURITY FIX: Use 'userData' (AppData) instead of app root
    const userDataPath = app.getPath('userData');

    // Ensure directory exists
    if (!fs.existsSync(userDataPath)) {
      fs.mkdirSync(userDataPath, { recursive: true });
    }

    const dbPath = path.join(userDataPath, 'soldiers.db');
    console.log("Database Path:", dbPath);

    this.db = new Database(dbPath);
    this.init();
  }

  // Helper: Hash Password (SHA-256)
  hashPassword(password) {
    return crypto.createHash('sha256').update(password).digest('hex');
  }

  init() {
    // 1. Soldiers Table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS soldiers (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        ho_ten TEXT,
        ten_khac TEXT,
        ngay_sinh TEXT,
        cccd TEXT,
        cap_bac TEXT,
        chuc_vu TEXT,
        don_vi TEXT,
        don_vi_id INTEGER,
        nhap_ngu_ngay TEXT,
        vao_dang_ngay TEXT,
        sdt_rieng TEXT,
        tk_facebook TEXT,
        sdt_facebook TEXT,
        tk_zalo TEXT,
        sdt_zalo TEXT,
        tk_tiktok TEXT,
        ho_ten_bo TEXT,
        ho_ten_me TEXT,
        vo_chong TEXT,
        con_cai TEXT,
        hoan_canh_gia_dinh TEXT,
        tien_an_tien_su TEXT,
        tien_su_benh TEXT,
        vay_no INTEGER DEFAULT 0,
        chi_tiet_vay_no TEXT,
        su_dung_ma_tuy INTEGER DEFAULT 0,
        tham_gia_danh_bac INTEGER DEFAULT 0
      )
    `);

    // Migration: Add don_vi_id if not exists
    try {
      this.db.exec(`ALTER TABLE soldiers ADD COLUMN don_vi_id INTEGER`);
    } catch (e) {
      // Column likely exists, ignore
    }

    // 2. Units Table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS units (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        ten_don_vi TEXT NOT NULL,
        cap_tren_id INTEGER DEFAULT NULL
      )
    `);

    // 3. Users Table (New for Auth)
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE,
        password TEXT, 
        role TEXT DEFAULT 'commander'
      )
    `);

    // Seed default Unit if empty
    const unitCount = this.db.prepare('SELECT count(*) as count FROM units').get();
    if (unitCount.count === 0) {
      this.db.prepare("INSERT INTO units (ten_don_vi) VALUES ('Đại đội 1')").run();
    }

    // Seed default Admin if empty
    const userCount = this.db.prepare('SELECT count(*) as count FROM users').get();
    if (userCount.count === 0) {
      // Password: '123456'
      const defaultPass = this.hashPassword('123456');
      this.db.prepare("INSERT INTO users (username, password, role) VALUES ('admin', ?, 'commander')").run(defaultPass);
    }
  }

  // --- AUTH ---
  checkLogin(username, password) {
    const hashedPassword = this.hashPassword(password);
    // Explicitly check both Username AND Password
    const user = this.db.prepare("SELECT * FROM users WHERE username = ? AND password = ?").get(username, hashedPassword);
    return user ? user.username : null;
  }

  changePassword(username, oldPass, newPass) {
    const hashedOld = this.hashPassword(oldPass);
    const hashedNew = this.hashPassword(newPass);

    const user = this.db.prepare("SELECT * FROM users WHERE username = ? AND password = ?").get(username, hashedOld);

    if (!user) {
      throw new Error("Mật khẩu cũ không chính xác.");
    }

    this.db.prepare("UPDATE users SET password = ? WHERE username = ?").run(hashedNew, username);
    return true;
  }

  // --- UNITS ---
  getUnits() {
    return this.db.prepare('SELECT * FROM units ORDER BY id ASC').all();
  }

  addUnit(name, parentId) {
    return this.db.prepare('INSERT INTO units (ten_don_vi, cap_tren_id) VALUES (?, ?)').run(name, parentId);
  }

  deleteUnit(id) {
    const soldierCount = this.db.prepare('SELECT count(*) as count FROM soldiers WHERE don_vi_id = ?').get(id);
    if (soldierCount.count > 0) throw new Error('Đơn vị đang có người, không thể xóa.');
    return this.db.prepare('DELETE FROM units WHERE id = ?').run(id);
  }

  // --- SOLDIERS ---
  addSoldier(data) {
    const stmt = this.db.prepare(`
      INSERT INTO soldiers (
        ho_ten, ten_khac, ngay_sinh, cccd, cap_bac, chuc_vu, don_vi, don_vi_id, nhap_ngu_ngay, vao_dang_ngay,
        sdt_rieng, tk_facebook, sdt_facebook, tk_zalo, sdt_zalo, tk_tiktok,
        ho_ten_bo, ho_ten_me, vo_chong, con_cai, hoan_canh_gia_dinh,
        tien_an_tien_su, tien_su_benh, vay_no, chi_tiet_vay_no, su_dung_ma_tuy, tham_gia_danh_bac
      ) VALUES (
        @ho_ten, @ten_khac, @ngay_sinh, @cccd, @cap_bac, @chuc_vu, @don_vi, @don_vi_id, @nhap_ngu_ngay, @vao_dang_ngay,
        @sdt_rieng, @tk_facebook, @sdt_facebook, @tk_zalo, @sdt_zalo, @tk_tiktok,
        @ho_ten_bo, @ho_ten_me, @vo_chong, @con_cai, @hoan_canh_gia_dinh,
        @tien_an_tien_su, @tien_su_benh, @vay_no, @chi_tiet_vay_no, @su_dung_ma_tuy, @tham_gia_danh_bac
      )
    `);
    return stmt.run(data);
  }

  getSoldiers(filter) {
    let query = 'SELECT * FROM soldiers WHERE 1=1';
    const params = [];

    if (filter.type === 'dang_vien') {
      query += " AND vao_dang_ngay IS NOT NULL AND vao_dang_ngay != ''";
    } else if (filter.type === 'vay_no') {
      query += ' AND vay_no = 1';
    } else if (filter.type === 'gia_dinh_kho_khan') {
      query += " AND hoan_canh_gia_dinh LIKE 'Khó khăn'";
    } else if (filter.type === 'ma_tuy') {
      query += ' AND su_dung_ma_tuy = 1';
    }

    if (filter.unitId && filter.unitId !== 'all') {
      query += ' AND don_vi_id = ?';
      params.push(filter.unitId);
    }

    query += ' ORDER BY id DESC';
    return this.db.prepare(query).all(...params);
  }

  getSoldierById(id) {
    return this.db.prepare('SELECT * FROM soldiers WHERE id = ?').get(id);
  }

  deleteSoldier(id) {
    return this.db.prepare('DELETE FROM soldiers WHERE id = ?').run(id);
  }
}

module.exports = SoldierDB;
