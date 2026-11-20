/* ============================================================
   app.js — Screens, navigation and event wiring
   ============================================================ */

import Store from "./store.js";
import Disk from "./disk.js";
import Allocation from "./allocation.js";
import Auth from "./auth.js";
import Engine from "./engine.js";
import UI from "./ui.js";

let currentDir = 1;        // current directory in the explorer
let selectedFileId = null; // for the metadata / allocation views

/* ---------------- boot ---------------- */

window.addEventListener('DOMContentLoaded', () => {
  // Initialize database and virtual disk
  Store.init();
  Disk.ensure();
  Store.save();

  // Login button
  document.getElementById('loginBtn').onclick = doLogin;

  document.getElementById('loginPass').addEventListener('keydown', e => {
    if (e.key === 'Enter') {
      doLogin();
    }
  });

  // Sidebar navigation
  document.querySelectorAll('.nav-item').forEach(el => {
    el.onclick = () => go(el.dataset.view);
  });

  // Logout
  document.getElementById('logoutBtn').onclick = () => {
    Auth.logout();
    Store.save();

    document.getElementById('app').classList.add('hidden');
    document.getElementById('loginScreen').classList.remove('hidden');

    document.getElementById('loginPass').value = '';
  };
});



function doLogin() {
  const username = document.getElementById('loginUser').value.trim();
  const password = document.getElementById('loginPass').value;
  const errorElement = document.getElementById('loginError');

  const result = Auth.login(username, password);

  if (!result.ok) {
    errorElement.textContent = result.error;
    return;
  }

  errorElement.textContent = '';
  Store.save();

  // Show application
  document.getElementById('loginScreen').classList.add('hidden');
  document.getElementById('app').classList.remove('hidden');

  // Display logged-in user
  const user = Auth.user();

  document.getElementById('userName').textContent = user.username;
  document.getElementById('userRole').textContent = user.role;
  document.getElementById('userAvatar').textContent =
    user.username.charAt(0).toUpperCase();

   
  // Open dashboard
  go('dashboard');
}


/* ---------------- navigation ---------------- */
const VIEW_TITLES = {
  dashboard: 'Dashboard', explorer: 'File Explorer', directory: 'Directory Manager',
  metadata: 'File Metadata', allocation: 'Block Allocation',
  bitmap: 'Bitmap Visualization', disk: 'Virtual Disk Management',
  permissions: 'Permissions Manager', users: 'User Management',
  logs: 'Activity Logs', settings: 'Settings'
};


function go(view) {
  // Check whether the requested view exists
  if (!Object.hasOwn(render, view)) {
    console.warn(`Unknown application view: ${view}`);
    return;
  }

  // Update active sidebar item
  document.querySelectorAll('.nav-item').forEach(el => {
    el.classList.toggle('active', el.dataset.view === view);
  });

  // Update page title
  document.getElementById('viewTitle').textContent =
    VIEW_TITLES[view] || view;

  // Refresh virtual disk status
  refreshPill();

  // Render selected view
  render[view]();

  // Reset content scroll position
  document.getElementById('content').scrollTop = 0;
}


function refreshPill() {
  document.getElementById("pillText").textContent =
    `${Disk.usedKB()} / ${Disk.capacityKB()} KB used`;

  const usage = Disk.usagePercent();

  document.querySelector(".disk-pill .dot").style.background =
    usage > 85
      ? "var(--danger)"
      : usage > 60
        ? "var(--warn)"
        : "var(--ok)";
}

const render = {};

/* ================= DASHBOARD ================= */

render.dashboard = () => {
  const totalFiles = Store.db.files.length;
  const totalDirs = Math.max(0, Store.db.directories.length - 1);
  const pct = Disk.usagePercent();

  const recentFiles = [...Store.db.files]
    .sort((a, b) =>
      new Date(b.modified_at) - new Date(a.modified_at)
    )
    .slice(0, 5);

  const recentLogs = Store.db.activity_logs.slice(0, 6);

  document.getElementById('content').innerHTML = `
    <div class="grid cols-4" style="margin-bottom:16px">

      <div class="stat brand">
        <div class="label">Total Disk Capacity</div>
        <div class="value">${Disk.capacityKB()} KB</div>
        <div class="sub">
          ${Disk.totalBlocks()} blocks @
          ${Store.db.virtual_disks[0].block_size} KB
        </div>
      </div>

      <div class="stat warn">
        <div class="label">Used Storage</div>
        <div class="value">${Disk.usedKB()} KB</div>
        <div class="sub">${Disk.usedBlocks()} blocks occupied</div>
      </div>

      <div class="stat ok">
        <div class="label">Available Storage</div>
        <div class="value">${Disk.freeKB()} KB</div>
        <div class="sub">${Disk.freeBlocks()} blocks free</div>
      </div>

      <div class="stat">
        <div class="label">Total Files</div>
        <div class="value">${totalFiles}</div>
        <div class="sub">
          ${totalDirs} director${totalDirs === 1 ? 'y' : 'ies'}
        </div>
      </div>

    </div>

    <div class="grid cols-2" style="margin-bottom:16px">

      <div class="card">
        <div class="card-head">
          <div>
            <h3>Disk Usage</h3>
            <p>${pct}% of virtual disk occupied</p>
          </div>
        </div>

        <div class="card-body">
          <div class="progress ${pct > 85 ? 'warn' : ''}">
            <div style="width:${pct}%"></div>
          </div>

          <div class="legend">
            <span>
              <i class="swatch used"></i>
              Occupied (${Disk.usedBlocks()})
            </span>

            <span>
              <i class="swatch free"></i>
              Free (${Disk.freeBlocks()})
            </span>
          </div>
        </div>
      </div>

      <div class="card">
        <div class="card-head">
          <div>
            <h3>Block Allocation by Method</h3>
            <p>Files using each algorithm</p>
          </div>
        </div>

        <div class="card-body">
          ${['Contiguous', 'Linked', 'Indexed'].map(type => {
            const count = Store.db.files.filter(
              f => f.allocation_type === type
            ).length;

            const percentage = totalFiles
              ? Math.round(count / totalFiles * 100)
              : 0;

            return `
              <div style="margin-bottom:13px">
                <div class="row"
                  style="justify-content:space-between;margin-bottom:6px">

                  ${UI.allocBadge(type)}

                  <span style="font-size:12.5px;font-weight:700">
                    ${count} file(s) — ${percentage}%
                  </span>
                </div>

                <div class="progress">
                  <div style="width:${percentage}%"></div>
                </div>
              </div>
            `;
          }).join('')}
        </div>
      </div>

    </div>

    <div class="grid cols-2">

      <div class="card">
        <div class="card-head">
          <h3>Recent Files</h3>
        </div>

        <div class="card-body" style="padding:0">
          ${recentFiles.length ? `
            <div class="scroll-x">
              <table>
                <tbody>
                  ${recentFiles.map(file => `
                    <tr>
                      <td style="width:36px">
                        ${UI.glyph(file)}
                      </td>

                      <td>
                        <strong>${UI.esc(file.filename)}</strong>
                        <div style="font-size:11.5px;color:var(--ink-faint)">
                          ${UI.esc(Engine.path(file.directory_id))}
                        </div>
                      </td>

                      <td style="text-align:right">
                        ${UI.allocBadge(file.allocation_type)}
                      </td>

                      <td style="text-align:right;font-size:12px;color:var(--ink-faint)">
                        ${UI.fmtDate(file.modified_at)}
                      </td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
            </div>
          ` : `
            <div class="empty">
              No files yet. Create one from File Explorer.
            </div>
          `}
        </div>
      </div>

      <div class="card">
        <div class="card-head">
          <h3>Recent Activity</h3>
        </div>

        <div class="card-body" style="padding:0">
          ${recentLogs.length ? `
            <div class="scroll-x">
              <table>
                <tbody>
                  ${recentLogs.map(log => {
                    const user = Store.userById(log.user_id);

                    return `
                      <tr>
                        <td>
                          <strong>
                            ${UI.esc(user ? user.username : 'system')}
                          </strong>

                          <div style="font-size:12px;color:var(--ink-soft)">
                            ${UI.esc(log.action || 'Unknown action')}
                          </div>
                        </td>

                        <td style="text-align:right;font-size:11.5px;color:var(--ink-faint);white-space:nowrap">
                          ${UI.fmtDate(log.timestamp)}
                        </td>
                      </tr>
                    `;
                  }).join('')}
                </tbody>
              </table>
            </div>
          ` : `
            <div class="empty">
              No activity recorded.
            </div>
          `}
        </div>
      </div>

    </div>
  `;
};


/* ================= FILE EXPLORER ================= */
render.explorer = () => {
  const files = Engine.filesIn(currentDir);
  const dirs = Engine.dirsIn(currentDir);
  const parent = Store.db.directories.find(d => d.directory_id === currentDir);

  document.getElementById('content').innerHTML = `
    <div class="toolbar">
      <div class="pathbar">${breadcrumb(currentDir)}</div>
      ${parent && parent.parent_id !== null
        ? `<button class="btn" id="upBtn">↑ Up</button>` : ''}
      <button class="btn btn-primary" id="newFileBtn">+ New File</button>
      <button class="btn" id="newDirBtn">+ New Folder</button>
    </div>

    <div class="explorer-grid">
      ${dirs.map(d => `
        <div class="tile" data-dir="${d.directory_id}">
          <div class="glyph">🗂</div>
          <div class="name">${UI.esc(d.directory_name)}</div>
          <div class="meta">${Engine.filesIn(d.directory_id).length} file(s)</div>
        </div>`).join('')}
      ${files.map(f => `
        <div class="tile" data-file="${f.file_id}">
          <div class="glyph">${UI.glyph(f)}</div>
          <div class="name">${UI.esc(f.filename)}</div>
          <div class="meta">${f.size} KB &middot; ${f.blocks.length} block(s)</div>
        </div>`).join('')}
    </div>
    ${!files.length && !dirs.length
      ? `<div class="card" style="margin-top:16px"><div class="empty">This folder is empty. Create a file or a folder to begin.</div></div>`
      : ''}`;

  // Navigate into a directory
document.querySelectorAll('[data-dir]').forEach(el =>
  el.onclick = () => {
    currentDir = +el.dataset.dir;
    render.explorer();
  }
);

// Navigate using breadcrumbs
document.querySelectorAll('[data-crumb]').forEach(el =>
  el.onclick = () => {
    currentDir = Number(el.dataset.crumb);
    render.explorer();
  }
);

// Open a file
document.querySelectorAll('[data-file]').forEach(el =>
  el.onclick = () => openFile(+el.dataset.file));

  const up = document.getElementById('upBtn');
  if (up) up.onclick = () => { currentDir = parent.parent_id; render.explorer(); };

  document.getElementById('newFileBtn').onclick = newFileDialog;
  document.getElementById('newDirBtn').onclick = newDirDialog;
};


function breadcrumb(dirId) {
  const parts = [];

  let d = Store.db.directories.find(
    x => x.directory_id === dirId
  );

  while (d) {
    parts.unshift({
      id: d.directory_id,
      name: d.directory_name
    });

    d = d.parent_id
      ? Store.db.directories.find(
          x => x.directory_id === d.parent_id
        )
      : null;
  }

  return parts.map((p, i) =>
    `<button
      type="button"
      class="crumb ${i === parts.length - 1 ? 'current' : ''}"
      data-crumb="${p.id}"
    >
      ${UI.esc(p.name === '/' ? '🏠 Root' : p.name)}
    </button>`
    + (i < parts.length - 1
      ? '<span style="color:var(--ink-faint)">/</span>'
      : '')
  ).join('');
}


/* ---------- new file dialog ---------- */

function newFileDialog() {
  const bs = Store.db.virtual_disks[0].block_size || 1;

  UI.modal({
    title: 'Create File',
    wide: true,

    body: `
      <div class="grid cols-2" style="gap:14px">
        <div class="field">
          <label>Filename</label>
          <input id="nfName" placeholder="report.txt">
        </div>

        <div class="field">
          <label>File Size (KB)</label>
          <input
            id="nfSize"
            type="number"
            min="0.01"
            step="0.01"
            value="3"
          >
        </div>
      </div>

      <div class="field">
        <label>Allocation Method</label>
        <select id="nfAlloc">
          <option value="Contiguous">Contiguous Allocation</option>
          <option value="Linked">Linked Allocation</option>
          <option value="Indexed">Indexed Allocation</option>
        </select>
      </div>

      <div class="field">
        <label>Contents (optional)</label>
        <textarea
          id="nfContent"
          class="editor-area"
          style="min-height:120px"
          placeholder="Type the file contents stored inside the simulated system..."
        ></textarea>
      </div>

      <div class="hint" id="nfHint"></div>
    `,

    footer: `
      <button class="btn" data-close>Cancel</button>
      <button class="btn btn-primary" id="nfCreate">
        Allocate &amp; Create
      </button>
    `
  });

  const sizeEl = document.getElementById('nfSize');
  const allocEl = document.getElementById('nfAlloc');

  // Calculate required disk blocks
  function updateHint() {
    const size = parseFloat(sizeEl.value) || 0;
    const dataBlocks = Math.ceil(size / bs);
    const indexBlocks = allocEl.value === 'Indexed' ? 1 : 0;
    const totalBlocks = dataBlocks + indexBlocks;
    const freeBlocks = Disk.freeBlocks();

    document.getElementById('nfHint').innerHTML =
      `<strong>${dataBlocks}</strong> data block(s) required` +
      (indexBlocks
        ? ` <strong>+ 1</strong> index block`
        : '') +
      ` &nbsp;·&nbsp; ${freeBlocks} block(s) free on the virtual disk.` +
      (totalBlocks > freeBlocks
        ? ` <span style="color:var(--danger)">Not enough free blocks.</span>`
        : '');
  }

  sizeEl.oninput = updateHint;
  allocEl.onchange = updateHint;

  updateHint();

  // Create file
  document.getElementById('nfCreate').onclick = () => {
    const name = document.getElementById('nfName').value.trim();
    const size = parseFloat(sizeEl.value);
    const content = document.getElementById('nfContent').value;
    const alloc = allocEl.value;

    if (!name) {
      UI.toast('Please enter a file name.', 'err');
      return;
    }

    if (!Number.isFinite(size) || size <= 0) {
      UI.toast('File size must be greater than 0 KB.', 'err');
      return;
    }

    const requiredDataBlocks = Math.ceil(size / bs);
    const requiredIndexBlocks = alloc === 'Indexed' ? 1 : 0;
    const totalRequired = requiredDataBlocks + requiredIndexBlocks;

    if (totalRequired > Disk.freeBlocks()) {
      UI.toast('Not enough free disk blocks.', 'err');
      updateHint();
      return;
    }

    const res = Engine.createFile(
      currentDir,
      name,
      size,
      content,
      alloc
    );

    if (!res.ok) {
      UI.toast(res.error, 'err');
      return;
    }

    UI.closeModal();

UI.toast(
 `"${res.file.filename}" created successfully using ${alloc} allocation.`,
  'ok'
);

    refreshPill();
    render.explorer();
  };
}


/* ---------- new directory dialog ---------- */

function newDirDialog() {
  const user = Auth.user();

  if (!user || user.role === Auth.ROLES.READONLY) {
    UI.toast('Your account cannot create directories.', 'err');
    return;
  }

  UI.modal({
    title: 'Create Directory',

    body: `
      <div class="field">
        <label>Folder Name</label>
        <input
          id="ndName"
          placeholder="Documents"
          maxlength="50"
        >
      </div>
    `,

    footer: `
      <button class="btn" data-close>Cancel</button>
      <button class="btn btn-primary" id="ndCreate">
        Create
      </button>
    `
  });

  document.getElementById('ndCreate').onclick = () => {
    const name = document.getElementById('ndName').value.trim();

    if (!name) {
      UI.toast('Please enter a directory name.', 'err');
      return;
    }

    const res = Engine.createDirectory(currentDir, name);

    if (!res.ok) {
      UI.toast(res.error, 'err');
      return;
    }

    UI.closeModal();

    UI.toast('Directory created.', 'ok');

    render.explorer();
  };
}


/* ---------- file action dialog ---------- */

function openFile(fileId) {
  const res = Engine.readFile(fileId);

  if (!res.ok) {
    UI.toast(res.error, 'err');
    return;
  }

  const f = res.file;
  selectedFileId = fileId;

  // Get allocated data blocks and index block
  const blocks = Allocation.blocksOf(fileId);

  const dataBlocks = blocks
    .filter(a => a.sequence_number >= 0)
    .map(a => a.block_id);

  const indexRow = blocks.find(
    a => a.sequence_number === -1
  );

  // Check user permissions
  const canWrite = Auth.can('write', f);
  const canExecute = Auth.can('execute', f);

  UI.modal({
    title: f.filename,
    wide: true,

    body: `
      <dl class="kv" style="margin-bottom:18px">
        <dt>Extension</dt>
        <dd class="mono">${UI.esc(f.extension || '(none)')}</dd>

        <dt>Size</dt>
        <dd>${f.size} KB</dd>

        <dt>Location</dt>
        <dd class="mono">${Engine.path(f.directory_id)}</dd>

        <dt>Created</dt>
        <dd>${UI.fmtDate(f.created_at)}</dd>

        <dt>Modified</dt>
        <dd>${UI.fmtDate(f.modified_at)}</dd>

        <dt>Allocation</dt>
        <dd>${UI.allocBadge(f.allocation_type)}</dd>

        <dt>Blocks</dt>
        <dd>${renderChain(f, dataBlocks, indexRow)}</dd>
      </dl>

      <div class="field">
        <label>File Contents</label>
        <textarea
          id="edContent"
          class="editor-area"
          ${canWrite ? '' : 'readonly'}
        >${UI.esc(f.content)}</textarea>
      </div>
    `,

    footer: `
      ${canExecute
        ? `<button class="btn btn-ghost" id="fExec">Execute</button>`
        : ''}

      ${canWrite ? `
        <button class="btn" id="fCopy">Copy</button>
        <button class="btn" id="fMove">Move</button>
        <button class="btn" id="fRename">Rename</button>
        <button class="btn btn-danger" id="fDelete">Delete</button>
        <span class="spacer"></span>
        <button class="btn btn-primary" id="fSave">Save Contents</button>
      ` : ''}
    `
  });

  // Save file contents
  const saveBtn = document.getElementById('fSave');

  if (saveBtn) {
    saveBtn.onclick = () => {
      const content = document.getElementById('edContent').value;

      const r = Engine.editFile(fileId, content);

      if (!r.ok) {
        UI.toast(r.error, 'err');
        return;
      }

      UI.toast('File contents saved; metadata updated.', 'ok');

      refreshPill();
      UI.closeModal();
      render.explorer();
    };
  }

  // Delete file
  const deleteBtn = document.getElementById('fDelete');

  if (deleteBtn) {
    deleteBtn.onclick = () => {
      UI.closeModal();

      UI.confirmDialog(
        'Delete File',
        `Delete "${f.filename}"? Its allocated blocks will be released and the bitmap updated.`,
        () => {
          const r = Engine.deleteFile(fileId);

          if (!r.ok) {
            UI.toast(r.error, 'err');
            return;
          }

          UI.toast(
            `Deleted. ${r.freed.length} block(s) released.`,
            'ok'
          );

          refreshPill();
          render.explorer();
        }
      );
    };
  }

  // Rename file
  const renameBtn = document.getElementById('fRename');

  if (renameBtn) {
    renameBtn.onclick = () => {
      UI.closeModal();
      renameDialog(f);
    };
  }

  // Copy file
  const copyBtn = document.getElementById('fCopy');

  if (copyBtn) {
    copyBtn.onclick = () => {
      UI.closeModal();
      copyMoveDialog(f, 'copy');
    };
  }

  // Move file
  const moveBtn = document.getElementById('fMove');

  if (moveBtn) {
    moveBtn.onclick = () => {
      UI.closeModal();
      copyMoveDialog(f, 'move');
    };
  }

  // Execute file
  const executeBtn = document.getElementById('fExec');

  if (executeBtn) {
    executeBtn.onclick = () => {
      const r = Engine.executeFile(fileId);

      UI.toast(
        r.ok ? r.message : r.error,
        r.ok ? 'ok' : 'err'
      );
    };
  }
}


function renderChain(f, dataBlocks, indexRow) {
  if (!dataBlocks || dataBlocks.length === 0) {
    return '<span style="color:var(--ink-faint)">No allocated blocks</span>';
  }

  // CONTIGUOUS ALLOCATION
  if (f.allocation_type === 'Contiguous') {
    return `
      <span class="allocation-chain">
        ${dataBlocks.map(block =>
          `<span class="block-chip">${block}</span>`
        ).join(' ')}
      </span>
    `;
  }

  // LINKED ALLOCATION
  if (f.allocation_type === 'Linked') {
    return `
      <span class="allocation-chain">
        ${dataBlocks.map(block =>
          `<span class="block-chip">${block}</span>`
        ).join('<span class="arrow"> → </span>')}
      </span>
    `;
  }

  // INDEXED ALLOCATION
  if (f.allocation_type === 'Indexed') {
    return `
      <span class="allocation-chain">
        <span class="index-chip">
          Index Block ${indexRow ? indexRow.block_id : 'Missing'}
        </span>
        <span class="arrow"> → </span>
        <span class="block-chip">
          ${dataBlocks.join(', ')}
        </span>
      </span>
    `;
  }

  return '<span style="color:var(--danger)">Unknown allocation type</span>';
}



function renameDialog(f) {
  if (!Auth.can('write', f)) {
    UI.toast('You do not have permission to rename this file.', 'err');
    return;
  }

  UI.modal({
    title: 'Rename File',

    body: `
      <div class="field">
        <label>New Filename</label>
        <input
          id="rnName"
          value="${UI.esc(f.filename)}"
          maxlength="100"
        >
      </div>
    `,

    footer: `
      <button class="btn" data-close>Cancel</button>
      <button class="btn btn-primary" id="rnGo">
        Rename
      </button>
    `
  });

  document.getElementById('rnGo').onclick = () => {
    const newName = document.getElementById('rnName').value.trim();

    if (!newName) {
      UI.toast('Please enter a new filename.', 'err');
      return;
    }

    if (newName.length > 100) {
      UI.toast('Filename cannot exceed 100 characters.', 'err');
      return;
    }

    const r = Engine.renameFile(f.file_id, newName);

    if (!r.ok) {
      UI.toast(r.error, 'err');
      return;
    }

    UI.closeModal();

    UI.toast('File renamed.', 'ok');

    render.explorer();
  };
}



function copyMoveDialog(f, mode) {
  // Check write permission
  if (!Auth.can('write', f)) {
    UI.toast('You do not have permission to copy or move this file.', 'err');
    return;
  }

  // Get available destination directories
  const dirs = Store.db.directories.filter(
    d => d.directory_id !== f.directory_id
  );

  UI.modal({
    title: mode === 'copy' ? 'Copy File' : 'Move File',

    body: dirs.length
      ? `
        <div class="field">
          <label>Destination Directory</label>
          <select id="cmDir">
            ${dirs.map(d => `
              <option value="${d.directory_id}">
                ${UI.esc(Engine.path(d.directory_id))}
              </option>
            `).join('')}
          </select>
        </div>

        ${mode === 'copy'
          ? `<div class="hint">
               Copying allocates <strong>new blocks</strong>
               using the same allocation method.
             </div>`
          : `<div class="hint">
               Moving keeps the same allocated blocks and
               changes the directory location.
             </div>`
        }
      `
      : `
        <div class="empty">
          No other destination directories are available.
          Create another folder first.
        </div>
      `,

    footer: `
      <button class="btn" data-close>Cancel</button>
      <button
        class="btn btn-primary"
        id="cmGo"
        ${dirs.length === 0 ? 'disabled' : ''}
      >
        ${mode === 'copy' ? 'Copy' : 'Move'}
      </button>
    `
  });

  const goButton = document.getElementById('cmGo');

  goButton.onclick = () => {
    const target = Number(
      document.getElementById('cmDir').value
    );

    const destination = Store.db.directories.find(
      d => d.directory_id === target
    );

    if (!Number.isInteger(target) || !destination) {
      UI.toast('Please select a valid destination directory.', 'err');
      return;
    }

    if (target === f.directory_id) {
      UI.toast('Choose a different destination directory.', 'err');
      return;
    }

    const r = mode === 'copy'
      ? Engine.copyFile(f.file_id, target)
      : Engine.moveFile(f.file_id, target);

    if (!r.ok) {
      UI.toast(r.error, 'err');
      return;
    }

    UI.closeModal();

    UI.toast(
      mode === 'copy' ? 'File copied.' : 'File moved.',
      'ok'
    );

    refreshPill();
    render.explorer();
  };
}


/* ================= DIRECTORY MANAGER ================= */

render.directory = () => {
  const tree = Engine.directoryTree();

  document.getElementById('content').innerHTML = `
    <div class="grid cols-2">
      <div class="card">
        <div class="card-head">
          <div>
            <h3>Directory Structure</h3>
            <p>Click a folder to open it in the explorer</p>
          </div>
        </div>
        <div class="card-body" id="treeHost"></div>
      </div>

      <div class="card">
        <div class="card-head">
          <h3>Directory Records</h3>
        </div>
        <div class="card-body" style="padding:0">
          <div class="scroll-x">
            <table>
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Name</th>
                  <th>Parent</th>
                  <th>Path</th>
                  <th>Files</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                ${Store.db.directories.map(d => {
                  const p = d.parent_id
                    ? Store.db.directories.find(
                        x => x.directory_id === d.parent_id
                      )
                    : null;

                  const isRoot = d.parent_id === null;

                  return `
                    <tr>
                      <td class="mono">${d.directory_id}</td>
                      <td><strong>${UI.esc(d.directory_name)}</strong></td>
                      <td class="mono">
                        ${p ? UI.esc(p.directory_name) : '—'}
                      </td>
                      <td class="mono">
                        ${UI.esc(Engine.path(d.directory_id))}
                      </td>
                      <td>${Engine.filesIn(d.directory_id).length}</td>
                      <td>
                        ${isRoot ? '<span class="muted">Protected</span>' : `
                          <button class="btn btn-sm"
                            data-rename-dir="${d.directory_id}">
                            Rename
                          </button>
                          <button class="btn btn-sm danger"
                            data-delete-dir="${d.directory_id}">
                            Delete
                          </button>
                        `}
                      </td>
                    </tr>
                  `;
                }).join('')}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  `;

  document.getElementById('treeHost').innerHTML =
    renderTree(tree, 0);

  document.querySelectorAll('[data-goto]').forEach(el =>
    el.onclick = () => {
      currentDir = +el.dataset.goto;
      go('explorer');
    }
  );

  document.querySelectorAll('[data-rename-dir]').forEach(el => {
    el.onclick = () => {
      const id = +el.dataset.renameDir;
      const dir = Store.db.directories.find(
        d => d.directory_id === id
      );

      if (!dir) return;

      UI.modal({
        title: 'Rename Directory',
        body: `
          <label>New Directory Name</label>
          <input id="renameDirName"
            value="${UI.esc(dir.directory_name)}"
            maxlength="50">
        `,
        footer: `
  <button class="btn" data-close>Cancel</button>
  <button class="btn btn-primary" id="saveRenameDir">
    Save Changes
  </button>
`
      });

      document.getElementById('saveRenameDir').onclick = () => {
        const name = document.getElementById('renameDirName').value;
        const res = Engine.renameDirectory(id, name);

        if (!res.ok) {
          UI.toast(res.error, 'err');
          return;
        }

        UI.closeModal();
        UI.toast('Directory renamed successfully.', 'ok');
        render.directory();
      };
    };
  });

  document.querySelectorAll('[data-delete-dir]').forEach(el => {
    el.onclick = () => {
      const id = +el.dataset.deleteDir;
      const dir = Store.db.directories.find(
        d => d.directory_id === id
      );

      if (!dir) return;

      UI.confirmDialog(
        'Delete Directory',
        `Are you sure you want to delete "${dir.directory_name}"?`,
        () => {
          const res = Engine.deleteDirectory(id);

          if (!res.ok) {
            UI.toast(res.error, 'err');
            return;
          }

          UI.toast('Directory deleted successfully.', 'ok');
          render.directory();
        }
      );
    };
  });
};



function renderTree(node, depth) {
  const hasKids = node.children.length > 0;
  const pad = depth * 16;

  return `
    <div style="padding-left:${pad}px;margin-bottom:8px">

      <div class="row" style="gap:8px;align-items:center;flex-wrap:wrap">

        <button
          type="button"
          class="btn btn-sm btn-ghost"
          data-goto="${node.id}"
          style="font-family:var(--mono);font-size:13px"
        >
          ${hasKids ? '🗂' : '📁'}
          ${UI.esc(node.name === '/' ? 'Root' : node.name)}
        </button>

        <span class="badge grey">
          ${node.files} file(s)
        </span>

        <span class="badge grey">
          ${node.children.length} folder(s)
        </span>

      </div>

    </div>

    ${node.children
      .map(child => renderTree(child, depth + 1))
      .join('')}
  `;
}



/* ================= METADATA ================= */

render.metadata = () => {
  const files = Store.db.files;

  document.getElementById('content').innerHTML = `
    <div class="card">
      <div class="card-head">
        <div>
          <h3>File Attributes and Metadata</h3>
          <p>
            All attributes recorded for every file in the simulated system
          </p>
        </div>
      </div>

      <div class="card-body" style="padding:0">
        ${files.length
          ? `
            <div class="scroll-x">
              <table>
                <thead>
                  <tr>
                    <th>Filename</th>
                    <th>Extension</th>
                    <th>Size</th>
                    <th>Location</th>
                    <th>Created</th>
                    <th>Modified</th>
                    <th>Allocation</th>
                    <th>Data Blocks</th>
                    <th>Index Block</th>
                    <th>Total Blocks</th>
                  </tr>
                </thead>

                <tbody>
                  ${files.map(f => {
                    const dataBlocks = (f.blocks || []).map(
  block => block.block_id
);
                    const indexBlock = f.index_block ?? null;
                    const indexBlockId =
  indexBlock && typeof indexBlock === 'object'
    ? indexBlock.block_id
    : indexBlock;
                    const totalBlocks =
                      dataBlocks.length + (indexBlock !== null ? 1 : 0);

                    return `
                      <tr>
                        <td>
                          <strong>
                            ${UI.glyph(f)}
                            ${UI.esc(f.filename)}
                          </strong>
                        </td>

                        <td class="mono">
                          ${UI.esc(f.extension || '—')}
                        </td>

                        <td>${f.size} KB</td>

                        <td class="mono">
                          ${UI.esc(Engine.path(f.directory_id))}
                        </td>

                        <td style="font-size:12px;color:var(--ink-soft)">
                          ${UI.fmtDate(f.created_at)}
                        </td>

                        <td style="font-size:12px;color:var(--ink-soft)">
                          ${UI.fmtDate(f.modified_at)}
                        </td>

                        <td>
                          ${UI.allocBadge(f.allocation_type)}
                        </td>

                        <td class="mono">
                          ${dataBlocks.join(', ') || '—'}
                        </td>

                       <td class="mono">
  ${indexBlockId ?? '—'}
</td>

                        <td>
                          <strong>${totalBlocks}</strong>
                        </td>
                      </tr>
                    `;
                  }).join('')}
                </tbody>
              </table>
            </div>
          `
          : `
            <div class="empty">
              No files available. Create one from the File Explorer.
            </div>
          `
        }
      </div>
    </div>
  `;
};


/* ================= ALLOCATION ================= */

render.allocation = () => {
  const files = Store.db.files;

  document.getElementById('content').innerHTML = `
    <div class="hint" style="margin-bottom:16px">
      <strong>Note:</strong> These are the actual blocks reserved
      on the virtual disk. Each method uses a different
      block-location strategy.
    </div>

    <div class="grid cols-3" style="margin-bottom:16px">
      ${['Contiguous', 'Linked', 'Indexed'].map(type => {
        const methodFiles = files.filter(
          f => f.allocation_type === type
        );

        const reservedBlocks = methodFiles.reduce((total, f) => {
          const dataCount = Allocation.dataBlocksOf(f.file_id).length;
          const indexCount = Allocation.indexBlockOf(f.file_id) !== null ? 1 : 0;

          return total + dataCount + indexCount;
        }, 0);

        return `
          <div class="stat">
            <div class="label">${type} Allocation</div>
            <div class="value">${methodFiles.length}</div>
            <div class="sub">
              ${reservedBlocks} block(s) reserved
            </div>
          </div>
        `;
      }).join('')}
    </div>

    <div class="card">
      <div class="card-head">
        <div>
          <h3>Allocation Table</h3>
          <p>Actual block assignments for every file</p>
        </div>
      </div>

      <div class="card-body" style="padding:0">
        ${files.length
          ? `
            <div class="scroll-x">
              <table>
                <thead>
                  <tr>
                    <th>File</th>
                    <th>Method</th>
                    <th>Blocks Required</th>
                    <th>Block Mapping</th>
                  </tr>
                </thead>

                <tbody>
                  ${files.map(f => {
                    const rows = Allocation.dataBlocksOf(f.file_id);

                    const dataBlocks = rows.map(
                      allocation => allocation.block_id
                    );

                    const indexBlock =
                      Allocation.indexBlockOf(f.file_id);

                    const indexRow = indexBlock
  ? { block_id: indexBlock.block_id }
  : null;

                    const totalBlocks =
                      dataBlocks.length + (indexRow ? 1 : 0);

                    return `
                      <tr>
                        <td>
                          <strong>${UI.esc(f.filename)}</strong>
                          <div style="font-size:11.5px;color:var(--ink-faint)">
                            ${f.size} KB
                          </div>
                        </td>

                        <td>
                          ${UI.allocBadge(f.allocation_type)}
                        </td>

                        <td class="mono">
                          ${dataBlocks.length}
                          ${indexRow ? ' + 1 index' : ''}
                          <div style="font-size:11px;color:var(--ink-faint)">
                            ${totalBlocks} total
                          </div>
                        </td>

                        <td>
                          ${renderChain(f, dataBlocks, indexRow)}
                        </td>
                      </tr>
                    `;
                  }).join('')}
                </tbody>
              </table>
            </div>
          `
          : `
            <div class="empty">
              No allocations yet. Create a file to see its block allocation.
            </div>
          `
        }
      </div>
    </div>
  `;
};


/* ================= BITMAP ================= */

render.bitmap = () => {
  const bit = Disk.bitmap();
  const byFile = {};

  Store.db.disk_blocks.forEach(block => {
    if (block.is_occupied && block.file_id != null) {
      byFile[block.file_id] =
        (byFile[block.file_id] || 0) + 1;
    }
  });

  document.getElementById('content').innerHTML = `
    <div class="grid cols-4" style="margin-bottom:16px">
      <div class="stat ok">
        <div class="label">Free Blocks (0)</div>
        <div class="value">${Disk.freeBlocks()}</div>
        <div class="sub">${Disk.freeKB()} KB available</div>
      </div>

      <div class="stat brand">
        <div class="label">Occupied Blocks (1)</div>
        <div class="value">${Disk.usedBlocks()}</div>
        <div class="sub">${Disk.usedKB()} KB in use</div>
      </div>

      <div class="stat">
        <div class="label">Total Blocks</div>
        <div class="value">${Disk.totalBlocks()}</div>
        <div class="sub">@ ${Store.db.virtual_disks[0].block_size} KB each</div>
      </div>

      <div class="stat">
        <div class="label">Usage</div>
        <div class="value">${Disk.usagePercent()}%</div>
        <div class="sub">of virtual disk</div>
      </div>
    </div>

    <div class="card">
      <div class="card-head">
        <div>
          <h3>Virtual Disk Bitmap</h3>
          <p>Each square represents one disk block. Click a block to inspect it.</p>
        </div>
      </div>

      <div class="card-body">
        <div class="bitmap">
          ${bit.map((value, i) => {
            const block = Store.db.disk_blocks[i];

            const file = block.file_id != null
              ? Store.db.files.find(
                  f => f.file_id === block.file_id
                )
              : null;

            const label = value
              ? `Block ${i} — OCCUPIED by ${file ? file.filename : 'unknown'}${block.block_content === 'INDEX' ? ' (index block)' : ''}`
              : `Block ${i} — FREE`;

            return `
              <div
                class="bit ${value ? 'used' : ''}"
                data-bit="${i}"
                title="${UI.esc(label)}"
              ></div>
            `;
          }).join('')}
        </div>

        <div class="legend">
          <span>
            <i class="swatch used"></i>
            Occupied — 1 (${Disk.usedBlocks()})
          </span>

          <span>
            <i class="swatch free"></i>
            Free — 0 (${Disk.freeBlocks()})
          </span>
        </div>
      </div>
    </div>

    <div class="card" style="margin-top:16px">
      <div class="card-head">
        <h3>Blocks per File</h3>
      </div>

      <div class="card-body" style="padding:0">
        ${Object.keys(byFile).length
          ? `
            <div class="scroll-x">
             
<table>
  <thead>
    <tr>
      <th>Filename</th>
      <th>Method</th>
      <th>Data Blocks</th>
      <th>Index Block</th>
      <th>Total</th>
    </tr>
  </thead>

  <tbody>
    ${Object.keys(byFile).map(fid => {
      const f = Store.db.files.find(
  x => String(x.file_id) === String(fid)
);

      if (!f) return '';

      const dataBlocks =
        Allocation.dataBlocksOf(f.file_id);

      const indexBlock =
        Allocation.indexBlockOf(f.file_id);

      const dataBlockIds = dataBlocks.map(
        block => block.block_id
      );

      return `
        <tr>
          <td>
            <strong>${UI.esc(f.filename)}</strong>
          </td>

          <td>${UI.allocBadge(f.allocation_type)}</td>

          <td class="mono">
            ${dataBlockIds.join(', ') || '—'}
          </td>

          <td class="mono">
  ${indexBlock !== null ? indexBlock.block_id ?? indexBlock : '—'}
</td>

          <td>
            <strong>${byFile[fid]}</strong>
          </td>
        </tr>
      `;
    }).join('')}
  </tbody>
</table>

            </div>
          `
          : `
            <div class="empty">No blocks occupied.</div>
          `
        }
      </div>
    </div>
  `;

  // Inspect individual disk blocks
  document.querySelectorAll('[data-bit]').forEach(el => {
    el.onclick = () => {
      const i = Number(el.dataset.bit);
      const block = Store.db.disk_blocks[i];

      const file = block.file_id != null
        ? Store.db.files.find(
            f => f.file_id === block.file_id
          )
        : null;

      UI.modal({
        title: `Block ${i}`,

        body: `
          <dl class="kv">
            <dt>Block ID</dt>
            <dd class="mono">${i}</dd>

            <dt>Bitmap Value</dt>
            <dd class="mono">${block.is_occupied ? 1 : 0}</dd>

            <dt>Status</dt>
            <dd>
              ${block.is_occupied ? 'Occupied' : 'Free'}
            </dd>

            <dt>Owner File</dt>
            <dd>
              ${file ? UI.esc(file.filename) : '—'}
            </dd>

            <dt>Block Content</dt>
            <dd class="mono">
              ${UI.esc(block.block_content || '—')}
            </dd>
          </dl>
        `,

        footer: `
          <button class="btn" data-close>Close</button>
        `
      });
    };
  });
};


/* ================= VIRTUAL DISK MANAGEMENT ================= */



render.disk = () => {
  const d = Store.db.virtual_disks[0];
  const pct = Disk.usagePercent();
  const isAdmin = Auth.isAdmin();

  document.getElementById('content').innerHTML = `
    <div class="grid cols-3" style="margin-bottom:16px">
      <div class="stat brand">
        <div class="label">Total Capacity</div>
        <div class="value">${Disk.capacityKB()} KB</div>
      </div>

      <div class="stat warn">
        <div class="label">Used Storage</div>
        <div class="value">${Disk.usedKB()} KB</div>
      </div>

      <div class="stat ok">
        <div class="label">Available Storage</div>
        <div class="value">${Disk.freeKB()} KB</div>
      </div>
    </div>

    <div class="grid cols-2">
      <div class="card">
        <div class="card-head">
          <div>
            <h3>Capacity Configuration</h3>
            <p>Disk resizing is allowed only when no blocks are occupied.</p>
          </div>
        </div>

        <div class="card-body">
          <div class="field">
            <label>Disk Name</label>
            <input
              id="dkName"
              value="${UI.esc(d.disk_name)}"
              ${isAdmin ? '' : 'disabled'}
            >
          </div>

          <div class="grid cols-2" style="gap:14px">
            <div class="field">
              <label>Block Size (KB)</label>
              <input
                id="dkBlock"
                type="number"
                min="1"
                step="1"
                value="${d.block_size}"
                ${isAdmin ? '' : 'disabled'}
              >
            </div>

            <div class="field">
              <label>Total Capacity (KB)</label>
              <input
                id="dkCap"
                type="number"
                min="10"
                step="1"
                value="${d.total_capacity}"
                ${isAdmin ? '' : 'disabled'}
              >
            </div>
          </div>

          <div class="hint">
            Current layout:
            <strong>${Disk.totalBlocks()} blocks</strong>
            of <strong>${d.block_size} KB</strong> each.
          </div>

          ${isAdmin ? `
            <div class="row end" style="margin-top:16px">
              <button class="btn btn-primary" id="dkApply">
                Apply Configuration
              </button>
            </div>
          ` : `
            <div class="hint" style="margin-top:16px">
              Only administrators can change disk configuration.
            </div>
          `}
        </div>
      </div>

      <div class="card">
        <div class="card-head">
          <h3>Storage Consumption</h3>
        </div>

        <div class="card-body">
          <div class="progress ${pct > 85 ? 'warn' : ''}" style="height:14px">
            <div style="width:${pct}%"></div>
          </div>

          <p style="margin:12px 0 18px;font-size:13px;color:var(--ink-soft)">
            <strong>${pct}%</strong> of the virtual disk is occupied
            (${Disk.usedBlocks()} of ${Disk.totalBlocks()} blocks).
          </p>

          <div class="hint">
            <strong>Overflow prevention:</strong>
            Every create and edit operation checks available disk blocks
            before allocating storage.
          </div>
        </div>
      </div>
    </div>
  `;

  if (!isAdmin) return;

  document.getElementById('dkApply').onclick = () => {
    const user = Auth.user();

    if (!user || !Auth.isAdmin()) {
      UI.toast('Only administrators can change disk configuration.', 'err');
      return;
    }

    const cap = Number(document.getElementById('dkCap').value);
    const bs = Number(document.getElementById('dkBlock').value);
    const name =
      document.getElementById('dkName').value.trim() ||
      'Virtual Disk 0';

    if (!Number.isInteger(cap) || cap < 10) {
      UI.toast('Capacity must be at least 10 KB.', 'err');
      return;
    }

    if (!Number.isInteger(bs) || bs < 1) {
      UI.toast('Block size must be at least 1 KB.', 'err');
      return;
    }

    if (cap % bs !== 0) {
      UI.toast('Capacity must be divisible by block size.', 'err');
      return;
    }

    // Save the disk name independently.
   // Check whether the user actually requested a disk resize.
const resizeRequested =
  cap !== Number(d.total_capacity) ||
  bs !== Number(d.block_size);

// Save the disk name independently.
d.disk_name = name;

// If only the disk name changed, save it without resizing.
if (!resizeRequested) {
  Store.log(
    user.user_id,
    `Renamed virtual disk to "${name}"`
  );

  Store.save();

  UI.toast('Disk name updated successfully.', 'ok');

  refreshPill();
  render.disk();
  return;
}

Store.save();

// Prevent resizing while files occupy disk blocks.
if (Disk.usedBlocks() > 0) {
      UI.toast(
        'Disk resizing is blocked while files occupy disk blocks. Existing data was preserved.',
        'err'
      );

      refreshPill();
      render.disk();
      return;
    }

    try {
      Disk.setDiskSize(cap, bs);

      Store.log(
        user.user_id,
        `Updated virtual disk configuration to ${cap} KB @ ${bs} KB/block`
      );

      Store.save();

      UI.toast('Disk configuration updated successfully.', 'ok');

      refreshPill();
      render.disk();

    } catch (error) {
      UI.toast(
        error.message || 'Unable to update disk configuration.',
        'err'
      );
    }
  };
};



/* ================= PERMISSIONS ================= */

render.permissions = () => {
  const files = Store.db.files;
  const users = Store.db.users;
  const isAdmin = Auth.isAdmin();
  const currentUser = Auth.user();

  document.getElementById('content').innerHTML = `
    <div class="hint" style="margin-bottom:16px">
      Signed in as <strong>${UI.esc(currentUser.username)}</strong>
      (${UI.esc(currentUser.role)}).
      ${isAdmin
        ? 'Administrators bypass permission checks.'
        : 'You can view the permission matrix but cannot modify it.'}
    </div>

    <div class="card">
      <div class="card-head">
        <div>
          <h3>Permission Matrix</h3>
          <p>Read · Write · Execute per file, per user</p>
        </div>
      </div>

      <div class="card-body" style="padding:0">
        ${files.length ? users.map(u => `
          <div style="padding:16px 20px;border-bottom:1px solid var(--line)">
            <div class="row" style="margin-bottom:10px">
              <strong>${UI.esc(u.username)}</strong>
              <span class="badge grey">${UI.esc(u.role)}</span>
            </div>

            <div class="scroll-x">
              <table>
                <thead>
                  <tr>
                    <th>File</th>
                    <th>Read</th>
                    <th>Write</th>
                    <th>Execute</th>
                  </tr>
                </thead>
                <tbody>
                  ${files.map(f => {
                    const p = Store.getPermission(f.file_id, u.user_id) || {
                      can_read: false,
                      can_write: false,
                      can_execute: false
                    };

                    return `
                      <tr>
                        <td>${UI.esc(f.filename)}</td>
                        <td>
                          <label class="chk">
                            <input type="checkbox"
                              data-p="${u.user_id}-${f.file_id}-r"
                              ${p.can_read ? 'checked' : ''}
                              ${!isAdmin ? 'disabled' : ''}>
                            Read
                          </label>
                        </td>
                        <td>
                          <label class="chk">
                            <input type="checkbox"
                              data-p="${u.user_id}-${f.file_id}-w"
                              ${p.can_write ? 'checked' : ''}
                              ${!isAdmin ? 'disabled' : ''}>
                            Write
                          </label>
                        </td>
                        <td>
                          <label class="chk">
                            <input type="checkbox"
                              data-p="${u.user_id}-${f.file_id}-x"
                              ${p.can_execute ? 'checked' : ''}
                              ${!isAdmin ? 'disabled' : ''}>
                            Execute
                          </label>
                        </td>
                      </tr>
                    `;
                  }).join('')}
                </tbody>
              </table>
            </div>
          </div>
        `).join('') :
          `<div class="empty">Create files first to manage their permissions.</div>`
        }
      </div>
    </div>

    <div class="card" style="margin-top:16px">
      <div class="card-head">
        <div>
          <h3>Verify Enforcement</h3>
          <p>Test file access using another account</p>
        </div>
      </div>

      <div class="card-body">
        <div class="hint">
          The <strong>guest</strong> account is Read-only.
          Sign in as <code>guest</code> / <code>guest123</code>
          and try to create, edit or delete a file.
          The engine should reject unauthorized operations
          and record DENIED in Activity Logs.
        </div>
      </div>
    </div>
  `;

  if (!isAdmin) return;

  document.querySelectorAll('[data-p]').forEach(cb => {
    cb.onchange = () => {
      const [uid, fid, kind] = cb.dataset.p.split('-');

      const userId = Number(uid);
      const fileId = Number(fid);

      let p = Store.getPermission(fileId, userId);

      if (!p) {
        Store.addPermission(fileId, userId, false, false, false);
        p = Store.getPermission(fileId, userId);
      }

      if (!p) {
        UI.toast('Unable to update permission.', 'err');
        render.permissions();
        return;
      }

      if (kind === 'r') p.can_read = cb.checked;
      if (kind === 'w') p.can_write = cb.checked;
      if (kind === 'x') p.can_execute = cb.checked;

      const file = Store.db.files.find(f => f.file_id === fileId);
      const targetUser = Store.userById(userId);

      Store.log(
        currentUser.user_id,
        `Set ${kind.toUpperCase()} permission for ${targetUser.username} on "${file.filename}" to ${cb.checked}`
      );

      Store.save();
      UI.toast('Permission updated.', 'ok');
    };
  });
};



render.users = () => {
  const currentUser = Auth.user();
  const isAdmin = Auth.isAdmin();
  const users = Store.db.users;

  document.getElementById('content').innerHTML = `
    <div class="toolbar">
      ${isAdmin
        ? `<button class="btn btn-primary" id="addUser">+ Register User</button>`
        : ''}
      <span class="spacer"></span>
      <span class="badge grey">${users.length} account(s)</span>
    </div>

    <div class="card">
      <div class="card-head">
        <h3>User Accounts</h3>
      </div>

      <div class="card-body" style="padding:0">
        <table>
          <thead>
            <tr>
              <th>ID</th>
              <th>Username</th>
              <th>Role</th>
              <th>Created</th>
              ${isAdmin ? '<th></th>' : ''}
            </tr>
          </thead>

          <tbody>
            ${users.map(u => `
              <tr>
                <td class="mono">${u.user_id}</td>
                <td><strong>${UI.esc(u.username)}</strong></td>
                <td>
                  <span class="badge ${
                    u.role === 'Administrator' ? 'blue' :
                    u.role === 'Read-only' ? 'grey' : 'green'
                  }">${UI.esc(u.role)}</span>
                </td>
                <td style="font-size:12px;color:var(--ink-soft)">
                  ${UI.fmtDate(u.created_at)}
                </td>

                ${isAdmin ? `
                  <td style="text-align:right">
                    ${u.user_id !== currentUser.user_id
                      ? `<button class="btn btn-sm btn-danger"
                           data-deluser="${u.user_id}">Delete</button>`
                      : '<span class="badge grey">Current User</span>'}
                  </td>
                ` : ''}
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    </div>
  `;

  if (!isAdmin) return;

  document.getElementById('addUser').onclick = () => {
    UI.modal({
      title: 'Register User',

      body: `
        <div class="field">
          <label>Username</label>
          <input id="uName" placeholder="juan">
        </div>

        <div class="field">
          <label>Password</label>
          <input id="uPass" type="password" placeholder="••••••••">
        </div>

        <div class="field">
          <label>Role</label>
          <select id="uRole">
            <option>Standard User</option>
            <option>Read-only</option>
            <option>Administrator</option>
          </select>
        </div>
      `,

      footer: `
        <button class="btn" data-close>Cancel</button>
        <button class="btn btn-primary" id="uGo">Register</button>
      `
    });

    document.getElementById('uGo').onclick = () => {
      const result = Auth.register(
        document.getElementById('uName').value.trim(),
        document.getElementById('uPass').value,
        document.getElementById('uRole').value
      );

      if (!result.ok) {
        UI.toast(result.error, 'err');
        return;
      }

      Store.save();
      UI.closeModal();
      UI.toast('User registered.', 'ok');
      render.users();
    };
  };

  document.querySelectorAll('[data-deluser]').forEach(button => {
    button.onclick = () => {
      const id = Number(button.dataset.deluser);
      const user = Store.userById(id);

      if (!user) {
        UI.toast('User account not found.', 'err');
        return;
      }

      UI.confirmDialog(
        'Delete Account',
        `Delete the account "${user.username}"?`,
        () => {
          const result = Auth.remove(id);

          if (!result.ok) {
            UI.toast(result.error, 'err');
            return;
          }

          Store.save();
          UI.toast('Account deleted.', 'ok');
          render.users();
        }
      );
    };
  });
};


/* ================= LOGS ================= */


render.logs = () => {
  const logs = Store.db.activity_logs;
  const isAdmin = Auth.isAdmin();

  document.getElementById('content').innerHTML = `
    <div class="toolbar">
      <span class="badge grey">
        ${logs.length} entr${logs.length === 1 ? 'y' : 'ies'}
      </span>

      <span class="spacer"></span>

      ${isAdmin ? `
        <button class="btn btn-danger" id="clearLogs">
          Clear Logs
        </button>
      ` : ''}
    </div>

    <div class="card">
      <div class="card-head">
        <div>
          <h3>Activity Log</h3>
          <p>Records of user actions and system activities</p>
        </div>
      </div>

      <div class="card-body" style="padding:0">
        ${logs.length ? `
          <div class="scroll-x">
            <table>
              <thead>
                <tr>
                  <th>#</th>
                  <th>User</th>
                  <th>Action</th>
                  <th>Timestamp</th>
                </tr>
              </thead>

              <tbody>
                ${logs.map(log => {
                  const user = Store.userById(log.user_id);
                  const action = String(log.action || 'Unknown action');
                  const denied = action.startsWith('DENIED');

                  return `
                    <tr>
                      <td class="mono">${UI.esc(log.log_id)}</td>

                      <td>
                        <strong>
                          ${UI.esc(user ? user.username : 'system')}
                        </strong>
                      </td>

                      <td>
                        ${denied
                          ? `<span class="badge red">${UI.esc(action)}</span>`
                          : UI.esc(action)
                        }
                      </td>

                      <td style="font-size:12px;color:var(--ink-soft);white-space:nowrap">
                        ${UI.fmtDate(log.timestamp)}
                      </td>
                    </tr>
                  `;
                }).join('')}
              </tbody>
            </table>
          </div>
        ` : `
          <div class="empty">
            No activity recorded yet.
          </div>
        `}
      </div>
    </div>
  `;

  const clearButton = document.getElementById('clearLogs');

  if (clearButton) {
    clearButton.onclick = () => {
      if (!Auth.isAdmin()) {
        UI.toast(
          'Only administrators can clear activity logs.',
          'err'
        );
        return;
      }

      UI.confirmDialog(
        'Clear Activity Logs',
        'Remove all activity log entries?',
        () => {
          Store.db.activity_logs = [];
          Store.save();

          UI.toast('Logs cleared.', 'ok');
          render.logs();
        },
        'Clear'
      );
    };
  }
};



/* ================= SETTINGS ================= */

render.settings = () => {
  const d = Store.db.virtual_disks[0];
  const isAdmin = Auth.isAdmin();

  document.getElementById('content').innerHTML = `
    <div class="grid cols-2">

      <div class="card">
        <div class="card-head">
          <h3>System Information</h3>
        </div>

        <div class="card-body">
          <dl class="kv">
            <dt>Disk name</dt>
            <dd>${UI.esc(d.disk_name)}</dd>

            <dt>Total capacity</dt>
            <dd>${d.total_capacity} KB</dd>

            <dt>Block size</dt>
            <dd>${d.block_size} KB</dd>

            <dt>Total blocks</dt>
            <dd>${Disk.totalBlocks()}</dd>

            <dt>Occupied</dt>
            <dd>${Disk.usedBlocks()} block(s)</dd>

            <dt>Free</dt>
            <dd>${Disk.freeBlocks()} block(s)</dd>

            <dt>Files</dt>
            <dd>${Store.db.files.length}</dd>

            <dt>Directories</dt>
            <dd>${Store.db.directories.length}</dd>

            <dt>Users</dt>
            <dd>${Store.db.users.length}</dd>

            <dt>Log entries</dt>
            <dd>${Store.db.activity_logs.length}</dd>
          </dl>
        </div>
      </div>

      <div class="card">
        <div class="card-head">
          <div>
            <h3>Data Management</h3>
            <p>Persistent storage is kept in the browser and survives restarts</p>
          </div>
        </div>

        <div class="card-body">
          <div class="hint" style="margin-bottom:16px">
            All system data, including users, directories, files,
            disk blocks, allocations, permissions and activity logs,
            is persisted in browser localStorage.
          </div>

          <div class="row" style="flex-wrap:wrap">
            <button class="btn" id="exportDb">
              Export Data (JSON)
            </button>

            ${isAdmin ? `
              <button class="btn btn-danger" id="resetDb">
                Reset System
              </button>
            ` : ''}
          </div>
        </div>
      </div>

    </div>
  `;

  // Export system data
  document.getElementById('exportDb').onclick = () => {
    const exportData = JSON.parse(
      JSON.stringify(Store.db)
    );

    // Remove password hashes from exported user records
    exportData.users = exportData.users.map(user => {
      const safeUser = { ...user };
      delete safeUser.password_hash;
      return safeUser;
    });

    const blob = new Blob(
      [JSON.stringify(exportData, null, 2)],
      { type: 'application/json' }
    );

    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');

    a.href = url;
    a.download = 'aos_file_system_data.json';

    document.body.appendChild(a);
    a.click();
    a.remove();

    setTimeout(() => URL.revokeObjectURL(url), 1000);

    UI.toast('Data exported successfully.', 'ok');
  };

  // Reset system — administrators only
  const resetButton = document.getElementById('resetDb');

  if (resetButton) {
    resetButton.onclick = () => {
      if (!Auth.isAdmin()) {
        UI.toast(
          'Only administrators can reset the system.',
          'err'
        );
        return;
      }

      UI.confirmDialog(
        'Reset System',
        'This deletes all files, directories, blocks and logs, and restores the default accounts. You will be logged out. Continue?',
        () => {
          Auth.logout();

          Store.reset();
          Disk.ensure();
          Store.save();

          currentDir = 1;
          selectedFileId = null;

          document.getElementById('app')
            .classList.add('hidden');

          document.getElementById('loginScreen')
            .classList.remove('hidden');

          document.getElementById('loginForm').reset();

          UI.toast('System reset to defaults.', 'ok');
        },
        'Reset'
      );
    };
  }
};

