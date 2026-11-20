
/* ============================================================
   engine.js — File System Engine

   Responsibilities:
   - Create, read, edit, rename, copy, move and delete files
   - Create, rename and delete directories
   - Validate user permissions
   - Check virtual disk capacity
   - Connect allocation algorithms with file operations
   - Maintain file metadata and activity logs

   All normal filesystem operations pass through this module.
   ============================================================ */

import Store from "./store.js";
import Disk from "./disk.js";
import Auth from "./auth.js";
import Allocation from "./allocation.js";

const Engine = (() => {

  /* ==========================================================
     HELPERS
     ========================================================== */

  function path(directoryId) {
    let current = Store.db.directories.find(
      d => d.directory_id === Number(directoryId)
    );

    if (!current) return "Unknown directory";

    const parts = [];

    while (current) {
      if (current.parent_id === null) break;

      parts.unshift(current.directory_name);

      current = Store.db.directories.find(
        d => d.directory_id === current.parent_id
      );
    }

    return "/" + parts.join("/");
  }


  function filesIn(directoryId) {
    return Store.db.files.filter(
      f => f.directory_id === Number(directoryId)
    );
  }


  function dirsIn(parentId) {
    return Store.db.directories.filter(
      d => d.parent_id === Number(parentId)
    );
  }


  function fileByName(directoryId, name) {
    return Store.db.files.find(
      f =>
        f.directory_id === Number(directoryId) &&
        f.filename.toLowerCase() === String(name).toLowerCase()
    ) || null;
  }


  function dirByName(parentId, name) {
    return Store.db.directories.find(
      d =>
        d.parent_id === Number(parentId) &&
        d.directory_name.toLowerCase() === String(name).toLowerCase()
    ) || null;
  }


  function fileById(fileId) {
    return Store.db.files.find(
      f => f.file_id === Number(fileId)
    ) || null;
  }


  function directoryById(directoryId) {
    return Store.db.directories.find(
      d => d.directory_id === Number(directoryId)
    ) || null;
  }


  function extensionOf(name) {
    const i = name.lastIndexOf(".");

    return i > 0
      ? name.slice(i + 1).toLowerCase()
      : "";
  }


  function validName(name) {
    return (
      typeof name === "string" &&
      name.trim().length > 0 &&
      name.trim() !== "." &&
      name.trim() !== ".." &&
      !/[\/\\]/.test(name)
    );
  }


  function requiredBlocks(sizeKB) {
    const blockSize = Disk.config().block_size;

    return Math.max(
      1,
      Math.ceil(Number(sizeKB) / blockSize)
    );
  }


  function requireLogin() {
    if (!Auth.user()) {
      return {
        ok: false,
        error: "You must be signed in to perform this operation."
      };
    }

    return { ok: true };
  }


  function canManageDirectories() {
    const user = Auth.user();

    return Boolean(
      user &&
      (
        user.role === Auth.ROLES.ADMIN ||
        user.role === Auth.ROLES.STANDARD
      )
    );
  }


  function gate(action, file) {
    if (!Auth.can(action, file)) {
      const user = Auth.user();

      Store.log(
        user?.user_id,
       `DENIED ${action.toUpperCase()} on "${file.filename}"`,
        `${action.toUpperCase()} denied for "${file.filename}" (File ID: ${file.file_id})`
      );

      return {
        ok: false,
        error: `Access denied: you do not have ${action.toUpperCase()} permission for "${file.filename}".`
      };
    }

    return { ok: true };
  }


  /* ==========================================================
     FILE OPERATIONS
     ========================================================== */


  /* ---------- CREATE FILE ---------- */

  function createFile(directoryId, name, sizeKB, content, allocType) {
    const login = requireLogin();

    if (!login.ok) return login;

    if (!canManageDirectories()) {
  const user = Auth.user();

  Store.log(
    user.user_id,
    "DENIED CREATE",
    `DENIED CREATE: User "${user.username}" attempted to create "${name}".`
  );

  return {
    ok: false,
    error: "Your account cannot create files."
  };
}

    const dir = directoryById(directoryId);

    if (!dir) {
      return {
        ok: false,
        error: "Destination directory does not exist."
      };
    }

    if (!validName(name)) {
      return {
        ok: false,
        error: "Please enter a valid filename."
      };
    }

    const cleanName = name.trim();

    if (fileByName(directoryId, cleanName)) {
      return {
        ok: false,
        error: `"${cleanName}" already exists in this directory.`
      };
    }

    const size = Number(sizeKB);

    if (!Number.isFinite(size) || size <= 0) {
      return {
        ok: false,
        error: "File size must be greater than 0 KB."
      };
    }

    if (!Object.values(Allocation.TYPE).includes(allocType)) {
      return {
        ok: false,
        error: "Invalid file allocation method."
      };
    }

    const blockSize = Disk.config().block_size;
    const count = requiredBlocks(size);

    const extraIndexBlock =
      allocType === Allocation.TYPE.INDEXED ? 1 : 0;

    const required = count + extraIndexBlock;

    if (required > Disk.freeBlocks()) {
      return {
        ok: false,
        error:
          `Insufficient storage. "${cleanName}" requires ${required} block(s), but only ${Disk.freeBlocks()} block(s) are free.`
      };
    }

    const user = Auth.user();
    const fileId = Store.nextId("file");

    let allocation;

    try {

     allocation = Allocation.allocate(
  allocType,
  fileId,
  count
);

      const file = {
        file_id: fileId,
        filename: cleanName,
        extension: extensionOf(cleanName),
        content: String(content ?? ""),
        size: size,
        directory_id: Number(directoryId),
        owner_id: user.user_id,
        created_at: Store.now(),
        modified_at: Store.now(),
        allocation_type: allocType,
       blocks: Allocation.dataBlocksOf(fileId),
index_block: allocation.index_block_id ?? null
      };

      Store.db.files.push(file);

      Auth.defaultPermissions(
        fileId,
        user.user_id
      );

      Store.log(
        user.user_id,
        "FILE_CREATED",
        `Created "${cleanName}" using ${allocType} allocation. ${count} data block(s).`
      );

      Store.save();

      return {
        ok: true,
        file,
        allocation
      };

    } catch (error) {

      // Remove partially created allocation if necessary.
      Allocation.deallocate(fileId);

      Store.db.files = Store.db.files.filter(
        f => f.file_id !== fileId
      );

      Store.db.permissions = Store.db.permissions.filter(
        p => p.file_id !== fileId
      );

      Store.save();

      return {
        ok: false,
        error: error.message || "Unable to create file."
      };
    }
  }


  /* ---------- READ FILE ---------- */

  function readFile(fileId) {
    const f = fileById(fileId);

    if (!f) {
      return { ok: false, error: "File not found." };
    }

    const g = gate("read", f);

    if (!g.ok) return g;

    Store.log(
      Auth.user().user_id,
      "FILE_OPENED",
      `Opened "${f.filename}" (File ID: ${f.file_id})`
    );

    return {
      ok: true,
      file: f
    };
  }


  /* ---------- EDIT FILE ---------- */

  function editFile(fileId, newContent) {
    const f = fileById(fileId);

    if (!f) {
      return { ok: false, error: "File not found." };
    }

    const g = gate("write", f);

    if (!g.ok) return g;

    const content = String(newContent ?? "");

    // One KB represents approximately 1024 characters.
    const newSize = Math.max(
      1,
      Math.ceil(content.length / 1024)
    );

    const oldSize = f.size;
    const oldContent = f.content;
    const oldModified = f.modified_at;

    const oldCount = requiredBlocks(oldSize);
    const newCount = requiredBlocks(newSize);

    const oldIndex = f.index_block;

    const indexExtra =
      f.allocation_type === Allocation.TYPE.INDEXED ? 1 : 0;

    const oldTotal = oldCount + indexExtra;
    const newTotal = newCount + indexExtra;

    // Check capacity before releasing existing blocks.
    const additionalNeeded = newTotal - oldTotal;

    if (additionalNeeded > Disk.freeBlocks()) {
      return {
        ok: false,
        error:
          `Insufficient storage to resize "${f.filename}". Additional space needed: ${additionalNeeded} block(s).`
      };
    }

    if (newCount === oldCount) {
      f.content = content;
      f.size = newSize;
      f.modified_at = Store.now();

      Store.log(
        Auth.user().user_id,
        "FILE_EDITED",
        `Edited "${f.filename}" without changing its block count.`
      );

      Store.save();

      return { ok: true, file: f };
    }

    // Save the old allocation type and data before replacing it.
    const oldType = f.allocation_type;

    try {

      Allocation.deallocate(f.file_id);

      const newAllocation = Allocation.allocate(
  oldType,
  f.file_id,
  newCount
);

      f.content = content;
      f.size = newSize;
      f.blocks = Allocation.dataBlocksOf(f.file_id);
f.index_block = newAllocation.index_block_id ?? null;
      f.modified_at = Store.now();

      Store.log(
        Auth.user().user_id,
        "FILE_RESIZED",
        `Resized "${f.filename}" from ${oldSize} KB to ${newSize} KB.`
      );

      Store.save();

      return {
        ok: true,
        file: f
      };

    } catch (error) {

      // Best-effort restoration of the old allocation.
      try {
        Allocation.deallocate(f.file_id);

       const restored = Allocation.allocate(
  oldType,
  f.file_id,
  oldCount
);

       f.blocks = Allocation.dataBlocksOf(f.file_id);
f.index_block = restored.index_block_id ?? null;

      } catch (restoreError) {
        console.error(
          "File allocation restoration failed:",
          restoreError
        );

        f.blocks = [];
        f.index_block = null;
      }

      f.content = oldContent;
      f.size = oldSize;
      f.modified_at = oldModified;

      Store.save();

      return {
        ok: false,
        error: `Unable to resize file: ${error.message}`
      };
    }
  }


  /* ---------- RENAME FILE ---------- */

  function renameFile(fileId, newName) {
    const f = fileById(fileId);

    if (!f) {
      return { ok: false, error: "File not found." };
    }

    const g = gate("write", f);

    if (!g.ok) return g;

    if (!validName(newName)) {
      return { ok: false, error: "Invalid filename." };
    }

    const cleanName = newName.trim();
    const existing = fileByName(f.directory_id, cleanName);

    if (existing && existing.file_id !== f.file_id) {
      return {
        ok: false,
        error: `"${cleanName}" already exists.`
      };
    }

    const oldName = f.filename;

    f.filename = cleanName;
    f.extension = extensionOf(cleanName);
    f.modified_at = Store.now();

    Store.log(
      Auth.user().user_id,
      "FILE_RENAMED",
      `Renamed "${oldName}" to "${cleanName}".`
    );

    Store.save();

    return {
      ok: true,
      file: f
    };
  }


  /* ---------- COPY FILE ---------- */

  function copyFile(fileId, targetDirId) {
    const f = fileById(fileId);

    if (!f) {
      return { ok: false, error: "File not found." };
    }

    const g = gate("read", f);

    if (!g.ok) return g;

    const login = requireLogin();

    if (!login.ok) return login;

    if (!directoryById(targetDirId)) {
      return {
        ok: false,
        error: "Destination directory does not exist."
      };
    }

    if (!canManageDirectories()) {
      return {
        ok: false,
        error: "Your account cannot create files in this directory."
      };
    }

    let copyName = f.filename;
    let number = 1;

    while (fileByName(targetDirId, copyName)) {
      const dot = f.filename.lastIndexOf(".");

      copyName = dot > 0
        ? `${f.filename.slice(0, dot)} (copy ${number})${f.filename.slice(dot)}`
        : `${f.filename} (copy ${number})`;

      number++;
    }

    const result = createFile(
      targetDirId,
      copyName,
      f.size,
      f.content,
      f.allocation_type
    );

    if (result.ok) {
      Store.log(
        Auth.user().user_id,
        "FILE_COPIED",
        `Copied "${f.filename}" as "${copyName}".`
      );

      Store.save();
    }

    return result;
  }


  /* ---------- MOVE FILE ---------- */

  function moveFile(fileId, targetDirId) {
    const f = fileById(fileId);

    if (!f) {
      return { ok: false, error: "File not found." };
    }

    const g = gate("write", f);

    if (!g.ok) return g;

    const login = requireLogin();

    if (!login.ok) return login;

    if (!canManageDirectories()) {
      return {
        ok: false,
        error: "Your account cannot move files."
      };
    }

    if (!directoryById(targetDirId)) {
      return {
        ok: false,
        error: "Destination directory does not exist."
      };
    }

    if (f.directory_id === Number(targetDirId)) {
      return {
        ok: false,
        error: "File is already in this directory."
      };
    }

    if (fileByName(targetDirId, f.filename)) {
      return {
        ok: false,
        error: `"${f.filename}" already exists in the destination.`
      };
    }

    const oldPath = path(f.directory_id);

    f.directory_id = Number(targetDirId);
    f.modified_at = Store.now();

    Store.log(
      Auth.user().user_id,
      "FILE_MOVED",
      `Moved "${f.filename}" from ${oldPath} to ${path(targetDirId)}.`
    );

    Store.save();

    return {
      ok: true,
      file: f
    };
  }


  /* ---------- DELETE FILE ---------- */

  function deleteFile(fileId) {
    const f = fileById(fileId);

    if (!f) {
      return { ok: false, error: "File not found." };
    }

    const g = gate("write", f);

    if (!g.ok) return g;

    const freed = Allocation.deallocate(f.file_id);

    Store.db.files = Store.db.files.filter(
      x => x.file_id !== f.file_id
    );

    Store.db.permissions = Store.db.permissions.filter(
      p => p.file_id !== f.file_id
    );

    Store.log(
      Auth.user().user_id,
      "FILE_DELETED",
      `Deleted "${f.filename}". Released ${freed.length} block(s).`
    );

    Store.save();

    return {
      ok: true,
      freed
    };
  }


  /* ==========================================================
     DIRECTORY OPERATIONS
     ========================================================== */


  /* ---------- CREATE DIRECTORY ---------- */

  function createDirectory(parentId, name) {
    const login = requireLogin();

    if (!login.ok) return login;

    if (!canManageDirectories()) {
      return {
        ok: false,
        error: "Your account cannot create directories."
      };
    }

    if (!directoryById(parentId)) {
      return {
        ok: false,
        error: "Parent directory does not exist."
      };
    }

    if (!validName(name)) {
      return {
        ok: false,
        error: "Please enter a valid directory name."
      };
    }

    const cleanName = name.trim();

    if (dirByName(parentId, cleanName)) {
      return {
        ok: false,
        error: `"${cleanName}" already exists.`
      };
    }

    const directory = {
      directory_id: Store.nextId("directory"),
      directory_name: cleanName,
      parent_id: Number(parentId),
      created_at: Store.now()
    };

    Store.db.directories.push(directory);

    Store.log(
      Auth.user().user_id,
      "DIRECTORY_CREATED",
      `Created directory "${cleanName}" inside ${path(parentId)}.`
    );

    Store.save();

    return {
      ok: true,
      directory
    };
  }


  /* ---------- RENAME DIRECTORY ---------- */

  function renameDirectory(dirId, name) {
    const login = requireLogin();

    if (!login.ok) return login;

    if (!canManageDirectories()) {
      return {
        ok: false,
        error: "Your account cannot rename directories."
      };
    }

    const d = directoryById(dirId);

    if (!d) {
      return {
        ok: false,
        error: "Directory not found."
      };
    }

    if (d.parent_id === null) {
      return {
        ok: false,
        error: "The root directory cannot be renamed."
      };
    }

    if (!validName(name)) {
      return {
        ok: false,
        error: "Invalid directory name."
      };
    }

    const cleanName = name.trim();
    const existing = dirByName(d.parent_id, cleanName);

    if (existing && existing.directory_id !== d.directory_id) {
      return {
        ok: false,
        error: `"${cleanName}" already exists.`
      };
    }

    const oldName = d.directory_name;

    d.directory_name = cleanName;

    Store.log(
      Auth.user().user_id,
      "DIRECTORY_RENAMED",
      `Renamed directory "${oldName}" to "${cleanName}".`
    );

    Store.save();

    return {
      ok: true,
      directory: d
    };
  }


  /* ---------- DELETE DIRECTORY ---------- */

  function deleteDirectory(dirId) {
    const login = requireLogin();

    if (!login.ok) return login;

    if (!canManageDirectories()) {
      return {
        ok: false,
        error: "Your account cannot delete directories."
      };
    }

    const d = directoryById(dirId);

    if (!d) {
      return {
        ok: false,
        error: "Directory not found."
      };
    }

    if (d.parent_id === null) {
      return {
        ok: false,
        error: "The root directory cannot be deleted."
      };
    }

    if (dirsIn(dirId).length > 0) {
      return {
        ok: false,
        error: "Directory is not empty (contains subdirectories)."
      };
    }

    if (filesIn(dirId).length > 0) {
      return {
        ok: false,
        error: "Directory is not empty (contains files)."
      };
    }

    Store.db.directories = Store.db.directories.filter(
      x => x.directory_id !== d.directory_id
    );

    Store.log(
      Auth.user().user_id,
      "DIRECTORY_DELETED",
      `Deleted directory "${d.directory_name}".`
    );

    Store.save();

    return { ok: true };
  }


  /* ---------- DIRECTORY TREE ---------- */

  function directoryTree() {
    const root = Store.db.directories.find(
      d => d.parent_id === null
    );

    if (!root) return null;

    function build(node) {
      const children = dirsIn(node.directory_id).map(build);

      return {
        id: node.directory_id,
        name: node.directory_name,
        path: path(node.directory_id),
        files: filesIn(node.directory_id).length,
        children
      };
    }

    return build(root);
  }


  /* ==========================================================
     FILE EXECUTION
     ========================================================== */

  function executeFile(fileId) {
    const f = fileById(fileId);

    if (!f) {
      return {
        ok: false,
        error: "File not found."
      };
    }

    const g = gate("execute", f);

    if (!g.ok) return g;

    Store.log(
      Auth.user().user_id,
      "FILE_EXECUTED",
      `Executed "${f.filename}" (simulated).`
    );

    Store.save();

    return {
      ok: true,
      message: `"${f.filename}" executed successfully (simulated).`
    };
  }


  /* ==========================================================
     PUBLIC METHODS
     ========================================================== */

  return {
    path,
    filesIn,
    dirsIn,
    fileByName,
    dirByName,
    extensionOf,
    requiredBlocks,

    createFile,
    readFile,
    editFile,
    renameFile,
    copyFile,
    moveFile,
    deleteFile,

    createDirectory,
    renameDirectory,
    deleteDirectory,
    directoryTree,

    executeFile
  };

})();


/* ---------- ES MODULE EXPORT ---------- */

export default Engine;
