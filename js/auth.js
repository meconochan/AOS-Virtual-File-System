
/* ============================================================
   auth.js — Authentication and Access Control

   Responsibilities:
   - User login and logout
   - Current user session
   - Role checking
   - File permission checking
   - User registration
   - User removal
   ============================================================ */

import Store from "./store.js";

const Auth = (() => {

  /* ---------- CURRENT USER SESSION ---------- */

  let currentUser = null;


  /* ---------- AVAILABLE USER ROLES ---------- */

  const ROLES = {
    ADMIN: "Administrator",
    STANDARD: "Standard User",
    READONLY: "Read-only"
  };


  /* ---------- LOGIN ---------- */

  function login(username, password) {
    if (!username || !password) {
      return {
        ok: false,
        error: "Username and password are required."
      };
    }

    const user = Store.userByUsername(username);

    if (!user) {
      Store.log(
        null,
        "LOGIN_FAILED",
        `Unknown username: ${String(username).trim()}`
      );

      return {
        ok: false,
        error: "User not found."
      };
    }

    if (user.password_hash !== Store.hash(password)) {
      Store.log(
        user.user_id,
        "LOGIN_FAILED",
        "Incorrect password."
      );

      return {
        ok: false,
        error: "Incorrect password."
      };
    }

    currentUser = user;

    Store.log(
      user.user_id,
      "LOGIN",
      `${user.username} logged in.`
    );

    return {
      ok: true,
      user: currentUser
    };
  }


  /* ---------- LOGOUT ---------- */

  function logout() {
    if (currentUser) {
      Store.log(
        currentUser.user_id,
        "LOGOUT",
        `${currentUser.username} logged out.`
      );
    }

    currentUser = null;

    return true;
  }


  /* ---------- CURRENT USER ---------- */

  function user() {
    if (!currentUser) {
      return null;
    }

    // Return the latest user record.
    const latest = Store.userById(currentUser.user_id);

    if (!latest) {
      currentUser = null;
      return null;
    }

    currentUser = latest;

    return currentUser;
  }


  /* ---------- LOGIN STATUS ---------- */

  function isLoggedIn() {
    return user() !== null;
  }


  /* ---------- ADMIN CHECK ---------- */

  function isAdmin() {
    const activeUser = user();

    return activeUser?.role === ROLES.ADMIN;
  }


  /* ---------- FILE PERMISSION CHECK ---------- */

  function can(action, file) {
    const activeUser = user();

    if (!activeUser || !file) {
      return false;
    }

    // Administrator has full file access.
    if (activeUser.role === ROLES.ADMIN) {
      return true;
    }

    // Read-only users cannot write or execute.
    if (activeUser.role === ROLES.READONLY) {
      if (action !== "read") {
        return false;
      }
    }

    const permission = Store.getPermission(
      file.file_id,
      activeUser.user_id
    );

    if (!permission) {
      return false;
    }

    switch (action) {

      case "read":
        return permission.can_read === true;

      case "write":
        return (
          activeUser.role === ROLES.STANDARD &&
          permission.can_write === true
        );

      case "execute":
        return (
          activeUser.role === ROLES.STANDARD &&
          permission.can_execute === true
        );

      default:
        return false;
    }
  }


  /* ---------- DEFAULT FILE PERMISSIONS ---------- */

  function defaultPermissions(fileId, ownerId) {
    const id = Number(fileId);
    const owner = Number(ownerId);

    if (!Number.isInteger(id) || id < 1) {
      throw new Error("Invalid file ID.");
    }

    if (!Store.userById(owner)) {
      throw new Error("File owner does not exist.");
    }

    for (const existingUser of Store.db.users) {

      const isOwner =
        existingUser.user_id === owner;

      const isReadOnly =
        existingUser.role === ROLES.READONLY;

      Store.addPermission(
        id,
        existingUser.user_id,

        // All users can read by default.
        true,

        // Only the owner receives write permission,
        // unless the owner is a Read-only account.
        isOwner && !isReadOnly,

        // Only the owner receives execute permission,
        // unless the owner is a Read-only account.
        isOwner && !isReadOnly
      );
    }
  }


  /* ---------- REGISTER USER ---------- */

  function register(username, password, role = ROLES.STANDARD) {

    if (!isAdmin()) {
      return {
        ok: false,
        error: "Only administrators can register users."
      };
    }

    const cleanUsername = String(username ?? "").trim();

    if (!/^[a-zA-Z0-9_-]{3,20}$/.test(cleanUsername)) {
      return {
        ok: false,
        error: "Username must contain 3–20 letters, numbers, underscores, or hyphens."
      };
    }

    if (typeof password !== "string" || password.length < 6) {
      return {
        ok: false,
        error: "Password must contain at least 6 characters."
      };
    }

    if (!Object.values(ROLES).includes(role)) {
      return {
        ok: false,
        error: "Invalid user role."
      };
    }

    if (Store.userByUsername(cleanUsername)) {
      return {
        ok: false,
        error: "Username already exists."
      };
    }

    const newUser = {
      user_id: Store.nextId("user"),
      username: cleanUsername,
      password_hash: Store.hash(password),
      role,
      created_at: Store.now()
    };

    Store.db.users.push(newUser);

    Store.log(
      user().user_id,
      "USER_CREATED",
      `Created account: ${cleanUsername} (${role})`
    );

    Store.save();

    return {
      ok: true,
      user: newUser
    };
  }


  /* ---------- REMOVE USER ---------- */

  function remove(userId) {

    if (!isAdmin()) {
      return {
        ok: false,
        error: "Only administrators can remove users."
      };
    }

    const id = Number(userId);

    const target = Store.userById(id);

    if (!target) {
      return {
        ok: false,
        error: "User not found."
      };
    }

    // Prevent deleting the currently logged-in account.
    if (target.user_id === user().user_id) {
      return {
        ok: false,
        error: "You cannot remove your own account while logged in."
      };
    }

    // Prevent deletion of the last administrator.
    if (target.role === ROLES.ADMIN) {

      const adminCount = Store.db.users.filter(
        u => u.role === ROLES.ADMIN
      ).length;

      if (adminCount <= 1) {
        return {
          ok: false,
          error: "Cannot remove the last administrator."
        };
      }
    }

    // Record the action before removing the account.
    Store.log(
      user().user_id,
      "USER_REMOVED",
      `Removed account: ${target.username}`
    );

    Store.db.users = Store.db.users.filter(
      u => u.user_id !== id
    );

    // Remove the deleted user's file permissions.
    Store.db.permissions = Store.db.permissions.filter(
      p => p.user_id !== id
    );

    Store.save();

    return {
      ok: true,
      message: "User removed successfully."
    };
  }


  /* ---------- PUBLIC METHODS ---------- */

  return {
    ROLES,

    login,
    logout,
    user,
    isLoggedIn,
    isAdmin,

    can,
    defaultPermissions,

    register,
    remove
  };

})();


/* ---------- ES MODULE EXPORT ---------- */

export default Auth;
