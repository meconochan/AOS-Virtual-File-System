
/* ============================================================
   allocation.js — File Allocation Management

   Supported methods:
   1. Contiguous Allocation
   2. Linked Allocation
   3. Indexed Allocation

   Responsibilities:
   - Reserve virtual disk blocks
   - Record file allocation information
   - Maintain linked block pointers
   - Manage index blocks
   - Release blocks when files are deleted
   ============================================================ */

import Store from "./store.js";
import Disk from "./disk.js";

const Allocation = (() => {

  /* ---------- ALLOCATION TYPES ---------- */

  const TYPE = {
    CONTIGUOUS: "Contiguous",
    LINKED: "Linked",
    INDEXED: "Indexed"
  };


  /* ---------- VALIDATION ---------- */

  function validate(fileId, count) {
    if (!Number.isInteger(Number(fileId)) ||
        Number(fileId) < 1) {
      throw new Error("Invalid file ID.");
    }

    if (!Number.isInteger(count) || count < 1) {
      throw new Error("Block count must be a positive integer.");
    }

    Disk.ensure();

    const existing = Store.db.file_allocations.some(
      a => a.file_id === Number(fileId)
    );

    if (existing) {
      throw new Error("This file already has allocated blocks.");
    }
  }


  /* ---------- CREATE ALLOCATION RECORD ---------- */

  function createRecord(fileId, blockId, type, sequence, nextBlockId = null) {
    return {
      allocation_id: Store.nextId("allocation"),
      file_id: Number(fileId),
      block_id: blockId,
      allocation_type: type,
      sequence_number: sequence,
      next_block_id: nextBlockId
    };
  }


  /* ---------- RESERVE BLOCKS ---------- */

  function reserve(fileId, blockIds, type, indexed = false) {
    const reserved = [];

    try {
      // Mark each selected block as occupied.
      for (const blockId of blockIds) {
        Disk.setBitmap(blockId, true, fileId);
        reserved.push(blockId);
      }

      const dataBlocks = indexed
        ? blockIds.slice(1)
        : blockIds;

      const indexBlockId = indexed
        ? blockIds[0]
        : null;

      // Mark the physical index block.
if (indexed) {
  const indexBlock = Store.db.disk_blocks.find(
    block => block.block_id === indexBlockId
  );

  if (indexBlock) {
    indexBlock.block_content = 'INDEX';
  }
}

      // Create allocation records for data blocks.
      for (let i = 0; i < dataBlocks.length; i++) {
        const nextBlockId =
          type === TYPE.LINKED
            ? (dataBlocks[i + 1] ?? null)
            : null;

        const record = createRecord(
          fileId,
          dataBlocks[i],
          type,
          i,
          nextBlockId
        );

        Store.db.file_allocations.push(record);
      }

      // Create separate index block record.
      if (indexed) {
        const indexRecord = createRecord(
          fileId,
          indexBlockId,
          type,
          -1
        );

        Store.db.file_allocations.push(indexRecord);

        Store.db.index_blocks.push({
          index_id: Store.nextId("index"),
          file_id: Number(fileId),
          block_id: indexBlockId,
          data_blocks: [...dataBlocks]
        });
      }

      Store.save();

      return {
        ok: true,
        file_id: Number(fileId),
        allocation_type: type,
        block_ids: [...blockIds],
        data_block_ids: [...dataBlocks],
        index_block_id: indexBlockId
      };

    } catch (error) {

      // Roll back blocks reserved before the error.
      for (const blockId of reserved) {
        const block = Store.db.disk_blocks.find(
          b => b.block_id === blockId
        );

        if (block) {
          block.is_occupied = false;
          block.file_id = null;
          block.block_content = null;
        }
      }

      Store.db.file_allocations =
        Store.db.file_allocations.filter(
          a => a.file_id !== Number(fileId)
        );

      Store.db.index_blocks =
        Store.db.index_blocks.filter(
          a => a.file_id !== Number(fileId)
        );

      Store.save();

      throw error;
    }
  }


  /* ---------- CONTIGUOUS ALLOCATION ---------- */

  function contiguous(fileId, count) {
    validate(fileId, count);

    const start = Disk.firstFreeRun(count);

    if (start === -1) {
      throw new Error(
        "Not enough consecutive free blocks for contiguous allocation."
      );
    }

    const blockIds = Disk.range(start, count);

    return reserve(
      fileId,
      blockIds,
      TYPE.CONTIGUOUS
    );
  }


  /* ---------- LINKED ALLOCATION ---------- */

  function linked(fileId, count) {
    validate(fileId, count);

    const freeBlocks = Disk.freeBlockList();

    if (freeBlocks.length < count) {
      throw new Error(
        "Not enough free blocks for linked allocation."
      );
    }

    // Spread selections across the free block list.
    // This helps demonstrate non-contiguous allocation.
    const selected = [];

    const step = Math.max(
      1,
      Math.floor(freeBlocks.length / count)
    );

    for (let i = 0; i < freeBlocks.length && selected.length < count; i += step) {
      selected.push(freeBlocks[i]);
    }

    // Fill any remaining slots if necessary.
    for (const blockId of freeBlocks) {
      if (selected.length >= count) break;

      if (!selected.includes(blockId)) {
        selected.push(blockId);
      }
    }

    return reserve(
      fileId,
      selected,
      TYPE.LINKED
    );
  }


  /* ---------- INDEXED ALLOCATION ---------- */

  function indexed(fileId, count) {
    validate(fileId, count);

    // Indexed allocation needs:
    // 1 index block + requested data blocks.

    const required = count + 1;

    const freeBlocks = Disk.freeBlockList();

    if (freeBlocks.length < required) {
      throw new Error(
        "Not enough free blocks for indexed allocation. An additional index block is required."
      );
    }

    const selected = freeBlocks.slice(0, required);

    return reserve(
      fileId,
      selected,
      TYPE.INDEXED,
      true
    );
  }


  /* ---------- GENERAL ALLOCATION ---------- */

  function allocate(type, fileId, count) {
    switch (type) {

      case TYPE.CONTIGUOUS:
        return contiguous(fileId, count);

      case TYPE.LINKED:
        return linked(fileId, count);

      case TYPE.INDEXED:
        return indexed(fileId, count);

      default:
        throw new Error("Unknown allocation method.");
    }
  }


  /* ---------- DEALLOCATE FILE BLOCKS ---------- */

  function deallocate(fileId) {
    const id = Number(fileId);

    const records = Store.db.file_allocations.filter(
      a => a.file_id === id
    );

    if (records.length === 0) {
      return [];
    }

    const released = [];

    for (const record of records) {
      const block = Store.db.disk_blocks.find(
        b => b.block_id === record.block_id
      );

      if (block && block.is_occupied && block.file_id === id) {
        block.is_occupied = false;
        block.file_id = null;
        block.block_content = null;

        released.push(block.block_id);
      }
    }

    Store.db.file_allocations =
      Store.db.file_allocations.filter(
        a => a.file_id !== id
      );

    Store.db.index_blocks =
      Store.db.index_blocks.filter(
        a => a.file_id !== id
      );

    Store.save();

    return released;
  }


  /* ---------- GET ALL FILE BLOCKS ---------- */

  function blocksOf(fileId) {
    return Store.db.file_allocations
      .filter(a => a.file_id === Number(fileId))
      .sort((a, b) =>
        a.sequence_number - b.sequence_number
      );
  }


  /* ---------- GET DATA BLOCKS ONLY ---------- */

  function dataBlocksOf(fileId) {
    return blocksOf(fileId)
      .filter(a => a.sequence_number >= 0);
  }


  /* ---------- GET INDEX BLOCK ---------- */

function indexBlockOf(fileId) {
  const indexRecord = Store.db.index_blocks.find(
    a => a.file_id === Number(fileId)
  ) || null;

  if (indexRecord) {
    const block = Store.db.disk_blocks.find(
      b => b.block_id === indexRecord.block_id
    );

    if (
  block &&
  block.is_occupied &&
  block.block_content !== 'INDEX'
) {
  block.block_content = 'INDEX';
  Store.save();
}
  }

  return indexRecord;
}


  /* ---------- PUBLIC METHODS ---------- */

  return {
    TYPE,

    allocate,
    contiguous,
    linked,
    indexed,

    deallocate,

    blocksOf,
    dataBlocksOf,
    indexBlockOf
  };

})();


/* ---------- ES MODULE EXPORT ---------- */

export default Allocation;
