
/* ============================================================
   store.js — Database and Local Storage Manager

   Responsibilities:
   - Initialize the database
   - Load and save database records
   - Manage user and permission records
   - Generate unique IDs
   - Record system activity
   ============================================================ */

const STORAGE_KEY = "AOS_FILE_MANAGEMENT_DB";

let database = null;

const Store = (() => {

  /* ---------- DATABASE STRUCTURE ---------- */

  function createDatabase() {
    return {
      meta: {
        version: 1
      },

      virtual_disks: [
        {
          disk_id: 1,
          disk_name: "Virtual Disk 0",
          total_capacity: 100,
          block_size: 1
        }
      ],

      disk_blocks: [],

      users: [],

      directories: [
        {
          directory_id: 1,
          directory_name: "/",
          parent_id: null,
          created_at: now()
        }
      ],

      files: [],

      file_allocations: [],

      index_blocks: [],

      permissions: [],

      activity_logs: [],

      counters: {
        user: 0,
        directory: 1,
        file: 0,
        allocation: 0,
        index: 0,
        permission: 0,
        log: 0
      }
    };
  }


  /* ---------- DATABASE VALIDATION ---------- */

  function isValidDB(data) {
    if (!data || typeof data !== "object") {
      return false;
    }

    const requiredArrays = [
      "virtual_disks",
      "disk_blocks",
      "users",
      "directories",
      "files",
      "file_allocations",
      "index_blocks",
      "permissions",
      "activity_logs"
    ];

    for (const key of requiredArrays) {
      if (!Array.isArray(data[key])) {
        return false;
      }
    }

    if (
      !data.counters ||
      typeof data.counters !== "object"
    ) {
      return false;
    }

    return true;
  }


  /* ---------- PASSWORD HASHING ---------- */

  // Educational hash only.
  // This is NOT secure password hashing for real applications.

  function hash(value) {
    let h = 5381;

    const str = String(value);

    for (let i = 0; i < str.length; i++) {
      h = ((h << 5) + h) ^ str.charCodeAt(i);
    }

    return (h >>> 0).toString(16);
  }


  /* ---------- DATE AND TIME ---------- */

  function now() {
    return new Date().toISOString();
  }


  /* ---------- DEFAULT USERS ---------- */

  function seed() {
    database = createDatabase();

    database.users = [
      {
        user_id: 1,
        username: "admin",
        password_hash: hash("admin123"),
        role: "Administrator",
        created_at: now()
      },

      {
        user_id: 2,
        username: "maria",
        password_hash: hash("maria123"),
        role: "Standard User",
        created_at: now()
      },

      {
        user_id: 3,
        username: "guest",
        password_hash: hash("guest123"),
        role: "Read-only",
        created_at: now()
      }
    ];

    database.counters.user = 3;

    save();

    return database;
  }


  /* ---------- LOAD DATABASE ---------- */

  function load() {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);

      if (!saved) {
        return null;
      }

      const parsed = JSON.parse(saved);

      if (!isValidDB(parsed)) {
        console.warn(
          "Invalid database structure. A new database will be created."
        );

        return null;
      }

      return parsed;

    } catch (error) {
      console.error("Database loading failed:", error);
      return null;
    }
  }


  /* ---------- SAVE DATABASE ---------- */

  function save() {
    if (!database) {
      console.error("Database has not been initialized.");
      return false;
    }

    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify(database)
      );

      return true;

    } catch (error) {
      console.error("Database saving failed:", error);

      return false;
    }
  }


  /* ---------- INITIALIZE DATABASE ---------- */

  function init() {
    const existing = load();

    if (existing) {
      database = existing;
    } else {
      seed();
    }

    return database;
  }


  /* ---------- RESET DATABASE ---------- */

  function reset() {
    return seed();
  }


  /* ---------- UNIQUE ID GENERATOR ---------- */

  function nextId(type) {
    if (!database) {
      throw new Error("Database is not initialized.");
    }

    if (
      !Object.prototype.hasOwnProperty.call(
        database.counters,
        type
      )
    ) {
      throw new Error(`Unknown ID counter: ${type}`);
    }

    database.counters[type]++;

    return database.counters[type];
  }


  /* ---------- ACTIVITY LOGGING ---------- */

  function log(userId, action, details = "") {
    if (!database) {
      throw new Error("Database is not initialized.");
    }

    const logId = nextId("log");

    const record = {
      log_id: logId,
      user_id: userId ?? null,
      action: String(action ?? ""),
      details: String(details ?? ""),
      timestamp: now()
    };

    // Newest activity appears first.
    database.activity_logs.unshift(record);

    save();

    return record;
  }


  /* ---------- USER LOOKUP ---------- */

  function userById(userId) {
    return database?.users.find(
      user => user.user_id === Number(userId)
    ) || null;
  }


  function userByUsername(username) {
    const target = String(username ?? "")
      .trim()
      .toLowerCase();

    return database?.users.find(
      user => user.username.toLowerCase() === target
    ) || null;
  }


  /* ---------- PERMISSION MANAGEMENT ---------- */

  function addPermission(
    fileId,
    userId,
    read = false,
    write = false,
    execute = false
  ) {
    if (!database) {
      throw new Error("Database is not initialized.");
    }

    const existing = database.permissions.find(
      p =>
        p.file_id === Number(fileId) &&
        p.user_id === Number(userId)
    );

    if (existing) {
      existing.can_read = Boolean(read);
      existing.can_write = Boolean(write);
      existing.can_execute = Boolean(execute);

      save();

      return existing;
    }

    const permission = {
      permission_id: nextId("permission"),
      file_id: Number(fileId),
      user_id: Number(userId),
      can_read: Boolean(read),
      can_write: Boolean(write),
      can_execute: Boolean(execute)
    };

    database.permissions.push(permission);

    save();

    return permission;
  }


  function getPermission(fileId, userId) {
    return database?.permissions.find(
      p =>
        p.file_id === Number(fileId) &&
        p.user_id === Number(userId)
    ) || null;
  }


  /* ---------- PUBLIC METHODS ---------- */

  return {

    init,
    load,
    save,
    reset,
    seed,

    hash,
    now,
    nextId,
    log,

    userById,
    userByUsername,

    addPermission,
    getPermission,

    get db() {
      if (!database) {
        throw new Error(
          "Store is not initialized. Call Store.init() first."
        );
      }

      return database;
    }

  };

})();


/* ---------- ES MODULE EXPORT ---------- */

export default Store;
