
/* ============================================================
   disk.js — Virtual Disk Management

   Responsibilities:
   - Build and manage virtual disk blocks
   - Track occupied and free blocks
   - Generate bitmap information
   - Calculate disk capacity
   - Find consecutive free blocks
   - Release allocated blocks
   - Resize virtual disk safely
   ============================================================ */

import Store from "./store.js";

const Disk = (() => {

  const DEFAULT_BLOCKS = 100;
  const DEFAULT_BLOCK_SIZE = 1; // KB


  /* ---------- GET DISK CONFIGURATION ---------- */

  function config() {
    const disk = Store.db.virtual_disks[0];

    if (!disk) {
      throw new Error("Virtual disk configuration not found.");
    }

    return disk;
  }


  /* ---------- BUILD DISK BLOCKS ---------- */

  function build(totalBlocks, blockSize) {
    if (
      !Number.isInteger(totalBlocks) ||
      totalBlocks < 1
    ) {
      throw new Error("Invalid number of disk blocks.");
    }

    if (
      !Number.isFinite(blockSize) ||
      blockSize <= 0
    ) {
      throw new Error("Invalid disk block size.");
    }

    const blocks = [];

    for (let i = 0; i < totalBlocks; i++) {
      blocks.push({
        block_id: i,
        is_occupied: false,
        file_id: null,
        block_content: null
      });
    }

    Store.db.disk_blocks = blocks;

    return blocks;
  }


  /* ---------- ENSURE DISK EXISTS ---------- */

  function ensure() {
    const disk = config();

    const expectedBlocks =
      disk.total_capacity / disk.block_size;

    if (
      !Number.isInteger(expectedBlocks) ||
      expectedBlocks < 1
    ) {
      throw new Error("Invalid virtual disk configuration.");
    }

    const blocks = Store.db.disk_blocks;

    const valid =
      blocks.length === expectedBlocks &&
      blocks.every((b, i) =>
        b.block_id === i &&
        typeof b.is_occupied === "boolean"
      );

    if (valid) {
      return blocks;
    }

    const hasOccupiedBlocks = blocks.some(
      b => b.is_occupied
    );

    if (hasOccupiedBlocks) {
      throw new Error(
        "Cannot rebuild disk because allocated blocks exist."
      );
    }

    build(expectedBlocks, disk.block_size);

    Store.save();

    return Store.db.disk_blocks;
  }


  /* ---------- GET BITMAP ---------- */

  // 0 = Free block
  // 1 = Occupied block

  function bitmap() {
    ensure();

    return Store.db.disk_blocks.map(
      block => block.is_occupied ? 1 : 0
    );
  }


  /* ---------- UPDATE BITMAP ---------- */

  function setBitmap(blockId, occupied, fileId = null) {
    ensure();

    const id = Number(blockId);

    const block = Store.db.disk_blocks.find(
      b => b.block_id === id
    );

    if (!block) {
      throw new Error(`Block ${id} does not exist.`);
    }

    if (typeof occupied !== "boolean") {
      throw new Error("Occupied value must be boolean.");
    }

    if (occupied) {
      if (block.is_occupied) {
        throw new Error(`Block ${id} is already occupied.`);
      }

      if (!Number.isInteger(Number(fileId))) {
        throw new Error("A valid file ID is required.");
      }

      block.is_occupied = true;
      block.file_id = Number(fileId);

    } else {
      block.is_occupied = false;
      block.file_id = null;
      block.block_content = null;
    }

    return block;
  }


  /* ---------- CAPACITY INFORMATION ---------- */

  function totalBlocks() {
    ensure();

    return Store.db.disk_blocks.length;
  }


  function usedBlocks() {
    ensure();

    return Store.db.disk_blocks.filter(
      b => b.is_occupied
    ).length;
  }


  function freeBlocks() {
    return totalBlocks() - usedBlocks();
  }


  function capacityKB() {
    return config().total_capacity;
  }


  function usedKB() {
    return usedBlocks() * config().block_size;
  }


  function freeKB() {
    return capacityKB() - usedKB();
  }


  function usagePercent() {
    const capacity = capacityKB();

    if (capacity <= 0) return 0;

    return Math.round(
      (usedKB() / capacity) * 100
    );
  }


  /* ---------- FIND CONSECUTIVE FREE BLOCKS ---------- */

  function firstFreeRun(count) {
    ensure();

    if (!Number.isInteger(count) || count < 1) {
      return -1;
    }

    let run = 0;
    let start = -1;

    for (const block of Store.db.disk_blocks) {

      if (!block.is_occupied) {

        if (run === 0) {
          start = block.block_id;
        }

        run++;

        if (run === count) {
          return start;
        }

      } else {
        run = 0;
        start = -1;
      }
    }

    return -1;
  }


  /* ---------- GET FREE BLOCK LIST ---------- */

  function freeBlockList() {
    ensure();

    return Store.db.disk_blocks
      .filter(b => !b.is_occupied)
      .map(b => b.block_id);
  }


  /* ---------- GET OCCUPIED BLOCK LIST ---------- */

  function occupiedBlockList() {
    ensure();

    return Store.db.disk_blocks
      .filter(b => b.is_occupied)
      .map(b => b.block_id);
  }


  /* ---------- GET BLOCK RANGE ---------- */

  function range(start, count) {
    ensure();

    if (
      !Number.isInteger(start) ||
      !Number.isInteger(count) ||
      start < 0 ||
      count < 1
    ) {
      return [];
    }

    return Store.db.disk_blocks
      .slice(start, start + count)
      .map(b => b.block_id);
  }


  /* ---------- RELEASE BLOCKS ---------- */

  function releaseBlocks(blockIds) {
    ensure();

    if (!Array.isArray(blockIds)) {
      throw new Error("Block IDs must be an array.");
    }

    const released = [];

    for (const id of blockIds) {
      const block = Store.db.disk_blocks.find(
        b => b.block_id === Number(id)
      );

      if (block && block.is_occupied) {
        block.is_occupied = false;
        block.file_id = null;
        block.block_content = null;

        released.push(block.block_id);
      }
    }

    Store.save();

    return released;
  }


  /* ---------- RESIZE VIRTUAL DISK ---------- */

  function setDiskSize(totalCapacity, blockSize) {
    if (
      !Number.isInteger(totalCapacity) ||
      totalCapacity < 1
    ) {
      throw new Error("Invalid disk capacity.");
    }

    if (
      !Number.isInteger(blockSize) ||
      blockSize < 1
    ) {
      throw new Error("Invalid block size.");
    }

    if (totalCapacity % blockSize !== 0) {
      throw new Error(
        "Disk capacity must be divisible by block size."
      );
    }

    ensure();

    const occupied = occupiedBlockList();

    if (occupied.length > 0) {
      throw new Error(
        "Cannot resize disk while blocks are occupied."
      );
    }

    const disk = config();

    disk.total_capacity = totalCapacity;
    disk.block_size = blockSize;

    const totalBlocks = totalCapacity / blockSize;

    build(totalBlocks, blockSize);

    Store.save();

    return disk;
  }


  /* ---------- PUBLIC METHODS ---------- */

  return {
    build,
    ensure,
    config,

    bitmap,
    setBitmap,

    totalBlocks,
    usedBlocks,
    freeBlocks,

    capacityKB,
    usedKB,
    freeKB,
    usagePercent,

    firstFreeRun,
    freeBlockList,
    occupiedBlockList,
    range,
    releaseBlocks,

    setDiskSize
  };

})();


/* ---------- ES MODULE EXPORT ---------- */

export default Disk;
